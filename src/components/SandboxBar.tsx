// components/SandboxBar.tsx — Persistent bar shown while sandbox mode is active.
// Makes the hypothetical state unmistakable and hosts the change count, diff, and reset.

import { Beaker, RotateCcw, GitCompareArrows } from 'lucide-react';
import { COLORS } from '@/data/theme';
import { Button } from '@/components/ui/button';
import { usePolicyStore } from '@/stores/usePolicyStore';

export function SandboxBar({ onViewDiff }: { onViewDiff: () => void }) {
  const sandboxActive = usePolicyStore((s) => s.sandboxActive);
  const sandboxOverrides = usePolicyStore((s) => s.sandboxOverrides);
  const resetSandbox = usePolicyStore((s) => s.resetSandbox);

  if (!sandboxActive) return null;

  const changeCount = Object.keys(sandboxOverrides).length;

  return (
    <div
      role="status"
      className="flex shrink-0 items-center gap-3 border-b px-4 py-1.5 text-xs"
      style={{
        borderColor: 'rgba(217, 119, 6, 0.4)',
        backgroundColor: 'rgba(217, 119, 6, 0.08)',
      }}
    >
      <span className="flex items-center gap-1.5 font-medium" style={{ color: COLORS.warning }}>
        <Beaker className="h-3.5 w-3.5" />
        Sandbox mode
      </span>
      <span style={{ color: COLORS.textMuted }}>
        {changeCount === 0
          ? 'No changes yet — toggle a policy state in the Grid view or detail panel'
          : `${changeCount} ${changeCount === 1 ? 'change' : 'changes'} vs live`}
      </span>
      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-2 text-xs"
          onClick={onViewDiff}
          disabled={changeCount === 0}
        >
          <GitCompareArrows className="h-3 w-3" />
          View diff
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-2 text-xs"
          onClick={resetSandbox}
          disabled={changeCount === 0}
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </Button>
      </div>
    </div>
  );
}

/** Small chip for view headers so screenshots are never ambiguous about state. */
export function SandboxChip() {
  const sandboxActive = usePolicyStore((s) => s.sandboxActive);
  const sandboxOverrides = usePolicyStore((s) => s.sandboxOverrides);

  if (!sandboxActive || Object.keys(sandboxOverrides).length === 0) return null;

  return (
    <span
      className="flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]"
      style={{
        color: COLORS.warning,
        borderColor: 'rgba(217, 119, 6, 0.4)',
        backgroundColor: 'rgba(217, 119, 6, 0.08)',
      }}
    >
      <Beaker className="h-3 w-3" />
      Sandbox
    </span>
  );
}
