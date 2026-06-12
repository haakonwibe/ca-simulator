// components/SandboxDiffPanel.tsx — Slide-in panel comparing sandbox vs live.
//
// Runs the full sweep comparison (lib/sandboxDiff) when opened with changes
// present; the sweep is memoized on the policy sets so toggling the panel
// open/closed doesn't recompute.

import { useMemo } from 'react';
import { X, Beaker, ArrowRight, ShieldX, ShieldCheck, TrendingUp, TrendingDown } from 'lucide-react';
import { COLORS } from '@/data/theme';
import { Separator } from '@/components/ui/separator';
import { usePolicyStore } from '@/stores/usePolicyStore';
import { compareSweeps, describeSandboxChanges, type SandboxSweepDiff } from '@/lib/sandboxDiff';
import type { PolicyState } from '@/engine/models/Policy';

const STATE_META: Record<PolicyState, { label: string; color: string }> = {
  enabled: { label: 'On', color: COLORS.granted },
  enabledForReportingButNotEnforced: { label: 'Report-only', color: COLORS.reportOnly },
  disabled: { label: 'Off', color: COLORS.textDim },
};

export function SandboxDiffPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const livePolicies = usePolicyStore((s) => s.policies);
  const effectivePolicies = usePolicyStore((s) => s.effectivePolicies);
  const sandboxOverrides = usePolicyStore((s) => s.sandboxOverrides);
  const sandboxAssignments = usePolicyStore((s) => s.sandboxAssignments);
  const sandboxDrafts = usePolicyStore((s) => s.sandboxDrafts);
  const displayNames = usePolicyStore((s) => s.displayNames);

  const changes = useMemo(
    () => describeSandboxChanges(livePolicies, sandboxOverrides, sandboxAssignments, displayNames, sandboxDrafts),
    [livePolicies, sandboxOverrides, sandboxAssignments, displayNames, sandboxDrafts],
  );

  // ~2 × 5,760 engine evaluations — only while open with actual changes
  const diff = useMemo<SandboxSweepDiff | null>(() => {
    if (!open || changes.length === 0) return null;
    return compareSweeps(livePolicies, effectivePolicies);
  }, [open, changes.length, livePolicies, effectivePolicies]);

  return (
    <div
      role="region"
      aria-label="Sandbox comparison"
      aria-hidden={!open}
      style={{
        position: 'fixed',
        right: 0,
        top: 0,
        height: '100vh',
        width: '400px',
        zIndex: 50,
        backgroundColor: COLORS.bgPanel,
        borderLeft: `1px solid ${COLORS.border}`,
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 200ms ease-out',
        overflowY: 'auto',
        pointerEvents: open ? 'auto' : 'none',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ color: COLORS.text }}>
          <Beaker className="h-4 w-4" style={{ color: COLORS.warning }} />
          Sandbox vs Live
        </h3>
        <button
          onClick={onClose}
          aria-label="Close comparison panel"
          className="rounded p-1 hover:bg-accent/50 transition-colors"
        >
          <X className="h-4 w-4" style={{ color: COLORS.textMuted }} />
        </button>
      </div>
      <Separator />

      {changes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-8 text-center">
          <Beaker className="h-8 w-8" style={{ color: COLORS.textDim }} />
          <p className="text-sm text-muted-foreground">
            No sandbox changes yet. Toggle a policy state in the Grid view or detail panel.
          </p>
        </div>
      ) : (
        <div className="space-y-5 p-4">
          {/* Change list */}
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Changes ({changes.length})
            </h4>
            <div className="space-y-1.5">
              {changes.map((change) => (
                <div
                  key={change.policyId}
                  className="rounded border px-2.5 py-1.5 text-xs"
                  style={{ borderColor: COLORS.border, backgroundColor: COLORS.bgCard }}
                >
                  <div className="mb-1 flex items-center gap-1.5 font-medium leading-tight" style={{ color: COLORS.text }}>
                    {change.policyName}
                    {change.isNew && (
                      <span
                        className="rounded border px-1 py-0 text-[9px] font-bold"
                        style={{ color: COLORS.warning, borderColor: 'rgba(217, 119, 6, 0.4)' }}
                      >
                        NEW
                      </span>
                    )}
                  </div>
                  {change.stateChange && (
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span style={{ color: STATE_META[change.stateChange.from].color }}>
                        {STATE_META[change.stateChange.from].label}
                      </span>
                      <ArrowRight className="h-3 w-3" style={{ color: COLORS.textDim }} />
                      <span style={{ color: STATE_META[change.stateChange.to].color }}>
                        {STATE_META[change.stateChange.to].label}
                      </span>
                    </div>
                  )}
                  {change.fieldChanges.map((fc) => (
                    <div key={fc.field} className="mt-0.5 text-[11px]" style={{ color: COLORS.textMuted }}>
                      <span style={{ color: COLORS.textDim }}>{fc.fieldLabel}:</span>{' '}
                      {fc.added.map((name) => (
                        <span key={`+${name}`} className="mr-1.5" style={{ color: COLORS.granted }}>
                          +{name}
                        </span>
                      ))}
                      {fc.removed.map((name) => (
                        <span key={`-${name}`} className="mr-1.5 line-through" style={{ color: COLORS.blocked }}>
                          {name}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>

          {diff && (
            <>
              {/* Posture */}
              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Security Posture
                </h4>
                <PostureDelta diff={diff} />
              </section>

              {/* Verdict transitions */}
              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Scenario Changes
                </h4>
                <p className="mb-2 text-[11px]" style={{ color: COLORS.textMuted }}>
                  {diff.affectedScenarios.toLocaleString()} of {diff.totalScenarios.toLocaleString()} swept
                  scenarios change with the sandbox applied.
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  <StatTile
                    icon={ShieldX}
                    label="Newly blocked"
                    value={diff.newlyBlocked}
                    color={COLORS.blocked}
                  />
                  <StatTile
                    icon={ShieldCheck}
                    label="Newly allowed"
                    value={diff.newlyAllowed}
                    color={COLORS.granted}
                  />
                  <StatTile
                    icon={TrendingUp}
                    label="Controls strengthened"
                    value={diff.strengthened}
                    color={COLORS.granted}
                  />
                  <StatTile
                    icon={TrendingDown}
                    label="Controls weakened"
                    value={diff.weakened}
                    color={COLORS.warning}
                  />
                </div>
              </section>

              {/* Agent scenarios — verdict transitions over the agent grids */}
              {(diff.agentIdentity.affectedScenarios > 0 || diff.agentUser.affectedScenarios > 0) && (
                <section>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Agent Scenarios
                  </h4>
                  <div className="space-y-1">
                    {([
                      ['Agent identities', diff.agentIdentity],
                      ['Agent user accounts', diff.agentUser],
                    ] as const).map(([label, agentDiff]) => (
                      <div
                        key={label}
                        className="flex items-center justify-between rounded border px-2.5 py-1.5 text-xs"
                        style={{ borderColor: COLORS.border, backgroundColor: COLORS.bgCard }}
                      >
                        <span style={{ color: COLORS.text }}>{label}</span>
                        <span style={{ color: agentDiff.affectedScenarios > 0 ? COLORS.warning : COLORS.textMuted }}>
                          {agentDiff.affectedScenarios > 0
                            ? `${agentDiff.affectedScenarios}/${agentDiff.totalScenarios} change` +
                              (agentDiff.newlyBlocked > 0 ? ` · ${agentDiff.newlyBlocked} newly blocked` : '') +
                              (agentDiff.newlyAllowed > 0 ? ` · ${agentDiff.newlyAllowed} newly allowed` : '')
                            : 'unaffected'}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Affected users */}
              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Affected Users
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {diff.affectedUserTypes.affected.map((u) => (
                    <span
                      key={u.label}
                      className="rounded-full border px-2 py-0.5 text-[10px]"
                      style={{
                        color: COLORS.unsatisfied,
                        borderColor: COLORS.unsatisfiedBorder,
                        backgroundColor: COLORS.unsatisfiedBg,
                      }}
                    >
                      {u.label} · {u.scenariosAffected.toLocaleString()}/{u.scenariosTotal.toLocaleString()}
                    </span>
                  ))}
                  {diff.affectedUserTypes.notAffected.map((u) => (
                    <span
                      key={u.label}
                      className="rounded-full border px-2 py-0.5 text-[10px]"
                      style={{
                        color: COLORS.textMuted,
                        borderColor: COLORS.border,
                        backgroundColor: COLORS.bgCard,
                      }}
                    >
                      {u.label} · unaffected
                    </span>
                  ))}
                </div>
              </section>

              <p className="text-[10px] leading-relaxed" style={{ color: COLORS.textDim }}>
                Swept across 3 user types × 3 apps × 5 platforms × 4 client apps × 2 locations ×
                4 sign-in risk × 4 user risk levels, plus agent grids (3 apps × 2 locations ×
                4 agent risk levels per agent identity type). Posture uses the same weighted
                scoring as the Impact view and is user-scoped; session-only control changes
                (e.g. persistent browser) don't move these counts.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PostureDelta({ diff }: { diff: SandboxSweepDiff }) {
  const delta = diff.postureAfter - diff.postureBefore;
  const deltaColor = delta > 0 ? COLORS.granted : delta < 0 ? COLORS.warning : COLORS.textMuted;
  const deltaLabel = `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`;

  return (
    <div
      className="flex items-center justify-between rounded border px-3 py-2"
      style={{ borderColor: COLORS.border, backgroundColor: COLORS.bgCard }}
    >
      <div className="flex items-center gap-2 text-sm" style={{ color: COLORS.text }}>
        <span>{diff.postureBefore.toFixed(1)}%</span>
        <ArrowRight className="h-3.5 w-3.5" style={{ color: COLORS.textDim }} />
        <span style={{ color: deltaColor }}>{diff.postureAfter.toFixed(1)}%</span>
      </div>
      <span className="text-xs font-medium" style={{ color: deltaColor }}>
        {deltaLabel}
      </span>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof ShieldX;
  label: string;
  value: number;
  color: string;
}) {
  const muted = value === 0;
  return (
    <div
      className="flex items-center gap-2 rounded border px-2.5 py-2"
      style={{ borderColor: COLORS.border, backgroundColor: COLORS.bgCard }}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: muted ? COLORS.textDim : color }} />
      <div className="min-w-0">
        <div className="text-sm font-semibold leading-none" style={{ color: muted ? COLORS.textDim : color }}>
          {value.toLocaleString()}
        </div>
        <div className="mt-0.5 text-[10px] leading-tight" style={{ color: COLORS.textMuted }}>
          {label}
        </div>
      </div>
    </div>
  );
}
