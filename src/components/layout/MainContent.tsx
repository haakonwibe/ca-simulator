import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { LayoutGrid, List, GitBranch, ShieldAlert } from 'lucide-react';
import { useEvaluationStore } from '@/stores/useEvaluationStore';
import { usePolicyStore } from '@/stores/usePolicyStore';
import { ADMIN_CONSENT_ERROR } from '@/services/graphClient';
import { PolicyGraph } from '@/components/PolicyGraph';
import { EvaluationMatrix } from '@/components/matrix/EvaluationMatrix';
import { SankeyFunnel } from '@/components/sankey/SankeyFunnel';
import { GapsView } from '@/components/GapsView';
import { PolicyDetailPanel } from '@/components/PolicyDetailPanel';
import { ResultsSummary } from '@/components/ResultsSummary';
import { ConsentBanner } from '@/components/ConsentBanner';

export function MainContent() {
  const activeView = useEvaluationStore((s) => s.activeView);
  const setActiveView = useEvaluationStore((s) => s.setActiveView);
  const policyError = usePolicyStore((s) => s.error);

  if (policyError === ADMIN_CONSENT_ERROR) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <ConsentBanner />
      </div>
    );
  }

  const isGapsView = activeView === 'gaps';

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* View toggle bar */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-4 py-1.5">
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 gap-1.5 px-2.5 text-xs ${activeView === 'grid' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
          onClick={() => setActiveView('grid')}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          Grid
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 gap-1.5 px-2.5 text-xs ${activeView === 'matrix' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
          onClick={() => setActiveView('matrix')}
        >
          <List className="h-3.5 w-3.5" />
          Matrix
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 gap-1.5 px-2.5 text-xs ${activeView === 'sankey' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
          onClick={() => setActiveView('sankey')}
        >
          <GitBranch className="h-3.5 w-3.5" />
          Flow
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 gap-1.5 px-2.5 text-xs ${activeView === 'gaps' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
          onClick={() => setActiveView('gaps')}
        >
          <ShieldAlert className="h-3.5 w-3.5" />
          Gaps
        </Button>
      </div>

      {isGapsView ? (
        /* Gaps view takes the full content area */
        <GapsView />
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
