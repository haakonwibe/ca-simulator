// components/ImpactView.tsx — Impact analysis view ("What if I disabled this policy?").

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePolicyStore } from '@/stores/usePolicyStore';
import { COLORS } from '@/data/theme';
import { analyzeImpactSweep } from '@/lib/impactAnalysis';
import type {
  ImpactSweepResult,
  ImpactSeverity,
  PolicyImpactSweepResult,
} from '@/lib/impactAnalysis';
import {
  SWEEP_USER_TYPES,
  SWEEP_APPS,
  SWEEP_PLATFORMS,
  SWEEP_CLIENT_APPS,
  SWEEP_LOCATIONS,
  SWEEP_SIGN_IN_RISK,
  SWEEP_USER_RISK,
} from '@/lib/sweepDimensions';
import { ScoringMethodologyDialog } from '@/components/ScoringMethodologyDialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Zap,
  Loader2,
  Search,
  HelpCircle,
  ArrowRight,
  AlertTriangle,
  Shield,
  Info,
} from 'lucide-react';

// ── Severity styling ──

const SEVERITY_CONFIG: Record<ImpactSeverity, { label: string; color: string; bg: string; border: string }> = {
  critical: { label: 'CRITICAL', color: COLORS.blocked, bg: COLORS.blockedBg, border: COLORS.blockedBorder },
  high: { label: 'HIGH', color: COLORS.unsatisfied, bg: COLORS.unsatisfiedBg, border: COLORS.unsatisfiedBorder },
  medium: { label: 'MEDIUM', color: COLORS.mfa, bg: COLORS.mfaBg, border: COLORS.mfaBorder },
  low: { label: 'LOW', color: COLORS.reportOnly, bg: COLORS.reportOnlyBg, border: COLORS.accentGlow },
};

const VERDICT_COLORS: Record<string, string> = {
  block: COLORS.blocked,
  allow: COLORS.granted,
  controlsRequired: COLORS.mfa,
};

const VERDICT_BG: Record<string, string> = {
  block: COLORS.blockedBg,
  allow: COLORS.grantedBg,
  controlsRequired: COLORS.mfaBg,
};

const VERDICT_LABELS: Record<string, string> = {
  block: 'Block',
  allow: 'Allow',
  controlsRequired: 'Controls Required',
};

// ── Scenario count ──

const SWEEP_SCENARIO_COUNT =
  SWEEP_USER_TYPES.length *
  SWEEP_APPS.length *
  SWEEP_PLATFORMS.length *
  SWEEP_CLIENT_APPS.length *
  SWEEP_LOCATIONS.length *
  SWEEP_SIGN_IN_RISK.length *
  SWEEP_USER_RISK.length;

// ── Severity badge ──

function SeverityBadge({ severity, size = 'sm' }: { severity: ImpactSeverity; size?: 'sm' | 'lg' }) {
  const config = SEVERITY_CONFIG[severity];
  const isLg = size === 'lg';
  return (
    <span
      className={`inline-flex items-center rounded font-bold tracking-wider ${isLg ? 'px-2.5 py-1 text-xs' : 'px-1.5 py-0.5 text-[10px]'}`}
      style={{ color: config.color, backgroundColor: config.bg, border: `1px solid ${config.border}` }}
    >
      {config.label}
    </span>
  );
}

// ── Verdict badge ──

function VerdictBadge({ decision, sublabel }: { decision: string; sublabel: string }) {
  const color = VERDICT_COLORS[decision] ?? COLORS.textMuted;
  const bg = VERDICT_BG[decision] ?? COLORS.notApplicableBg;
  const label = VERDICT_LABELS[decision] ?? decision;
  return (
    <div
      className="flex flex-col items-center gap-1 rounded-lg px-4 py-3"
      style={{ backgroundColor: bg, border: `1px solid ${color}33` }}
    >
      <span className="text-sm font-bold" style={{ color }}>{label}</span>
      <span className="text-[10px] uppercase tracking-wider" style={{ color: COLORS.textDim }}>{sublabel}</span>
    </div>
  );
}

// ── Coverage progress bar ──

function CoverageBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[11px]" style={{ color: COLORS.textMuted }}>{label}</span>
        <span className="text-sm font-bold" style={{ color }}>{value.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full" style={{ backgroundColor: COLORS.border }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(value, 100)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ── Impact detail panel ──

function ImpactDetail({ impact }: { impact: PolicyImpactSweepResult }) {
  const [scoringDialogOpen, setScoringDialogOpen] = useState(false);
  const isLowNoImpact = impact.severity === 'low' && impact.verdictChange === null && impact.gapsCreated.length === 0;

  // Coverage score color thresholds
  const afterColor = impact.coverageAfter >= 80 ? COLORS.granted
    : impact.coverageAfter >= 60 ? COLORS.mfa
    : COLORS.blocked;

  return (
    <div className="max-w-[720px] space-y-5 p-6">
      {/* Section 1: Header */}
      <div>
        <SeverityBadge severity={impact.severity} size="lg" />
        <h2 className="mt-3 text-base font-semibold" style={{ color: COLORS.text }}>
          Disabling{' '}
          <span style={{ color: COLORS.accent }}>{impact.policyName}</span>
        </h2>
        <p className="mt-1 text-xs" style={{ color: COLORS.textMuted }}>
          Affects {impact.affectedScenarios} of {impact.totalScenarios.toLocaleString()} evaluated scenarios
        </p>
        {impact.agentImpact && (
          <p className="mt-0.5 text-xs" style={{ color: impact.agentImpact.newlyAllowed > 0 ? COLORS.blocked : COLORS.textMuted }}>
            {impact.agentImpact.totalScenarios === 0
              ? 'Agent policy — report-only, so removing it changes no enforced outcomes'
              : `Agent scenarios: ${impact.agentImpact.affectedScenarios} of ${impact.agentImpact.totalScenarios} affected` +
                (impact.agentImpact.newlyAllowed > 0
                  ? ` — ${impact.agentImpact.newlyAllowed} previously blocked agent ${impact.agentImpact.newlyAllowed === 1 ? 'scenario opens' : 'scenarios open'} up`
                  : '')}
          </p>
        )}
      </div>

      {/* Low-impact shortcut */}
      {isLowNoImpact && (
        <Card
          className="border p-4"
          style={{ backgroundColor: COLORS.bgCard, borderColor: SEVERITY_CONFIG.low.border }}
        >
          <div className="flex items-start gap-3">
            <Info className="h-4 w-4 shrink-0 mt-0.5" style={{ color: COLORS.reportOnly }} />
            <p className="text-xs" style={{ color: COLORS.textMuted }}>
              Disabling this policy has no impact on the current scenario sweep. Other policies fully cover its scope, or it doesn't apply to any swept scenarios.
            </p>
          </div>
        </Card>
      )}

      {/* Affected Users Breakdown */}
      {impact.affectedUserTypes && (impact.affectedUserTypes.affected.length > 0 || impact.affectedUserTypes.notAffected.length > 0) && (
        <div>
          <div
            className="mb-2 text-[10px] font-semibold uppercase tracking-[0.05em]"
            style={{ color: COLORS.textDim }}
          >
            Affected Users
          </div>
          <Card
            className="border p-3"
            style={{ backgroundColor: COLORS.bgCard, borderColor: COLORS.border }}
          >
            {impact.affectedUserTypes.affected.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {impact.affectedUserTypes.affected.map((entry) => (
                  <span
                    key={entry.label}
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
                    style={{
                      backgroundColor: COLORS.blockedBg,
                      color: COLORS.blocked,
                      border: `1px solid ${COLORS.blocked}33`,
                    }}
                  >
                    {entry.label}
                    <span style={{ opacity: 0.7 }}>
                      {entry.scenariosAffected}/{entry.scenariosTotal}
                    </span>
                  </span>
                ))}
              </div>
            )}
            {impact.affectedUserTypes.notAffected.length > 0 && (
              <div className={impact.affectedUserTypes.affected.length > 0 ? 'mt-2 flex flex-wrap gap-2' : 'flex flex-wrap gap-2'}>
                {impact.affectedUserTypes.notAffected.map((entry) => (
                  <span
                    key={entry.label}
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
                    style={{
                      backgroundColor: COLORS.grantedBg,
                      color: COLORS.granted,
                      border: `1px solid ${COLORS.granted}33`,
                    }}
                  >
                    {entry.label}
                    <span style={{ opacity: 0.7 }}>not affected</span>
                  </span>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Section 2: Verdict status — show for CRITICAL and HIGH */}
      {(impact.severity === 'critical' || impact.severity === 'high') && (
        <div>
          <div
            className="mb-2 text-[10px] font-semibold uppercase tracking-[0.05em]"
            style={{ color: COLORS.textDim }}
          >
            {impact.verdictChange ? 'Verdict Change' : 'Verdict Unchanged'}
          </div>
          {impact.agentImpact && impact.affectedScenarios === 0 ? (
            <Card
              className="flex items-center gap-3 border p-4"
              style={{ backgroundColor: COLORS.bgCard, borderColor: COLORS.border }}
            >
              <p className="text-xs" style={{ color: COLORS.textMuted }}>
                User sign-ins are unaffected — this policy targets agent identities; the impact above
                is on agent scenarios.
              </p>
            </Card>
          ) : impact.verdictChange ? (
            <Card
              className="flex items-center justify-center gap-4 border p-4"
              style={{ backgroundColor: COLORS.bgCard, borderColor: COLORS.border }}
            >
              <VerdictBadge decision={impact.verdictChange.from} sublabel="Current" />
              <ArrowRight className="h-5 w-5 shrink-0" style={{ color: COLORS.textDim }} />
              <VerdictBadge decision={impact.verdictChange.to} sublabel="Without Policy" />
            </Card>
          ) : (
            <Card
              className="flex items-center gap-3 border p-4"
              style={{ backgroundColor: COLORS.bgCard, borderColor: COLORS.border }}
            >
              <VerdictBadge decision={impact.withoutResult.decision} sublabel="Maintained" />
              <p className="text-xs" style={{ color: COLORS.textMuted }}>
                Enforcement level maintained despite weaker controls
              </p>
            </Card>
          )}
        </div>
      )}

      {/* Section 3: Coverage Score */}
      {!isLowNoImpact && (
        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.05em]"
              style={{ color: COLORS.textDim }}
            >
              Policy Coverage Score
            </span>
            <button onClick={() => setScoringDialogOpen(true)} title="How is this calculated?">
              <Info className="h-3 w-3" style={{ color: COLORS.textDim, cursor: 'pointer' }} />
            </button>
          </div>
          <ScoringMethodologyDialog open={scoringDialogOpen} onOpenChange={setScoringDialogOpen} />
          <Card
            className="flex items-center gap-4 border p-4"
            style={{ backgroundColor: COLORS.bgCard, borderColor: COLORS.border }}
          >
            <CoverageBar label="Current" value={impact.coverageBefore} color={COLORS.granted} />
            <ArrowRight className="h-4 w-4 shrink-0" style={{ color: COLORS.textDim }} />
            <CoverageBar label="Without policy" value={impact.coverageAfter} color={afterColor} />
          </Card>
        </div>
      )}

      {/* Section 4: Gaps Created */}
      {impact.gapsCreated.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" style={{ color: COLORS.blocked }} />
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.05em]"
              style={{ color: COLORS.textDim }}
            >
              Gaps Created ({impact.gapsCreated.length})
            </span>
          </div>
          <div className="space-y-2">
            {impact.gapsCreated.map((gap, i) => {
              const gapConfig = SEVERITY_CONFIG[gap.riskLevel];
              return (
                <Card
                  key={i}
                  className="border p-3"
                  style={{
                    backgroundColor: COLORS.bgCard,
                    borderColor: COLORS.border,
                    borderLeftWidth: '3px',
                    borderLeftColor: gapConfig.color,
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-semibold" style={{ color: COLORS.text }}>
                      {gap.description}
                    </span>
                    <SeverityBadge severity={gap.riskLevel} />
                  </div>
                  <p className="mt-1 text-[11px]" style={{ color: COLORS.textMuted }}>
                    {gap.detail}
                  </p>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Section 5: Still Protected By */}
      {impact.stillProtectedBy.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" style={{ color: COLORS.granted }} />
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.05em]"
              style={{ color: COLORS.textDim }}
            >
              Still Protected By ({impact.stillProtectedBy.length})
            </span>
          </div>
          <div className="space-y-2">
            {impact.stillProtectedBy.map((fb, i) => (
              <Card
                key={i}
                className="border p-3"
                style={{
                  backgroundColor: COLORS.bgCard,
                  borderColor: COLORS.border,
                  borderLeftWidth: '3px',
                  borderLeftColor: COLORS.granted,
                }}
              >
                <span className="text-xs font-semibold" style={{ color: COLORS.granted }}>
                  {fb.policyName}
                </span>
                <p className="mt-1 text-[11px]" style={{ color: COLORS.textMuted }}>
                  {fb.description || fb.scope}
                </p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* No fallback warning */}
      {impact.stillProtectedBy.length === 0 && impact.gapsCreated.length > 0 && (
        <Card
          className="border p-4"
          style={{
            backgroundColor: COLORS.blockedBg,
            borderColor: 'rgba(239, 68, 68, 0.3)',
          }}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: COLORS.blocked }} />
            <div>
              <p className="text-xs font-semibold" style={{ color: COLORS.blocked }}>
                No fallback protection
              </p>
              <p className="mt-1 text-[11px]" style={{ color: COLORS.textMuted }}>
                No other policies cover the scenarios this policy protects. Disabling it leaves a complete gap.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Other Protection Active */}
      {impact.otherProtectionActive.length > 0 && (
        <div>
          <div
            className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.05em]"
            style={{ color: COLORS.textDim }}
          >
            <Shield className="h-3 w-3" style={{ color: COLORS.accent }} />
            Other Protection Active ({impact.otherProtectionActive.length})
          </div>
          <div className="space-y-2">
            {impact.otherProtectionActive.map((op, i) => (
              <Card
                key={i}
                className="border p-3"
                style={{
                  backgroundColor: COLORS.bgCard,
                  borderColor: COLORS.border,
                  borderLeftWidth: '3px',
                  borderLeftColor: COLORS.accent,
                }}
              >
                <span className="text-xs font-semibold" style={{ color: COLORS.accent }}>
                  {op.policyName}
                </span>
                <p className="mt-1 text-[11px]" style={{ color: COLORS.textMuted }}>
                  {op.description}
                </p>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ──

export function ImpactView() {
  const policies = usePolicyStore((s) => s.effectivePolicies);
  const dataSource = usePolicyStore((s) => s.dataSource);

  const [sweepResult, setSweepResult] = useState<ImpactSweepResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);

  const lastAnalyzedPoliciesRef = useRef<typeof policies | null>(null);

  const runAnalysis = useCallback(() => {
    setIsAnalyzing(true);
    setSelectedPolicyId(null);
    setTimeout(() => {
      const result = analyzeImpactSweep(policies);
      setSweepResult(result);
      lastAnalyzedPoliciesRef.current = policies;
      setIsAnalyzing(false);
      // Auto-select first policy
      if (result.policyImpacts.length > 0) {
        setSelectedPolicyId(result.policyImpacts[0].policyId);
      }
    }, 0);
  }, [policies]);

  // Auto-reanalyze when policies change
  useEffect(() => {
    if (
      lastAnalyzedPoliciesRef.current !== null &&
      lastAnalyzedPoliciesRef.current !== policies &&
      policies.length > 0
    ) {
      runAnalysis();
    }
  }, [policies, runAnalysis]);

  const selectedImpact = sweepResult?.policyImpacts.find((p) => p.policyId === selectedPolicyId) ?? null;

  // Empty state: no policies loaded
  if (dataSource === 'none' || policies.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8">
        <Search className="h-8 w-8" style={{ color: COLORS.textDim }} />
        <p className="text-center text-sm text-muted-foreground">
          Sign in and load policies to analyze policy impact
        </p>
      </div>
    );
  }

  // Not yet analyzed
  if (sweepResult === null && !isAnalyzing) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <Zap className="h-10 w-10" style={{ color: COLORS.textDim }} />
        <p className="text-center text-sm" style={{ color: COLORS.textMuted }}>
          Remove each policy one at a time and measure the effect across{' '}
          {SWEEP_SCENARIO_COUNT.toLocaleString()} scenario combinations
        </p>
        <Button
          onClick={runAnalysis}
          className="gap-2"
          style={{ backgroundColor: COLORS.accent }}
        >
          <Zap className="h-4 w-4" />
          Analyze Impact
        </Button>
      </div>
    );
  }

  // Analyzing
  if (isAnalyzing) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: COLORS.accent }} />
        <p className="text-sm" style={{ color: COLORS.textMuted }}>
          Analyzing impact across {SWEEP_SCENARIO_COUNT.toLocaleString()} scenarios...
        </p>
      </div>
    );
  }

  // Results: two-panel layout
  return (
    <div className="flex h-full">
      {/* Left panel: Policy list */}
      <div
        className="flex w-[340px] shrink-0 flex-col border-r overflow-hidden"
        style={{ borderColor: COLORS.border }}
      >
        {/* Header */}
        <div className="shrink-0 border-b px-4 py-3" style={{ borderColor: COLORS.border }}>
          <div className="flex items-center justify-between">
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.05em]"
              style={{ color: COLORS.textDim }}
            >
              What if I disabled...
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={runAnalysis}
              className="h-6 px-2 text-[10px]"
              style={{ color: COLORS.textMuted }}
            >
              Re-analyze
            </Button>
          </div>
        </div>

        {/* Policy list */}
        <ScrollArea className="flex-1">
          {sweepResult!.policyImpacts.map((impact) => {
            const isSelected = impact.policyId === selectedPolicyId;
            const config = SEVERITY_CONFIG[impact.severity];
            return (
              <button
                key={impact.policyId}
                onClick={() => setSelectedPolicyId(impact.policyId)}
                className="flex w-full flex-col gap-1 px-4 py-2.5 text-left transition-colors"
                style={{
                  borderLeft: isSelected ? `3px solid ${config.color}` : '3px solid transparent',
                  backgroundColor: isSelected ? COLORS.bgCard : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = COLORS.bgCardHover;
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span
                  className="text-xs truncate"
                  style={{
                    color: COLORS.text,
                    fontWeight: isSelected ? 600 : 400,
                  }}
                >
                  {impact.policyName}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px]" style={{ color: COLORS.textDim }}>
                    {impact.affectedScenarios > 0
                      ? `${impact.affectedScenarios} scenario${impact.affectedScenarios !== 1 ? 's' : ''} affected`
                      : 'No scenarios affected'}
                  </span>
                  <SeverityBadge severity={impact.severity} />
                </div>
              </button>
            );
          })}
        </ScrollArea>
      </div>

      {/* Right panel: Impact detail */}
      <div className="flex-1 overflow-hidden">
        {selectedImpact ? (
          <ScrollArea className="h-full">
            <ImpactDetail impact={selectedImpact} />
          </ScrollArea>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8">
            <HelpCircle className="h-8 w-8" style={{ color: COLORS.textDim }} />
            <p className="text-sm" style={{ color: COLORS.textMuted }}>
              Select a policy to see the impact of disabling it
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
