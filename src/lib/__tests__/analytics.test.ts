// lib/__tests__/analytics.test.ts — Analytics allowlist tests.
//
// The point of these tests is leakage, not coverage: isAllowed() is the runtime
// gate that stops tenant data reaching a third party, and it is the only gate
// that exists at runtime. Every "must be rejected" case below represents a real
// way policy names, GUIDs or tenant identifiers could otherwise escape.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ALLOWED,
  isAllowed,
  trackEvent,
  beforeSend,
  setOptedOut,
  isAnalyticsEnabled,
  resetSandboxChangeTracking,
  type AppEvent,
} from '../analytics';
import { BASELINE_CHECKS } from '@/data/baselineChecks';

// The network boundary is mocked; our own logic never is.
const mockFetch = vi.fn((_url: string, _init?: RequestInit) =>
  Promise.resolve(new Response(null, { status: 200 })),
);

/** The (name, props) pairs actually put on the wire, read back out of the payloads. */
function sent(): [string, Record<string, string>][] {
  return mockFetch.mock.calls.map((call) => {
    const body = JSON.parse(call[1]?.body as string);
    return [body.payload.name, body.payload.data];
  });
}

// Every event the app is allowed to emit, with representative values.
const VALID_EVENTS: AppEvent[] = [
  { name: 'view_opened', props: { view: 'grid', mode: 'sample' } },
  { name: 'view_opened', props: { view: 'baseline', mode: 'live' } },
  { name: 'source_chosen', props: { mode: 'live' } },
  { name: 'load_outcome', props: { outcome: 'ok' } },
  { name: 'load_outcome', props: { outcome: 'consent_required' } },
  { name: 'load_outcome', props: { outcome: 'error' } },
  { name: 'sandbox', props: { step: 'entered' } },
  { name: 'sandbox', props: { step: 'changed' } },
  { name: 'sandbox', props: { step: 'diffed' } },
  { name: 'sandbox', props: { step: 'reset' } },
  { name: 'baseline_fix', props: { checkId: 'require-mfa-admins' } },
  { name: 'export', props: { format: 'powershell', action: 'download' } },
  { name: 'export', props: { format: 'json', action: 'copy' } },
  { name: 'evaluated', props: { mode: 'live', trigger: 'manual' } },
  { name: 'evaluated', props: { mode: 'sample', trigger: 'auto' } },
  { name: 'analysis_run', props: { view: 'gaps', trigger: 'manual', personas: 'resolved' } },
  { name: 'analysis_run', props: { view: 'impact', trigger: 'auto', personas: 'not_applicable' } },
  { name: 'app_error', props: { source: 'uncaught' } },
  { name: 'app_error', props: { source: 'promise' } },
];

describe('isAllowed — accepts the declared event surface', () => {
  it.each(VALID_EVENTS)('accepts $name with $props', (event) => {
    expect(isAllowed(event.name, event.props)).toBe(true);
  });

  it('accepts every id in the baseline catalog', () => {
    // Guards drift: adding a check to baselineChecks.ts must not silently
    // break the Fix-in-sandbox event.
    for (const check of BASELINE_CHECKS) {
      expect(isAllowed('baseline_fix', { checkId: check.id })).toBe(true);
    }
  });
});

describe('isAllowed — rejects anything outside the allowlist', () => {
  it('rejects an unknown event name', () => {
    expect(isAllowed('policy_viewed', { name: 'CA001 - Require MFA' })).toBe(false);
    expect(isAllowed('', {})).toBe(false);
  });

  it('rejects free-form values in every event family', () => {
    expect(isAllowed('view_opened', { view: 'Finance Policies', mode: 'live' })).toBe(false);
    expect(isAllowed('source_chosen', { mode: 'contoso.onmicrosoft.com' })).toBe(false);
    expect(isAllowed('load_outcome', { outcome: 'Insufficient privileges to complete the operation' })).toBe(false);
    expect(isAllowed('sandbox', { step: 'CA012 - Block legacy auth' })).toBe(false);
    expect(isAllowed('export', { format: 'summary', action: 'a1b2c3d4-0000-0000-0000-000000000000' })).toBe(false);
    expect(isAllowed('evaluated', { mode: 'live', trigger: 'blocked' })).toBe(false);
    expect(isAllowed('analysis_run', { view: 'gaps', trigger: 'manual', personas: 'Alex Johnson' })).toBe(false);
  });

  it('rejects an error message on app_error — the highest-risk leak', () => {
    // Graph and MSAL error text can name tenants, users and policies.
    expect(
      isAllowed('app_error', { source: 'uncaught', message: "Cannot read 'displayName' of undefined" }),
    ).toBe(false);
    expect(isAllowed('app_error', { source: "TypeError at CA001 handler" })).toBe(false);
  });

  it('rejects a verdict or scenario on evaluated', () => {
    // The privacy page promises simulation scenarios and results are not logged.
    expect(isAllowed('evaluated', { mode: 'live', trigger: 'manual', verdict: 'block' })).toBe(false);
    expect(isAllowed('evaluated', { mode: 'live', trigger: 'manual', app: 'Office 365' })).toBe(false);
  });

  it('rejects a baseline check id that is not in the catalog', () => {
    expect(isAllowed('baseline_fix', { checkId: 'Require MFA for Finance' })).toBe(false);
    expect(isAllowed('baseline_fix', { checkId: '' })).toBe(false);
  });

  it('rejects extra props — the leak vector', () => {
    // The shape is right and every declared value is legal; the smuggled prop
    // is the whole problem, so ignoring it is not good enough.
    expect(
      isAllowed('view_opened', { view: 'grid', mode: 'live', tenantName: 'Contoso' }),
    ).toBe(false);
    expect(
      isAllowed('load_outcome', { outcome: 'error', policyCount: '47' }),
    ).toBe(false);
  });

  it('rejects missing props', () => {
    expect(isAllowed('view_opened', { view: 'grid' })).toBe(false);
    expect(isAllowed('export', { format: 'json' })).toBe(false);
  });

  it('rejects non-string values', () => {
    // track() accepts numbers and booleans; the allowlist deliberately does not.
    expect(isAllowed('load_outcome', { outcome: 42 as unknown as string })).toBe(false);
    expect(isAllowed('sandbox', { step: null as unknown as string })).toBe(false);
    expect(isAllowed('view_opened', { view: undefined as unknown as string, mode: 'live' })).toBe(false);
  });
});

describe('ALLOWED — stays in step with the rest of the app', () => {
  it('declares no value that looks like free text', () => {
    // Every allowed value except baseline check ids is a lowercase enum token.
    // Baseline ids are kebab-case slugs from our own catalog, never tenant data.
    for (const [name, spec] of Object.entries(ALLOWED)) {
      for (const [prop, values] of Object.entries(spec)) {
        for (const value of values) {
          expect(value, `${name}.${prop}`).toMatch(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/);
        }
      }
    }
  });

  it('keeps analysis_run personas in step with GapPersonaSource', () => {
    // gapAnalysis.ts owns these three; 'not_applicable' covers the impact sweep.
    expect(ALLOWED.analysis_run.personas).toEqual([
      'generic',
      'selected',
      'resolved',
      'not_applicable',
    ]);
  });

  it('covers exactly the six view ids the tab bar renders', () => {
    // Mirrors useEvaluationStore.activeView — a new tab must be added here too.
    expect(ALLOWED.view_opened.view).toEqual([
      'grid',
      'matrix',
      'sankey',
      'gaps',
      'impact',
      'baseline',
    ]);
  });
});

// ── Emission ──
//
// Asserts the gates directly: nothing disallowed reaches track(), and both
// opt-out paths produce zero calls.

/** Minimal browser globals — vitest runs in node, where analytics is off by design. */
function stubBrowser(doNotTrack: string | undefined = undefined) {
  const store = new Map<string, string>();
  vi.stubGlobal('window', { doNotTrack: undefined });
  vi.stubGlobal('navigator', { doNotTrack });
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal('fetch', mockFetch);
}

describe('trackEvent', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    resetSandboxChangeTracking();
    stubBrowser();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is a no-op outside a browser — a relative endpoint cannot resolve there', () => {
    vi.unstubAllGlobals();
    expect(isAnalyticsEnabled()).toBe(false);
    trackEvent({ name: 'source_chosen', props: { mode: 'live' } });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends an allowed event with its exact props', () => {
    trackEvent({ name: 'view_opened', props: { view: 'gaps', mode: 'live' } });
    expect(sent()).toEqual([['view_opened', { view: 'gaps', mode: 'live' }]]);
  });

  it('emits one sandbox "changed" per session, not one per edit', () => {
    trackEvent({ name: 'sandbox', props: { step: 'entered' } });
    for (let i = 0; i < 5; i++) trackEvent({ name: 'sandbox', props: { step: 'changed' } });
    expect(sent().filter(([, p]) => p.step === 'changed')).toHaveLength(1);

    // Re-entering the sandbox starts a fresh session
    trackEvent({ name: 'sandbox', props: { step: 'entered' } });
    trackEvent({ name: 'sandbox', props: { step: 'changed' } });
    expect(sent().filter(([, p]) => p.step === 'changed')).toHaveLength(2);
  });

  it('sends the evaluate trigger so auto and manual runs stay separable', () => {
    trackEvent({ name: 'evaluated', props: { mode: 'sample', trigger: 'auto' } });
    trackEvent({ name: 'evaluated', props: { mode: 'sample', trigger: 'manual' } });
    expect(sent().map(([, p]) => p.trigger)).toEqual(['auto', 'manual']);
    // Unlike sandbox 'changed', evaluations are not deduped — repeat runs count.
    trackEvent({ name: 'evaluated', props: { mode: 'sample', trigger: 'manual' } });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('sends nothing once the user opts out', () => {
    setOptedOut(true);
    expect(isAnalyticsEnabled()).toBe(false);
    trackEvent({ name: 'export', props: { format: 'json', action: 'copy' } });
    expect(mockFetch).not.toHaveBeenCalled();

    setOptedOut(false);
    trackEvent({ name: 'export', props: { format: 'json', action: 'copy' } });
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('sends nothing when the browser signals Do Not Track', () => {
    stubBrowser('1');
    expect(isAnalyticsEnabled()).toBe(false);
    trackEvent({ name: 'load_outcome', props: { outcome: 'ok' } });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('cannot be overridden by opting back in while DNT is set', () => {
    stubBrowser('1');
    setOptedOut(false);
    trackEvent({ name: 'load_outcome', props: { outcome: 'ok' } });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('transport — what actually goes on the wire', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    stubBrowser();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('posts JSON to the same-origin path, never a third-party host', () => {
    trackEvent({ name: 'load_outcome', props: { outcome: 'ok' } });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/e');
    expect(url.startsWith('http')).toBe(false);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(init?.keepalive).toBe(true);
  });

  it('sends only website, name, data and a constant url', () => {
    trackEvent({ name: 'view_opened', props: { view: 'baseline', mode: 'live' } });
    const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);

    expect(body.type).toBe('event');
    expect(Object.keys(body).sort()).toEqual(['payload', 'type']);
    // Umami accepts referrer, screen, language and title too — each is a
    // fingerprinting surface, so none may appear here.
    expect(Object.keys(body.payload).sort()).toEqual(['data', 'name', 'url', 'website']);
    expect(body.payload.url).toBe('/');
    expect(body.payload.data).toEqual({ view: 'baseline', mode: 'live' });
  });

  it('never sends the real page URL', () => {
    vi.stubGlobal('window', {
      doNotTrack: undefined,
      location: { href: 'https://ca.example.com/?tenant=contoso' },
    });
    trackEvent({ name: 'load_outcome', props: { outcome: 'ok' } });
    const raw = mockFetch.mock.calls[0][1]?.body as string;
    expect(raw).not.toContain('contoso');
    expect(raw).not.toContain('ca.example.com');
  });

  it('stays silent when the network fails — analytics never surfaces an error', () => {
    mockFetch.mockReturnValueOnce(Promise.reject(new Error('offline')));
    expect(() => trackEvent({ name: 'load_outcome', props: { outcome: 'ok' } })).not.toThrow();
  });

  it('stays silent when fetch throws synchronously', () => {
    mockFetch.mockImplementationOnce(() => {
      throw new Error('blocked');
    });
    expect(() => trackEvent({ name: 'load_outcome', props: { outcome: 'ok' } })).not.toThrow();
  });

  it('drops a rejected event before it reaches the network', () => {
    // @ts-expect-error — deliberately outside the allowlist
    trackEvent({ name: 'view_opened', props: { view: 'grid', mode: 'live', tenant: 'contoso' } });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('beforeSend — the Vercel page-view gate', () => {
  beforeEach(() => stubBrowser());
  afterEach(() => vi.unstubAllGlobals());

  it('drops query strings', () => {
    expect(beforeSend({ url: 'https://ca.example.com/?tenant=contoso' })).toEqual({
      url: 'https://ca.example.com/',
    });
  });

  it('blocks page views too when opted out', () => {
    setOptedOut(true);
    expect(beforeSend({ url: 'https://ca.example.com/' })).toBeNull();
  });

  it('blocks page views under Do Not Track', () => {
    stubBrowser('1');
    expect(beforeSend({ url: 'https://ca.example.com/' })).toBeNull();
  });

  it('gates both transports on the same switch', () => {
    // The point of keeping this: one opt-out must stop page views AND events.
    setOptedOut(true);
    mockFetch.mockClear();
    trackEvent({ name: 'view_opened', props: { view: 'grid', mode: 'live' } });
    expect(beforeSend({ url: 'https://ca.example.com/' })).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
    setOptedOut(false);
  });
});
