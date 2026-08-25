import { useState, useEffect } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { MainContent } from './MainContent';
import { MobileNotice } from '@/components/MobileNotice';
import { SandboxBar } from '@/components/SandboxBar';
import { SandboxDiffPanel } from '@/components/SandboxDiffPanel';
import { ExportChangesDialog } from '@/components/ExportChangesDialog';
import { TourGuide } from '@/components/TourGuide';
import { useEvaluationStore } from '@/stores/useEvaluationStore';
import { usePolicyStore } from '@/stores/usePolicyStore';
import { COLORS, APP_VERSION } from '@/data/theme';
import { trackEvent } from '@/lib/analytics';
import { hasSeenTour, TOUR_MIN_WIDTH } from '@/lib/tour';

export function AppLayout() {
  const activeView = useEvaluationStore((s) => s.activeView);
  const showSidebar = activeView !== 'gaps' && activeView !== 'impact' && activeView !== 'baseline';

  const sandboxActive = usePolicyStore((s) => s.sandboxActive);
  const [diffOpen, setDiffOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);

  // Greet a first-time visitor, once. Gated on the same 768px breakpoint as
  // MobileNotice: below it that overlay owns the screen, and the sidebar the
  // tour points at is off-screen anyway.
  useEffect(() => {
    if (hasSeenTour()) return;
    if (!window.matchMedia(`(min-width: ${TOUR_MIN_WIDTH}px)`).matches) return;
    // One frame, so the layout the tour measures is the one that got painted.
    const timer = setTimeout(() => setTourOpen(true), 0);
    return () => clearTimeout(timer);
  }, []);

  // Leaving sandbox mode closes the comparison panel and export dialog
  useEffect(() => {
    if (!sandboxActive) {
      setDiffOpen(false);
      setExportOpen(false);
    }
  }, [sandboxActive]);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <MobileNotice />
      <Header onStartTour={() => setTourOpen(true)} />
      <SandboxBar
        onViewDiff={() => {
          trackEvent({ name: 'sandbox', props: { step: 'diffed' } });
          setDiffOpen(true);
        }}
        onExport={() => setExportOpen(true)}
      />
      <SandboxDiffPanel open={diffOpen} onClose={() => setDiffOpen(false)} />
      <ExportChangesDialog open={exportOpen} onOpenChange={setExportOpen} />
      <TourGuide open={tourOpen} onClose={() => setTourOpen(false)} />
      <div className="flex flex-1 overflow-hidden">
        {/* Hide (not unmount) for full-area views — ScenarioPanel's form state
            is local useState and must survive switching to Gaps/Impact */}
        <div className={showSidebar ? 'contents' : 'hidden'}>
          <Sidebar />
        </div>
        <MainContent />
      </div>
      <footer
        className="shrink-0 text-center text-xs py-1 border-t"
        style={{ color: COLORS.textDim, borderColor: COLORS.border }}
      >
        {APP_VERSION} · Built by{' '}
        <a
          href="https://x.com/haakonwibe"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
          style={{ color: COLORS.accent }}
        >
          Haakon Wibe
        </a>
        {' '}·{' '}
        <a href="/privacy" className="hover:underline" style={{ color: COLORS.accent }}>
          Privacy
        </a>
        {' '}·{' '}
        <a href="/terms" className="hover:underline" style={{ color: COLORS.accent }}>
          Terms
        </a>
        {' '}· Not affiliated with Microsoft · Use at your own risk
      </footer>
    </div>
  );
}
