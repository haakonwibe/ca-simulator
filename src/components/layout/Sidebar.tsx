import { ScenarioPanel } from '@/components/ScenarioPanel';

export function Sidebar() {
  return (
    <aside className="flex w-80 shrink-0 flex-col border-r border-border bg-sidebar">
      <ScenarioPanel />
    </aside>
  );
}
