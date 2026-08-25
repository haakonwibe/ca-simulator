// lib/analytics.ts — The only module that may import @vercel/analytics.
//
// This app is pointed at real tenants, so the risk of product analytics is not
// volume, it is leakage: a single track('policy_viewed', { name: policy.displayName })
// would ship a customer's Conditional Access policy names to a third party.
//
// The defence is an enum-only allowlist enforced at RUNTIME. TypeScript unions
// vanish at compile time, and at least one value (baseline check ids) arrives
// as a plain string, so isAllowed() — not the type system — is what actually
// holds the line. Events whose props don't match the allowlist exactly, key
// for key and value for value, are dropped rather than sent.
//
// Nothing derived from tenant data may ever be added here: no policy, app,
// group, user or tenant names, no GUIDs, no counts (a policy count plus
// Vercel's country dimension is close to identifying).

// TWO TRANSPORTS, deliberately (2026-08-22):
//
//   page views     -> Vercel Web Analytics, via <Analytics/> in main.tsx
//   product events -> our own Umami instance, via send() below
//
// Vercel's Hobby plan supports no custom events, which is why the events below
// never went anywhere until now. It does do page views well, so it keeps that
// job; Umami takes the events. beforeSend() is what stops the two drifting
// apart: without it, opting out would silence Umami while page views continued.
//
// The Umami half posts to /api/e, a same-origin edge function (api/e.ts) that
// relays to our instance. The address lives in the UMAMI_URL environment
// variable rather than in a committed file, because this repo is mirrored
// publicly.
//
// No tracker script is loaded. Umami's /api/send takes a plain POST with no auth
// token, so this module talks to it directly. That keeps script-src at 'self'
// with zero third-party JavaScript, leaves autocapture and auto-pageviews with
// no surface to exist on, and means an ad blocker sees a same-origin request to
// a path it has never heard of — which matters when your audience is security
// admins. Because the instance is ours, there is no subprocessor to disclose.
//
// Umami's payload also accepts referrer, screen, language, title and the real
// url. Every one is deliberately omitted: none are needed to answer "is this
// feature used", and each is a fingerprinting surface on an app whose users are
// identifiable by tenant. `url` is sent as a constant '/'.
//
// Referrer is the one that matters most, and it is why it is not sent here even
// though it would be useful: someone linking this tool from an internal wiki
// puts `https://<customer>.sharepoint.com` in that field. The allowlist cannot
// catch that, because it arrives as a header rather than a prop.

import { BASELINE_CHECKS } from '@/data/baselineChecks';

export type AnalyticsMode = 'live' | 'sample';
export type AnalyticsView = 'grid' | 'matrix' | 'sankey' | 'gaps' | 'impact' | 'baseline';
/** Did the user ask for this, or did state change underneath them? */
export type EventTrigger = 'auto' | 'manual';

/** Every event the app may emit. Props are closed sets — see ALLOWED. */
export type AppEvent =
  | { name: 'view_opened'; props: { view: AnalyticsView; mode: AnalyticsMode } }
  | { name: 'source_chosen'; props: { mode: AnalyticsMode } }
  | { name: 'load_outcome'; props: { outcome: 'ok' | 'consent_required' | 'error' } }
  | { name: 'sandbox'; props: { step: 'entered' | 'changed' | 'diffed' | 'reset' } }
  | { name: 'baseline_fix'; props: { checkId: string } }
  | { name: 'export'; props: { format: 'summary' | 'powershell' | 'json'; action: 'copy' | 'download' } }
  | { name: 'evaluated'; props: { mode: AnalyticsMode; trigger: EventTrigger } }
  | {
      name: 'analysis_run';
      props: {
        view: 'gaps' | 'impact';
        trigger: EventTrigger;
        /** Mirrors GapPersonaSource; impact has no persona dimension. */
        personas: 'generic' | 'selected' | 'resolved' | 'not_applicable';
      };
    }
  | { name: 'app_error'; props: { source: 'uncaught' | 'promise' } }
  | { name: 'tour'; props: { step: 'started' | 'completed' | 'dismissed' } };

const MODES = ['live', 'sample'] as const;
const VIEWS = ['grid', 'matrix', 'sankey', 'gaps', 'impact', 'baseline'] as const;
const OUTCOMES = ['ok', 'consent_required', 'error'] as const;
const SANDBOX_STEPS = ['entered', 'changed', 'diffed', 'reset'] as const;
const EXPORT_FORMATS = ['summary', 'powershell', 'json'] as const;
const EXPORT_ACTIONS = ['copy', 'download'] as const;
const TRIGGERS = ['auto', 'manual'] as const;
const ANALYSIS_VIEWS = ['gaps', 'impact'] as const;
const PERSONA_SOURCES = ['generic', 'selected', 'resolved', 'not_applicable'] as const;
const ERROR_SOURCES = ['uncaught', 'promise'] as const;
const TOUR_STEPS_EMITTED = ['started', 'completed', 'dismissed'] as const;

/** Check ids come from the catalog, so adding a check can't break the button. */
const BASELINE_CHECK_IDS: readonly string[] = BASELINE_CHECKS.map((c) => c.id);

/**
 * The allowlist. Every emittable event name maps to its props, and every prop
 * maps to the complete set of values it may carry. This object IS the privacy
 * claim on the privacy page — keep the two in sync.
 */
export const ALLOWED: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  view_opened: { view: VIEWS, mode: MODES },
  source_chosen: { mode: MODES },
  load_outcome: { outcome: OUTCOMES },
  sandbox: { step: SANDBOX_STEPS },
  baseline_fix: { checkId: BASELINE_CHECK_IDS },
  export: { format: EXPORT_FORMATS, action: EXPORT_ACTIONS },
  evaluated: { mode: MODES, trigger: TRIGGERS },
  analysis_run: { view: ANALYSIS_VIEWS, trigger: TRIGGERS, personas: PERSONA_SOURCES },
  app_error: { source: ERROR_SOURCES },
  tour: { step: TOUR_STEPS_EMITTED },
};

/**
 * Pure predicate — the runtime gate. Requires an exact key match in both
 * directions so an extra prop (the leak vector) is rejected, not ignored.
 */
export function isAllowed(name: string, props: Record<string, unknown>): boolean {
  const spec = ALLOWED[name];
  if (!spec) return false;

  const expected = Object.keys(spec);
  const actual = Object.keys(props);
  if (expected.length !== actual.length) return false;

  for (const key of expected) {
    const value = props[key];
    if (typeof value !== 'string') return false;
    if (!spec[key].includes(value)) return false;
  }
  return true;
}

// --- Opt-out ----------------------------------------------------------------

/**
 * One of the app's two localStorage keys (the other is the tour-seen flag in
 * lib/tour.ts). A preference flag, not an identifier — it holds the literal
 * string 'true' and nothing else. Deliberately NOT cleared by the logout
 * store-clearing in useAuthStore: it is the user's choice, not tenant data.
 */
export const ANALYTICS_OPT_OUT_KEY = 'ca-sim:analytics-opt-out';

/** Browser-level Do Not Track, across the three spellings still in the wild. */
export function isDoNotTrackEnabled(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { msDoNotTrack?: string };
  const win = typeof window === 'undefined' ? undefined : (window as Window & { doNotTrack?: string });
  const signal = nav.doNotTrack ?? win?.doNotTrack ?? nav.msDoNotTrack;
  return signal === '1' || signal === 'yes';
}

export function hasOptedOut(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(ANALYTICS_OPT_OUT_KEY) === 'true';
  } catch {
    return false; // storage blocked (private mode, cookies disabled)
  }
}

export function setOptedOut(optedOut: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (optedOut) {
      localStorage.setItem(ANALYTICS_OPT_OUT_KEY, 'true');
    } else {
      localStorage.removeItem(ANALYTICS_OPT_OUT_KEY);
    }
  } catch {
    // storage blocked — the DNT check and beforeSend gate still apply
  }
}

/**
 * DNT wins over the in-app toggle: a browser-level refusal is not overridable.
 * The browser check is load-bearing, not defensive — the endpoint is a relative
 * path, which cannot be resolved outside a browser, so without it every store
 * test touching the sandbox would fail.
 */
export function isAnalyticsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return !isDoNotTrackEnabled() && !hasOptedOut();
}

// --- Emission ---------------------------------------------------------------

// The sandbox emits one 'changed' per session, not one per chip toggle.
let hasTrackedSandboxChange = false;

export function trackEvent(event: AppEvent): void {
  if (!isAnalyticsEnabled()) return;
  if (!isAllowed(event.name, event.props)) return;

  if (event.name === 'sandbox') {
    if (event.props.step === 'changed') {
      if (hasTrackedSandboxChange) return;
      hasTrackedSandboxChange = true;
    } else if (event.props.step === 'entered' || event.props.step === 'reset') {
      hasTrackedSandboxChange = false;
    }
  }

  send(event.name, event.props);
}

/** Same-origin path; vercel.json rewrites it to our Umami instance. */
const ANALYTICS_ENDPOINT = '/api/e';

/**
 * Not a secret. A Umami website id is public by construction — it ships inside
 * the tracker script tag on every site that uses one. It identifies the site,
 * not a visitor, and grants no read access to the dashboard.
 */
const UMAMI_WEBSITE_ID = 'c1726bec-39be-4544-97a1-ba25209fd0e8';

/**
 * Fire-and-forget. Analytics must never block a user action, surface an error,
 * or reject a promise: `keepalive` lets the request outlive the page so an
 * event fired on navigation still lands, and the catch swallows offline,
 * blocked and rewrite-misconfigured alike. A dropped event is not worth a
 * console error on a security tool.
 */
function send(name: string, data: Record<string, string>): void {
  try {
    void fetch(ANALYTICS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        type: 'event',
        payload: { website: UMAMI_WEBSITE_ID, name, data, url: '/' },
      }),
    }).catch(() => {});
  } catch {
    // fetch itself can throw synchronously on a malformed request
  }
}

/**
 * Backstop wired into <Analytics /> in main.tsx. The Vercel BeforeSendEvent
 * carries only { type, url } — it cannot see event names, so allowlisting stays
 * the job of trackEvent(). What this DOES cover is page views, which the Vercel
 * script sends on its own: without it, opting out or setting DNT would silence
 * the Umami events while page views kept flowing. It also drops query strings,
 * which this app never sets but a future deep link might.
 */
export function beforeSend<T extends { url: string }>(event: T): T | null {
  if (!isAnalyticsEnabled()) return null;
  const [url] = event.url.split('?');
  return { ...event, url };
}

// A crash loop could fire hundreds of times; the signal is "it happened".
const MAX_ERRORS_PER_SESSION = 3;
let errorsTracked = 0;

/**
 * Counts uncaught errors and rejections. There is no React error boundary in
 * this app (AuthErrorBanner is a functional component by design, since MSAL
 * failures are async), so without this a white screen is invisible.
 *
 * Only the fact and kind are sent — never the message, stack, or filename.
 * Those ARE read locally to filter out browser-extension and third-party noise,
 * which would otherwise drown the signal; reading is not transmitting.
 */
export function installErrorTracking(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event) => {
    if (errorsTracked >= MAX_ERRORS_PER_SESSION) return;
    // Extensions and third-party scripts say nothing about this app's health.
    if (event.filename && !event.filename.startsWith(window.location.origin)) return;
    errorsTracked++;
    trackEvent({ name: 'app_error', props: { source: 'uncaught' } });
  });

  window.addEventListener('unhandledrejection', () => {
    if (errorsTracked >= MAX_ERRORS_PER_SESSION) return;
    errorsTracked++; // rejections carry no filename — origin can't be checked
    trackEvent({ name: 'app_error', props: { source: 'promise' } });
  });
}

/** Test seam — resets the per-session sandbox dedupe. */
export function resetSandboxChangeTracking(): void {
  hasTrackedSandboxChange = false;
}
