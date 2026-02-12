import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { MainContent } from './MainContent';
import { MobileNotice } from '@/components/MobileNotice';
import { COLORS } from '@/data/theme';

export function AppLayout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <MobileNotice />
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <MainContent />
      </div>
      <footer
        className="shrink-0 text-center text-xs py-1 border-t"
        style={{ color: COLORS.textDim, borderColor: COLORS.border }}
      >
        v0.3 beta · Built by{' '}
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
