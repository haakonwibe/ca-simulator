// components/TourGuide.tsx — First-run guided tour overlay.
//
// Points and explains; it never clicks anything. No store is touched, no view
// is switched, no evaluation runs — so the tour is identical before and after
// data is loaded, and leaves the user exactly where they were.
//
// Targets are found by their `data-tour` attribute rather than by ref-passing,
// which keeps the anchors to a single attribute on elements that already exist.
// Steps whose anchor is absent are dropped when the tour opens: the sidebar is
// hidden on Gaps/Impact/Baseline, the sandbox switch only exists once policies
// are loaded, and a 403 replaces the tab bar entirely.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COLORS } from '@/data/theme';
import { trackEvent } from '@/lib/analytics';
import {
  TOUR_MIN_WIDTH,
  TOUR_STEPS,
  markTourSeen,
  positionBubble,
  type BubblePosition,
  type Rect,
  type TourStep,
} from '@/lib/tour';

/** Breathing room between the spotlight ring and the element it surrounds. */
const SPOTLIGHT_PAD = 6;

const BUBBLE_WIDTH = 320;

interface TourGuideProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Presence in the DOM is not enough. AppLayout hides the sidebar with a
 * `display: none` wrapper rather than unmounting it — ScenarioPanel's form
 * state is local useState and has to survive a switch to Gaps — so the <aside>
 * is still queryable while occupying no space at all. getClientRects() is what
 * distinguishes the two, and it also rules out a zero-size element there is
 * nothing to point at.
 */
function findAnchor(anchor: string): HTMLElement | null {
  const el = document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`);
  if (!el || el.getClientRects().length === 0) return null;
  return el;
}

export function TourGuide({ open, onClose }: TourGuideProps) {
  const [steps, setSteps] = useState<readonly TourStep[]>([]);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [pos, setPos] = useState<BubblePosition | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);

  // AppLayout passes an inline arrow, so onClose is a new function every
  // render. Held in a ref, the effects below can call it without listing it as
  // a dependency — which would re-run them on every render, and turn "close
  // when there is nothing to show" into a loop.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const step: TourStep | undefined = steps[index];
  const total = steps.length;
  const isLast = index === total - 1;

  // Opening resolves the step list against the DOM as it is right now.
  useEffect(() => {
    if (!open) {
      setSteps([]);
      return;
    }
    const visible = TOUR_STEPS.filter((s) => findAnchor(s.anchor) !== null);
    if (visible.length === 0) {
      // Nothing on screen to point at. Close without setting the seen flag, so
      // a later visit still gets the tour.
      onCloseRef.current();
      return;
    }
    setSteps(visible);
    setIndex(0);
    setRect(null);
    setPos(null);
    trackEvent({ name: 'tour', props: { step: 'started' } });
  }, [open]);

  const finish = useCallback(
    (reason: 'completed' | 'dismissed') => {
      // Having been shown is the contract; finishing is not required.
      markTourSeen();
      trackEvent({ name: 'tour', props: { step: reason } });
      onCloseRef.current();
    },
    [],
  );

  const next = useCallback(() => {
    // Not the updater form: advancing past the last step has a side effect, and
    // updaters can run twice under StrictMode.
    if (index >= total - 1) {
      finish('completed');
      return;
    }
    setIndex(index + 1);
  }, [index, total, finish]);

  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Measure after commit so the bubble's height reflects THIS step's text.
  const measure = useCallback(() => {
    if (!step) return;
    const el = findAnchor(step.anchor);
    if (!el) {
      // The anchor vanished mid-tour (a view switch behind the overlay). Drop
      // the spotlight rather than pointing at a stale rectangle.
      setRect(null);
      setPos(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const anchor: Rect = { top: r.top, left: r.left, width: r.width, height: r.height };
    const bubble = {
      width: bubbleRef.current?.offsetWidth ?? BUBBLE_WIDTH,
      height: bubbleRef.current?.offsetHeight ?? 160,
    };
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    setRect(anchor);
    setPos(positionBubble(anchor, bubble, viewport, step.placement));
  }, [step]);

  useLayoutEffect(() => {
    if (!open || !step) return;
    measure();
  }, [open, step, measure]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => measure();
    const onResize = () => {
      if (window.innerWidth < TOUR_MIN_WIDTH) {
        // MobileNotice takes the screen from here. Close without marking seen,
        // so a later visit on a wide window still gets the tour.
        onCloseRef.current();
        return;
      }
      measure();
    };
    window.addEventListener('resize', onResize);
    // Capture phase: the panels that scroll are nested, and their scroll events
    // do not bubble to window.
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish('dismissed');
      } else if (e.key === 'ArrowRight') {
        // Enter and Space are left alone: with focus on Back or Next they
        // already activate that button, and handling them here too would
        // advance twice.
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        back();
      } else if (e.key === 'Tab') {
        // The overlay blocks the pointer, so aria-modal is only honest if Tab
        // cannot walk out of the bubble into the dimmed page behind it.
        const buttons = Array.from(bubbleRef.current?.querySelectorAll('button') ?? []);
        if (buttons.length === 0) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === bubbleRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, next, back, finish]);

  // Move focus to the bubble on each step so a keyboard user hears the copy.
  useEffect(() => {
    if (open && step) bubbleRef.current?.focus();
  }, [open, step]);

  const bubbleStyle = useMemo(() => {
    if (pos) return { top: pos.top, left: pos.left };
    // No anchor to hang off — centre it rather than pinning to a corner.
    return {
      top: Math.max(12, window.innerHeight / 2 - 90),
      left: Math.max(12, window.innerWidth / 2 - BUBBLE_WIDTH / 2),
    };
  }, [pos]);

  if (!open || !step) return null;

  return (
    <div
      className="fixed inset-0 z-[60]"
      // Clicking anywhere in the dimmed area moves on — forgiving for anyone
      // who does not read the buttons first.
      onClick={next}
    >
      {rect && (
        <div
          className="pointer-events-none absolute rounded-lg transition-all duration-200"
          style={{
            top: rect.top - SPOTLIGHT_PAD,
            left: rect.left - SPOTLIGHT_PAD,
            width: rect.width + SPOTLIGHT_PAD * 2,
            height: rect.height + SPOTLIGHT_PAD * 2,
            // One element does the dimming and the cut-out: the shadow paints
            // everything outside this box, so the box itself stays clear.
            boxShadow: `0 0 0 9999px rgba(2, 6, 23, 0.72), 0 0 0 2px ${COLORS.accent}, 0 0 18px ${COLORS.accentGlow}`,
          }}
        />
      )}

      <div
        ref={bubbleRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="absolute rounded-lg border p-4 shadow-xl outline-none transition-all duration-200"
        style={{
          ...bubbleStyle,
          width: BUBBLE_WIDTH,
          backgroundColor: COLORS.bgCard,
          borderColor: COLORS.border,
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <h3 id="tour-title" className="text-sm font-semibold" style={{ color: COLORS.text }}>
            {step.title}
          </h3>
          <button
            onClick={() => finish('dismissed')}
            aria-label="Close tour"
            title="Close tour"
            className="-mr-1 -mt-1 rounded p-1 transition-colors hover:bg-accent/50"
          >
            <X className="h-3.5 w-3.5" style={{ color: COLORS.textMuted }} />
          </button>
        </div>

        <p className="mt-1.5 text-xs leading-relaxed" style={{ color: COLORS.textMuted }}>
          {step.body}
        </p>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-[10px]" style={{ color: COLORS.textDim }}>
            {index + 1} of {total}
          </span>
          <div className="flex items-center gap-1.5">
            {index === 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                style={{ color: COLORS.textMuted }}
                onClick={() => finish('dismissed')}
              >
                Skip
              </Button>
            ) : (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={back}>
                Back
              </Button>
            )}
            <Button
              size="sm"
              className="h-7 px-3 text-xs text-white"
              style={{ backgroundColor: COLORS.accent }}
              onClick={next}
            >
              {isLast ? 'Done' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
