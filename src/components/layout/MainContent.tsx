import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { LayoutGrid, List, GitBranch, ShieldAlert, Zap, ClipboardCheck } from 'lucide-react';
import { useEvaluationStore } from '@/stores/useEvaluationStore';
import { usePolicyStore } from '@/stores/usePolicyStore';
import { ADMIN_CONSENT_ERROR } from '@/services/graphClient';
import { PolicyGraph } from '@/components/PolicyGraph';
import { EvaluationMatrix } from '@/components/matrix/EvaluationMatrix';
import { SankeyFunnel } from '@/components/sankey/SankeyFunnel';
import { GapsView } from '@/components/GapsView';
import { ImpactView } from '@/components/ImpactView';
import { BaselineView } from '@/components/BaselineView';
import { PolicyDetailPanel } from '@/components/PolicyDetailPanel';
import { ResultsSummary } from '@/components/ResultsSummary';
import { ConsentBanner } from '@/components/ConsentBanner';
import { SandboxChip } from '@/components/SandboxBar';
import { trackEvent, type AnalyticsView } from '@/lib/analytics';

export function MainContent() {
  const activeView = useEvaluationStore((s) => s.activeView);
  const setActiveView = useEvaluationStore((s) => s.setActiveView);
  const policyError = usePolicyStore((s) => s.error);
  const dataSource = usePolicyStore((s) => s.dataSource);

  // Tracked here rather than in setActiveView so only deliberate tab clicks
  // count — BaselineView navigates to 'grid' programmatically after drafting.
  const openView = (view: AnalyticsView) => {
    if (dataSource !== 'none') trackEvent({ name: 'view_opened', props: { view, mode: dataSource } });
    setActiveView(view);
  };

  if (policyError === ADMIN_CONSENT_ERROR) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <ConsentBanner />
      </div>
    );
  }

  const isFullAreaView = activeView === 'gaps' || activeView === 'impact' || activeView === 'baseline';

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* View toggle bar */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-4 py-1.5">
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 gap-1.5 px-2.5 text-xs ${activeView === 'grid' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
          onClick={() => openView('grid')}
          data-tour="tab-grid"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          Grid
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 gap-1.5 px-2.5 text-xs ${activeView === 'matrix' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
          onClick={() => openView('matrix')}
          data-tour="tab-matrix"
        >
          <List className="h-3.5 w-3.5" />
          Matrix
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 gap-1.5 px-2.5 text-xs ${activeView === 'sankey' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
          onClick={() => openView('sankey')}
          data-tour="tab-sankey"
        >
          <GitBranch className="h-3.5 w-3.5" />
          Flow
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 gap-1.5 px-2.5 text-xs ${activeView === 'gaps' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
          onClick={() => openView('gaps')}
          data-tour="tab-gaps"
        >
          <ShieldAlert className="h-3.5 w-3.5" />
          Gaps
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 gap-1.5 px-2.5 text-xs ${activeView === 'impact' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
          onClick={() => openView('impact')}
          data-tour="tab-impact"
        >
          <Zap className="h-3.5 w-3.5" />
          Impact
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 gap-1.5 px-2.5 text-xs ${activeView === 'baseline' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
          onClick={() => openView('baseline')}
          data-tour="tab-baseline"
        >
          <ClipboardCheck className="h-3.5 w-3.5" />
          Baseline
        </Button>
        <div className="ml-auto">
          <SandboxChip />
        </div>
      </div>

      {isFullAreaView ? (
        /* Full-area views take the entire content area */
        <>
          {activeView === 'gaps' && <GapsView />}
          {activeView === 'impact' && <ImpactView />}
          {activeView === 'baseline' && <BaselineView />}
        </>
      ) : (
        <>
          {/* Top: Visualization area (~55% height) */}
          <div className="relative flex flex-[11] flex-col overflow-hidden border-b border-border">
            {activeView === 'grid' && <PolicyGraph />}
            {activeView === 'matrix' && <EvaluationMatrix />}
            {activeView === 'sankey' && <SankeyFunnel />}
            <PolicyDetailPanel />
          </div>

          {/* Bottom: Results area (~45% height) */}
          <ScrollArea className="flex-[9]">
            <ResultsSummary />
          </ScrollArea>
        </>
      )}
    </div>
  );
}
