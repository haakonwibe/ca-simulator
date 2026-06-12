import { useState, useEffect } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { MainContent } from './MainContent';
import { MobileNotice } from '@/components/MobileNotice';
import { SandboxBar } from '@/components/SandboxBar';
import { SandboxDiffPanel } from '@/components/SandboxDiffPanel';
import { useEvaluationStore } from '@/stores/useEvaluationStore';
import { usePolicyStore } from '@/stores/usePolicyStore';
import { COLORS, APP_VERSION } from '@/data/theme';

export function AppLayout() {
  const activeView = useEvaluationStore((s) => s.activeView);
  const showSidebar = activeView !== 'gaps' && activeView !== 'impact';

  const sandboxActive = usePolicyStore((s) => s.sandboxActive);
  const [diffOpen, setDiffOpen] = useState(false);

  // Leaving sandbox mode closes the comparison panel
  useEffect(() => {
    if (!sandboxActive) setDiffOpen(false);
  }, [sandboxActive]);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <MobileNotice />
      <Header />
      <SandboxBar onViewDiff={() => setDiffOpen(true)} />
      <SandboxDiffPanel open={diffOpen} onClose={() => setDiffOpen(false)} />
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
