// lib/tour.ts — Step definitions and geometry for the first-run guided tour.
//
// Everything here is pure: no React, no DOM reads. The component measures the
// page and hands the numbers to positionBubble(), which keeps the awkward part
// — a bubble that must not fall off the viewport — unit-testable.
//
// Step copy lives here rather than in JSX so the whole tour reads as one piece
// of writing, and so a step can be reordered without touching layout code.

export type TourPlacement = 'top' | 'right' | 'bottom' | 'left';

export interface TourStep {
  /** Stable identifier — used as a React key and in tests, never displayed. */
  id: string;
  /** Value of the `data-tour` attribute on the element to spotlight. */
  anchor: string;
  title: string;
  body: string;
  /** Preferred side; positionBubble falls back when it doesn't fit. */
  placement: TourPlacement;
}

/**
 * The tour, in order. A step whose anchor is absent from the DOM is skipped by
 * TourGuide rather than special-cased here — the sidebar is hidden on the
 * full-area views, the sandbox switch only exists once policies are loaded, and
 * the tab bar is replaced entirely by the consent banner on a 403.
 */
export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'source',
    anchor: 'data-source',
    title: 'Start here',
    body: 'Load the sample tenant to explore without signing in, or connect your own tenant to read its real policies. Neither one writes anything back.',
    placement: 'bottom',
  },
  {
    id: 'scenario',
    anchor: 'scenario',
    title: 'Describe a sign-in',
    body: 'Choose who is signing in, to which application, from which device and location. Everything to the right answers the question you set here.',
    placement: 'right',
  },
  {
    id: 'grid',
    anchor: 'tab-grid',
    title: 'Grid',
    body: 'Every policy as a tile, coloured by category and lit by how it landed on your scenario. Click a tile for the full condition breakdown.',
    placement: 'bottom',
  },
  {
    id: 'matrix',
    anchor: 'tab-matrix',
    title: 'Matrix',
    body: 'The same evaluation as a table — each policy against each condition — so you can see exactly which condition made a policy apply, or made it stand down.',
    placement: 'bottom',
  },
  {
    id: 'sankey',
    anchor: 'tab-sankey',
    title: 'Flow',
    body: 'The sign-in as a funnel, falling through the four evaluation phases from every policy down to the controls you actually have to satisfy.',
    placement: 'bottom',
  },
  {
    id: 'gaps',
    anchor: 'tab-gaps',
    title: 'Gaps',
    body: 'Sweeps thousands of sign-in combinations — platforms, clients, locations, risk levels — and reports the ones no policy protects.',
    placement: 'bottom',
  },
  {
    id: 'impact',
    anchor: 'tab-impact',
    title: 'Impact',
    body: 'Removes one policy at a time and re-runs every scenario, so you can see what protection you would lose before you turn something off.',
    placement: 'bottom',
  },
  {
    id: 'baseline',
    anchor: 'tab-baseline',
    title: 'Baseline',
    body: "Scores your policies against Microsoft's recommended templates, check by check, and drafts a fix for anything that falls short.",
    placement: 'bottom',
  },
  {
    id: 'sandbox',
    anchor: 'sandbox',
    title: 'Sandbox',
    body: 'Switch this on to change policies hypothetically and compare against live. The app holds no write permissions — changes leave as an export you apply yourself.',
    placement: 'bottom',
  },
];

/**
 * Below this the tour does not run. It is MobileNotice's breakpoint, and the
 * two must not both own the screen — on a narrow viewport the sidebar the tour
 * points at is off-screen anyway.
 */
export const TOUR_MIN_WIDTH = 768;

// --- Persistence ------------------------------------------------------------

/**
 * The second of the app's two localStorage keys (the other is the analytics
 * opt-out in lib/analytics.ts). A boolean preference, not an identifier: it
 * holds the literal string 'true' and is never sent anywhere.
 *
 * Deliberately NOT cleared on logout — having seen the tour is a fact about
 * this browser, not about the tenant that was signed in at the time.
 */
export const TOUR_SEEN_KEY = 'ca-sim:tour-seen';

export function hasSeenTour(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(TOUR_SEEN_KEY) === 'true';
  } catch {
    // Storage blocked (private mode, cookies disabled). Showing the tour again
    // is a far smaller cost than crashing the app on first paint.
    return false;
  }
}

export function markTourSeen(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(TOUR_SEEN_KEY, 'true');
  } catch {
    // Storage blocked — the tour will offer itself again next visit.
  }
}

// --- Geometry ---------------------------------------------------------------

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface BubblePosition {
  top: number;
  left: number;
  /** The side actually used — may differ from the preference. */
  placement: TourPlacement;
}

/** Distance between the spotlight edge and the bubble. */
export const BUBBLE_GAP = 14;
/** Minimum distance between the bubble and the edge of the window. */
export const VIEWPORT_MARGIN = 12;

/** Order to try when the preferred side has no room. */
const FALLBACK_ORDER: readonly TourPlacement[] = ['bottom', 'right', 'top', 'left'];

function clamp(value: number, min: number, max: number): number {
  // max < min when the bubble is larger than the space available; pinning to
  // min keeps the readable end of the bubble on screen.
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function place(anchor: Rect, bubble: Size, placement: TourPlacement): { top: number; left: number } {
  switch (placement) {
    case 'top':
      return {
        top: anchor.top - bubble.height - BUBBLE_GAP,
        left: anchor.left + anchor.width / 2 - bubble.width / 2,
      };
    case 'bottom':
      return {
        top: anchor.top + anchor.height + BUBBLE_GAP,
        left: anchor.left + anchor.width / 2 - bubble.width / 2,
      };
    case 'left':
      return {
        top: anchor.top + anchor.height / 2 - bubble.height / 2,
        left: anchor.left - bubble.width - BUBBLE_GAP,
      };
    case 'right':
      return {
        top: anchor.top + anchor.height / 2 - bubble.height / 2,
        left: anchor.left + anchor.width + BUBBLE_GAP,
      };
  }
}

/** Does this side clear the window edge it opens toward? */
function fits(pos: { top: number; left: number }, bubble: Size, viewport: Size, placement: TourPlacement): boolean {
  switch (placement) {
    case 'top':
      return pos.top >= VIEWPORT_MARGIN;
    case 'bottom':
      return pos.top + bubble.height + VIEWPORT_MARGIN <= viewport.height;
    case 'left':
      return pos.left >= VIEWPORT_MARGIN;
    case 'right':
      return pos.left + bubble.width + VIEWPORT_MARGIN <= viewport.width;
  }
}

/**
 * Places the bubble beside its anchor, preferring the requested side, falling
 * back to any side with room, and finally clamping into the viewport.
 *
 * Coordinates are viewport-relative, matching getBoundingClientRect(), so the
 * caller renders with `position: fixed` and does no scroll arithmetic.
 */
export function positionBubble(
  anchor: Rect,
  bubble: Size,
  viewport: Size,
  preferred: TourPlacement,
): BubblePosition {
  const candidates = [preferred, ...FALLBACK_ORDER.filter((p) => p !== preferred)];
  const chosen = candidates.find((p) => fits(place(anchor, bubble, p), bubble, viewport, p)) ?? preferred;
  const pos = place(anchor, bubble, chosen);

  return {
    top: clamp(pos.top, VIEWPORT_MARGIN, viewport.height - bubble.height - VIEWPORT_MARGIN),
    left: clamp(pos.left, VIEWPORT_MARGIN, viewport.width - bubble.width - VIEWPORT_MARGIN),
    placement: chosen,
  };
}
