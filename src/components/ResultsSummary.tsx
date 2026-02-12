// components/ResultsSummary.tsx — Evaluation results dashboard.

import { useState, useEffect } from 'react';
import { useEvaluationStore } from '@/stores/useEvaluationStore';
import { COLORS } from '@/data/theme';
import type {
  CAEngineResult,
  PolicyEvaluationResult,
  ConditionMatchResult,
} from '@/engine/models/EvaluationResult';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Minus,
  Zap,
} from 'lucide-react';

// ── Verdict config ──────────────────────────────────────────────────

const VERDICT_CONFIG = {
  allow: {
    label: 'ALLOW',
    subtitle: 'Access granted',
    icon: ShieldCheck,
    color: COLORS.granted,
    bg: COLORS.grantedBg,
    border: COLORS.granted,
  },
  block: {
    label: 'BLOCK',
    subtitle: 'Access denied',
    icon: ShieldX,
    color: COLORS.blocked,
    bg: COLORS.blockedBg,
    border: COLORS.blocked,
  },
  controlsRequired: {
    label: 'CONTROLS REQUIRED',
    subtitle: 'Additional controls needed',
    icon: AlertTriangle,
    color: COLORS.unsatisfied,
    bg: COLORS.unsatisfiedBg,
    border: COLORS.unsatisfied,
  },
} as const;

// ── Main component ──────────────────────────────────────────────────

export function ResultsSummary() {
  const result = useEvaluationStore((s) => s.result);
  const selectedPolicyId = useEvaluationStore((s) => s.selectedPolicyId);

  // Lifted expansion state
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [reportOnlyOpen, setReportOnlyOpen] = useState(false);
  const [skippedOpen, setSkippedOpen] = useState(false);

  const toggleCard = (policyId: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(policyId)) next.delete(policyId);
      else next.add(policyId);
      return next;
    });
  };

  // Scroll to selected policy when tile is clicked
  useEffect(() => {
    if (!selectedPolicyId || !result) return;

    const isReportOnly = result.reportOnlyPolicies.some((p) => p.policyId === selectedPolicyId);
    const isSkipped = result.skippedPolicies.some((p) => p.policyId === selectedPolicyId);

    // Auto-expand collapsed sections if needed
    if (isReportOnly) setReportOnlyOpen(true);
    if (isSkipped) setSkippedOpen(true);

    // Auto-expand the policy card (skipped cards don't expand)
    if (!isSkipped) {
      setExpandedCards((prev) => {
        if (prev.has(selectedPolicyId)) return prev;
        const next = new Set(prev);
        next.add(selectedPolicyId);
        return next;
      });
    }

    // Scroll after DOM update (slight delay for section expansion)
    setTimeout(() => {
      const el = document.getElementById(`policy-${selectedPolicyId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }, [selectedPolicyId, result]);

  if (!result) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-4 p-4">
      <VerdictBanner result={result} />
      {result.finalDecision === 'controlsRequired' && (
        <RequiredControls result={result} />
      )}
      {result.appliedPolicies.length > 0 && (
        <AppliedPolicies
          policies={result.appliedPolicies}
          expandedCards={expandedCards}
          onToggleCard={toggleCard}
          selectedPolicyId={selectedPolicyId}
        />
      )}
      <ReportOnlySection
        policies={result.reportOnlyPolicies}
        open={reportOnlyOpen}
        onToggle={() => setReportOnlyOpen(!reportOnlyOpen)}
        expandedCards={expandedCards}
        onToggleCard={toggleCard}
        selectedPolicyId={selectedPolicyId}
      />
      <SkippedSection
        policies={result.skippedPolicies}
        open={skippedOpen}
        onToggle={() => setSkippedOpen(!skippedOpen)}
        selectedPolicyId={selectedPolicyId}
      />
    </div>
  );
}

// ── Empty state ─────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8">
      <Zap className="h-8 w-8" style={{ color: COLORS.textDim }} />
      <p className="text-center text-sm text-muted-foreground">
        Configure a scenario and click Evaluate to see results
      </p>
    </div>
  );
}

// ── Verdict banner ──────────────────────────────────────────────────

function VerdictBanner({ result }: { result: CAEngineResult }) {
  const config = VERDICT_CONFIG[result.finalDecision];
  const Icon = config.icon;

  const counts = [
    `${result.appliedPolicies.length} applied`,
    `${result.skippedPolicies.length} skipped`,
    `${result.reportOnlyPolicies.length} report-only`,
  ].join(' \u00b7 ');

  return (
    <Card
      className="overflow-hidden p-0"
      style={{
        backgroundColor: config.bg,
        borderColor: config.border,
        borderLeftWidth: 4,
      }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <Icon className="h-6 w-6 shrink-0" style={{ color: config.color }} />
        <div className="min-w-0">
          <div
            className="text-lg font-bold tracking-wide"
            style={{ color: config.color }}
          >
            {config.label}
          </div>
          <div className="text-xs text-muted-foreground">{counts}</div>
        </div>
      </div>
    </Card>
  );
}

// ── Required controls ───────────────────────────────────────────────

function RequiredControls({ result }: { result: CAEngineResult }) {
  const satisfied = new Set(result.satisfiedControls);

  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Required Controls
      </h4>
      <div className="flex flex-wrap gap-1.5">
        {result.requiredControls.map((control) => {
          const isSatisfied = satisfied.has(control);
          return (
            <Badge
              key={control}
              variant="outline"
              className="gap-1 font-mono text-[11px]"
              style={{
                color: isSatisfied ? COLORS.granted : COLORS.unsatisfied,
                borderColor: isSatisfied ? COLORS.granted : COLORS.unsatisfied,
                backgroundColor: isSatisfied ? COLORS.grantedBg : COLORS.unsatisfiedBg,
              }}
            >
              {isSatisfied ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <XCircle className="h-3 w-3" />
              )}
              {control}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}

// ── Applied policies ────────────────────────────────────────────────

function AppliedPolicies({
  policies,
  expandedCards,
  onToggleCard,
  selectedPolicyId,
}: {
  policies: PolicyEvaluationResult[];
  expandedCards: Set<string>;
  onToggleCard: (id: string) => void;
  selectedPolicyId: string | null;
}) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Applied Policies ({policies.length})
      </h4>
      <div className="space-y-2">
        {policies.map((policy) => (
          <PolicyCard
            key={policy.policyId}
            policy={policy}
            variant="applied"
            expanded={expandedCards.has(policy.policyId)}
            onToggle={() => onToggleCard(policy.policyId)}
            isSelected={selectedPolicyId === policy.policyId}
          />
        ))}
      </div>
    </div>
  );
}

// ── Policy card (applied + report-only) ─────────────────────────────

function PolicyCard({
  policy,
  variant,
  expanded,
  onToggle,
  isSelected,
}: {
  policy: PolicyEvaluationResult;
  variant: 'applied' | 'reportOnly';
  expanded: boolean;
  onToggle: () => void;
  isSelected: boolean;
}) {
  const gc = policy.grantControls;

  // Determine left border color
  let borderColor: string;
  if (variant === 'reportOnly') {
    borderColor = COLORS.reportOnly;
  } else if (gc && gc.controls.includes('block')) {
    borderColor = COLORS.blocked;
  } else if (gc?.satisfied) {
    borderColor = COLORS.granted;
  } else {
    borderColor = COLORS.unsatisfied;
  }

  // Grant summary text
  let grantSummary = '';
  let grantColor: string = COLORS.textMuted;
  if (gc) {
    if (gc.controls.includes('block')) {
      grantSummary = 'BLOCK';
      grantColor = COLORS.blocked;
    } else {
      const controlList = gc.controls.join(', ');
      grantSummary = `${gc.operator}(${controlList})`;
      if (gc.satisfied) {
        grantSummary += ' \u2014 SATISFIED';
        grantColor = COLORS.granted;
      } else {
        grantSummary += ' \u2014 NOT SATISFIED';
        grantColor = COLORS.unsatisfied;
      }
    }
  }

  return (
    <Card
      id={`policy-${policy.policyId}`}
      className="overflow-hidden p-0"
      style={{
        borderLeftWidth: 3,
        borderLeftColor: borderColor,
        ...(isSelected && {
          backgroundColor: 'rgba(59, 130, 246, 0.06)',
          boxShadow: `0 0 0 1px ${COLORS.borderActive}`,
        }),
      }}
    >
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-accent/30 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate text-xs font-medium text-foreground">
            {policy.policyName}
          </span>
          {variant === 'reportOnly' && (
            <Badge
              variant="outline"
              className="shrink-0 text-[10px] px-1.5 py-0"
              style={{ color: COLORS.reportOnly, borderColor: COLORS.reportOnly }}
            >
              Report Only
            </Badge>
          )}
        </div>
        {gc && (
          <span
            className="shrink-0 ml-2 text-[10px] font-mono"
            style={{ color: grantColor }}
          >
            {grantSummary}
          </span>
        )}
      </button>

      {/* Expandable detail */}
      <div
        className="overflow-hidden transition-all duration-200 ease-in-out"
        style={{ maxHeight: expanded ? '1000px' : '0px' }}
      >
        <Separator />
        <div className="px-3 py-2.5 space-y-3">
          {/* Conditions table */}
          <div>
            <h5 className="mb-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Conditions
            </h5>
            <div className="space-y-1">
              {policy.conditionResults.map((cr) => (
                <ConditionRow key={cr.conditionType} condition={cr} />
              ))}
            </div>
          </div>

          {/* Grant controls detail */}
          {gc && !gc.controls.includes('block') && (
            <div>
              <h5 className="mb-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Grant Controls ({gc.operator})
              </h5>
              <div className="space-y-1">
                {gc.controls.map((ctrl) => {
                  const isSatisfied = gc.satisfiedControls.includes(ctrl);
                  return (
                    <div
                      key={ctrl}
                      className="flex items-center gap-2 text-xs"
                    >
                      {isSatisfied ? (
                        <CheckCircle2
                          className="h-3 w-3 shrink-0"
                          style={{ color: COLORS.granted }}
                        />
                      ) : (
                        <XCircle
                          className="h-3 w-3 shrink-0"
                          style={{ color: COLORS.unsatisfied }}
                        />
                      )}
                      <span
                        className="font-mono text-[11px]"
                        style={{
                          color: isSatisfied ? COLORS.granted : COLORS.unsatisfied,
                        }}
                      >
                        {ctrl}
                      </span>
                    </div>
                  );
                })}
                {gc.authenticationStrength && (
                  <div className="flex items-center gap-2 text-xs">
                    <ShieldCheck
                      className="h-3 w-3 shrink-0"
                      style={{ color: COLORS.accent }}
                    />
                    <span className="font-mono text-[11px] text-muted-foreground">
                      authStrength: {gc.authenticationStrength}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ── Condition row ───────────────────────────────────────────────────

function ConditionRow({ condition }: { condition: ConditionMatchResult }) {
  let StatusIcon;
  let iconColor: string;

  if (condition.phase === 'exclusion') {
    StatusIcon = XCircle;
    iconColor = COLORS.blocked;
  } else if (condition.matches) {
    StatusIcon = CheckCircle2;
    iconColor = COLORS.granted;
  } else {
    StatusIcon = Minus;
    iconColor = COLORS.textDim;
  }

  return (
    <div className="flex items-start gap-2 text-xs">
      <StatusIcon
        className="mt-0.5 h-3 w-3 shrink-0"
        style={{ color: iconColor }}
      />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[11px] font-medium text-foreground">
            {condition.conditionType}
          </span>
          <span
            className="text-[10px]"
            style={{
              color:
                condition.phase === 'exclusion'
                  ? COLORS.blocked
                  : condition.phase === 'unconfigured' || condition.phase === 'notConfigured'
                    ? COLORS.textDim
                    : COLORS.textMuted,
            }}
          >
            ({condition.phase})
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          {condition.reason}
        </p>
      </div>
    </div>
  );
}

// ── Report-only section ─────────────────────────────────────────────

function ReportOnlySection({
  policies,
  open,
  onToggle,
  expandedCards,
  onToggleCard,
  selectedPolicyId,
}: {
  policies: PolicyEvaluationResult[];
  open: boolean;
  onToggle: () => void;
  expandedCards: Set<string>;
  onToggleCard: (id: string) => void;
  selectedPolicyId: string | null;
}) {
  if (policies.length === 0) return null;

  return (
    <div>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 py-1 text-left"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" style={{ color: COLORS.reportOnly }} />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" style={{ color: COLORS.reportOnly }} />
        )}
        <span className="flex items-center gap-2">
          <Eye className="h-3.5 w-3.5" style={{ color: COLORS.reportOnly }} />
          <span
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: COLORS.reportOnly }}
          >
            Report-Only Policies ({policies.length})
          </span>
        </span>
      </button>

      <div
        className="overflow-hidden transition-all duration-200 ease-in-out"
        style={{ maxHeight: open ? '5000px' : '0px' }}
      >
        <div className="mt-2 space-y-2">
          {policies.map((policy) => (
            <PolicyCard
              key={policy.policyId}
              policy={policy}
              variant="reportOnly"
              expanded={expandedCards.has(policy.policyId)}
              onToggle={() => onToggleCard(policy.policyId)}
              isSelected={selectedPolicyId === policy.policyId}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Skipped section ─────────────────────────────────────────────────

function SkippedSection({
  policies,
  open,
  onToggle,
  selectedPolicyId,
}: {
  policies: PolicyEvaluationResult[];
  open: boolean;
  onToggle: () => void;
  selectedPolicyId: string | null;
}) {
  if (policies.length === 0) return null;

  return (
    <div>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 py-1 text-left"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" style={{ color: COLORS.textDim }} />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" style={{ color: COLORS.textDim }} />
        )}
        <span className="flex items-center gap-2">
          <EyeOff className="h-3.5 w-3.5" style={{ color: COLORS.textDim }} />
          <span
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: COLORS.textDim }}
          >
            Skipped Policies ({policies.length})
          </span>
        </span>
      </button>

      <div
        className="overflow-hidden transition-all duration-200 ease-in-out"
        style={{ maxHeight: open ? '5000px' : '0px' }}
      >
        <div className="mt-2 space-y-1.5">
          {policies.map((policy) => (
            <SkippedPolicyRow
              key={policy.policyId}
              policy={policy}
              isSelected={selectedPolicyId === policy.policyId}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SkippedPolicyRow({
  policy,
  isSelected,
}: {
  policy: PolicyEvaluationResult;
  isSelected: boolean;
}) {
  // Find the first failed condition as skip reason
  const failedCondition = policy.conditionResults.find((cr) => !cr.matches);
  const skipReason = policy.state === 'disabled'
    ? 'Disabled'
    : failedCondition
      ? `${failedCondition.conditionType}: ${failedCondition.reason}`
      : 'No matching conditions';

  return (
    <div
      id={`policy-${policy.policyId}`}
      className="rounded-md border px-3 py-2"
      style={{
        borderColor: isSelected ? COLORS.borderActive : COLORS.notApplicable,
        backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.06)' : COLORS.notApplicableBg,
        ...(isSelected && { boxShadow: `0 0 0 1px ${COLORS.borderActive}` }),
      }}
    >
      <div className="text-xs font-medium" style={{ color: COLORS.textDim }}>
        {policy.policyName}
      </div>
      <div className="mt-0.5 text-[10px]" style={{ color: COLORS.textDim }}>
        {skipReason}
      </div>
    </div>
  );
}
