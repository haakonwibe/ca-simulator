// tour.test.ts — Step-list integrity, the seen flag, and bubble placement.
//
// TourGuide itself is DOM work and untested here (this project has no component
// tests); everything it could get wrong arithmetically lives in positionBubble,
// which is why the geometry was extracted in the first place.

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  TOUR_STEPS,
  TOUR_SEEN_KEY,
  BUBBLE_GAP,
  VIEWPORT_MARGIN,
  hasSeenTour,
  markTourSeen,
  positionBubble,
  type Rect,
  type Size,
} from '../tour';

/** A 1280×800 desktop — below 768 the tour never opens. */
const VIEWPORT: Size = { width: 1280, height: 800 };
const BUBBLE: Size = { width: 320, height: 160 };

describe('TOUR_STEPS', () => {
  it('has an entry for every area the tour promises to cover', () => {
    expect(TOUR_STEPS.map((s) => s.id)).toEqual([
      'source',
      'scenario',
      'grid',
      'matrix',
      'sankey',
      'gaps',
      'impact',
      'baseline',
      'sandbox',
    ]);
  });

  it('uses unique ids and unique anchors', () => {
    expect(new Set(TOUR_STEPS.map((s) => s.id)).size).toBe(TOUR_STEPS.length);
    expect(new Set(TOUR_STEPS.map((s) => s.anchor)).size).toBe(TOUR_STEPS.length);
  });

  it('gives every step something to say', () => {
    for (const step of TOUR_STEPS) {
      expect(step.title.trim(), step.id).not.toBe('');
      expect(step.body.trim().length, step.id).toBeGreaterThan(20);
    }
  });

  it('anchors the six view tabs by their tab-* attributes', () => {
    // The other half of this pair is the data-tour attributes in
    // MainContent.tsx — a rename there without one here silently drops a step.
    const tabs = TOUR_STEPS.filter((s) => s.anchor.startsWith('tab-')).map((s) => s.anchor);
    expect(tabs).toEqual([
      'tab-grid',
      'tab-matrix',
      'tab-sankey',
      'tab-gaps',
      'tab-impact',
      'tab-baseline',
    ]);
  });
});

// ── The seen flag ──

function stubStorage(): Map<string, string> {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  return store;
}

describe('hasSeenTour / markTourSeen', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is false for a first-time visitor and true once marked', () => {
    const store = stubStorage();
    expect(hasSeenTour()).toBe(false);
    markTourSeen();
    expect(store.get(TOUR_SEEN_KEY)).toBe('true');
    expect(hasSeenTour()).toBe(true);
  });

  it('treats any other stored value as not seen', () => {
    const store = stubStorage();
    store.set(TOUR_SEEN_KEY, '1');
    expect(hasSeenTour()).toBe(false);
  });

  it('survives blocked storage rather than throwing on first paint', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('access denied');
      },
      setItem: () => {
        throw new Error('access denied');
      },
      removeItem: () => {},
    });
    expect(() => markTourSeen()).not.toThrow();
    expect(hasSeenTour()).toBe(false);
  });

  it('reports not-seen when there is no storage at all', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(hasSeenTour()).toBe(false);
    expect(() => markTourSeen()).not.toThrow();
  });
});

// ── Placement ──

/** True when the whole bubble sits inside the viewport, margin included. */
function isOnScreen(pos: { top: number; left: number }, bubble: Size, viewport: Size): boolean {
  return (
    pos.top >= VIEWPORT_MARGIN &&
    pos.left >= VIEWPORT_MARGIN &&
    pos.top + bubble.height <= viewport.height - VIEWPORT_MARGIN &&
    pos.left + bubble.width <= viewport.width - VIEWPORT_MARGIN
  );
}

describe('positionBubble', () => {
  it('honours the preferred side when there is room', () => {
    const anchor: Rect = { top: 100, left: 500, width: 80, height: 28 };
    const pos = positionBubble(anchor, BUBBLE, VIEWPORT, 'bottom');

    expect(pos.placement).toBe('bottom');
    expect(pos.top).toBe(anchor.top + anchor.height + BUBBLE_GAP);
    // Horizontally centred on the anchor
    expect(pos.left).toBe(anchor.left + anchor.width / 2 - BUBBLE.width / 2);
  });

  it('places the sidebar step to the right of the panel', () => {
    const sidebar: Rect = { top: 56, left: 0, width: 320, height: 700 };
    const pos = positionBubble(sidebar, BUBBLE, VIEWPORT, 'right');

    expect(pos.placement).toBe('right');
    expect(pos.left).toBe(sidebar.left + sidebar.width + BUBBLE_GAP);
    expect(isOnScreen(pos, BUBBLE, VIEWPORT)).toBe(true);
  });

  it('flips to another side when the preferred one has no room', () => {
    // An anchor near the bottom: 'bottom' would push the bubble off-screen.
    const anchor: Rect = { top: 760, left: 600, width: 80, height: 28 };
    const pos = positionBubble(anchor, BUBBLE, VIEWPORT, 'bottom');

    expect(pos.placement).not.toBe('bottom');
    expect(isOnScreen(pos, BUBBLE, VIEWPORT)).toBe(true);
  });

  it('keeps a bubble on screen for an anchor hard against the left edge', () => {
    const anchor: Rect = { top: 60, left: 4, width: 40, height: 24 };
    const pos = positionBubble(anchor, BUBBLE, VIEWPORT, 'bottom');

    expect(isOnScreen(pos, BUBBLE, VIEWPORT)).toBe(true);
  });

  it('keeps a bubble on screen for an anchor hard against the right edge', () => {
    const anchor: Rect = { top: 60, left: VIEWPORT.width - 44, width: 40, height: 24 };
    const pos = positionBubble(anchor, BUBBLE, VIEWPORT, 'bottom');

    expect(isOnScreen(pos, BUBBLE, VIEWPORT)).toBe(true);
  });

  it('never goes negative, even when the bubble is taller than the window', () => {
    const anchor: Rect = { top: 10, left: 10, width: 40, height: 24 };
    const tall: Size = { width: 320, height: 900 };
    const pos = positionBubble(anchor, tall, VIEWPORT, 'top');

    expect(pos.top).toBe(VIEWPORT_MARGIN);
    expect(pos.left).toBeGreaterThanOrEqual(VIEWPORT_MARGIN);
  });

  it('lands every real step on screen against a plausible layout', () => {
    // Rough stand-ins for where each anchor actually sits: the header row, the
    // sidebar, the tab bar. Enough to catch a step pointed somewhere useless.
    const layout: Record<string, Rect> = {
      'data-source': { top: 14, left: 560, width: 140, height: 26 },
      scenario: { top: 56, left: 0, width: 320, height: 700 },
      'tab-grid': { top: 62, left: 336, width: 62, height: 28 },
      'tab-matrix': { top: 62, left: 402, width: 74, height: 28 },
      'tab-sankey': { top: 62, left: 480, width: 62, height: 28 },
      'tab-gaps': { top: 62, left: 546, width: 62, height: 28 },
      'tab-impact': { top: 62, left: 612, width: 70, height: 28 },
      'tab-baseline': { top: 62, left: 686, width: 82, height: 28 },
      sandbox: { top: 14, left: 712, width: 96, height: 26 },
    };

    for (const step of TOUR_STEPS) {
      const anchor = layout[step.anchor];
      expect(anchor, `no layout stand-in for ${step.anchor}`).toBeDefined();
      const pos = positionBubble(anchor, BUBBLE, VIEWPORT, step.placement);
      expect(isOnScreen(pos, BUBBLE, VIEWPORT), step.id).toBe(true);
    }
  });
});
