// components/PolicyDetailPanel.tsx — Slide-in side panel for policy detail.

import { usePolicyStore } from '@/stores/usePolicyStore';
import { useEvaluationStore } from '@/stores/useEvaluationStore';
import { COLORS, CATEGORY_META } from '@/data/theme';
import type { ConditionalAccessPolicy } from '@/engine/models/Policy';
import type { PolicyEvaluationResult, ConditionMatchResult, ExtractedSessionControls } from '@/engine/models/EvaluationResult';
import { X, CheckCircle2, XCircle, Minus, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  inferCategory,
  findEvalResult,
  MATRIX_COLUMNS,
  getCellSummary,
  getVerdictSummary,
} from '@/components/matrix/matrixUtils';

// ── Main panel ──────────────────────────────────────────────────────

export function PolicyDetailPanel() {
  const selectedPolicyId = useEvaluationStore((s) => s.selectedPolicyId);
  const setSelectedPolicyId = useEvaluationStore((s) => s.setSelectedPolicyId);
  const result = useEvaluationStore((s) => s.result);
  const policies = usePolicyStore((s) => s.policies);
  const displayNames = usePolicyStore((s) => s.displayNames);

  const policy = policies.find((p) => p.id === selectedPolicyId);
  const evalResult = result && selectedPolicyId
    ? findEvalResult(result, selectedPolicyId)
    : undefined;

  const isOpen = !!policy;

  return (
    <div
      role="region"
      aria-label="Policy details"
      aria-hidden={!isOpen}
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        height: '100%',
        width: '350px',
        zIndex: 30,
        backgroundColor: COLORS.bgPanel,
        borderLeft: `1px solid ${COLORS.border}`,
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 200ms ease-out',
        overflowY: 'auto',
        pointerEvents: isOpen ? 'auto' : 'none',
      }}
    >
      {policy && (
        <>
          <PanelHeader
            policy={policy}
            onClose={() => setSelectedPolicyId(null)}
          />
          <Separator />
          {evalResult ? (
            <PostEvalDetail
              policy={policy}
              evalResult={evalResult}
              displayNames={displayNames}
            />
          ) : (
            <PreEvalDetail policy={policy} displayNames={displayNames} />
          )}
        </>
      )}
    </div>
  );
}

// ── Header ──────────────────────────────────────────────────────────

function PanelHeader({
  policy,
  onClose,
}: {
  policy: ConditionalAccessPolicy;
  onClose: () => void;
}) {
  const category = inferCategory(policy);
  const meta = CATEGORY_META[category] ?? CATEGORY_META.identity;

  let stateLabel: string;
  let stateColor: string;
  if (policy.state === 'enabled') {
    stateLabel = 'Enabled';
    stateColor = COLORS.granted;
  } else if (policy.state === 'enabledForReportingButNotEnforced') {
    stateLabel = 'Report-Only';
    stateColor = COLORS.reportOnly;
  } else {
    stateLabel = 'Disabled';
    stateColor = COLORS.textDim;
  }

  return (
    <div className="flex items-start justify-between p-4">
      <div className="flex-1 min-w-0 mr-2">
        <h3
          className="text-sm font-semibold leading-tight"
          style={{ color: COLORS.text }}
        >
          {policy.displayName}
        </h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0"
            style={{ borderColor: stateColor, color: stateColor }}
          >
            {stateLabel}
          </Badge>
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0"
            style={{ borderColor: meta.color, color: meta.color }}
          >
            {meta.icon} {meta.label}
          </Badge>
        </div>
      </div>
      <button
        onClick={onClose}
        className="shrink-0 rounded p-1 hover:bg-accent"
        style={{ color: COLORS.textMuted }}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Post-evaluation detail ──────────────────────────────────────────

function PostEvalDetail({
  policy,
  evalResult,
  displayNames,
}: {
  policy: ConditionalAccessPolicy;
  evalResult: PolicyEvaluationResult;
  displayNames: Map<string, string>;
}) {
  return (
    <div className="px-4 pb-4">
      {/* Conditions */}
      <SectionHeading>Conditions</SectionHeading>
      <div className="space-y-1">
        {MATRIX_COLUMNS.map((col) => {
          const cr = evalResult.conditionResults.find((r) =>
            col.conditionTypes.includes(r.conditionType),
          );
          return (
            <ConditionRow
              key={col.key}
              label={col.header}
              conditionResult={cr}
              summary={getCellSummary(policy, col.key, displayNames)}
            />
          );
        })}
      </div>

      {/* Grant Controls */}
      {evalResult.grantControls && (
        <>
          <SectionHeading className="mt-4">Grant Controls</SectionHeading>
          <div
            className="rounded border p-2.5 text-xs"
            style={{
              borderColor: COLORS.border,
              backgroundColor: COLORS.bgCard,
            }}
          >
            <div className="mb-1.5 flex items-center gap-1.5">
              <span style={{ color: COLORS.textMuted }}>Operator:</span>
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0"
                style={{ borderColor: COLORS.border }}
              >
                {evalResult.grantControls.operator}
              </Badge>
              <span className="ml-auto">
                {evalResult.grantControls.satisfied ? (
                  <CheckCircle2
                    className="h-3.5 w-3.5"
                    style={{ color: COLORS.granted }}
                  />
                ) : (
                  <XCircle
                    className="h-3.5 w-3.5"
                    style={{ color: COLORS.unsatisfied }}
                  />
                )}
              </span>
            </div>
            <div className="space-y-0.5">
              {evalResult.grantControls.controls.map((ctrl) => {
                const isSatisfied =
                  evalResult.grantControls!.satisfiedControls.includes(ctrl);
                return (
                  <div
                    key={ctrl}
                    className="flex items-center gap-1.5"
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
                    <span style={{ color: COLORS.text }}>{ctrl}</span>
                  </div>
                );
              })}
            </div>
            {evalResult.grantControls.authenticationStrength && (
              <div className="flex items-center gap-1.5 mt-1.5">
                {evalResult.grantControls.authenticationStrength.satisfied ? (
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
                <span style={{
                  color: evalResult.grantControls.authenticationStrength.satisfied
                    ? COLORS.granted
                    : COLORS.unsatisfied,
                }}>
                  authStrength: {evalResult.grantControls.authenticationStrength.displayName}
                </span>
              </div>
            )}
          </div>
        </>
      )}

      {/* Session Controls */}
      {evalResult.sessionControls &&
        Object.keys(evalResult.sessionControls).length > 0 && (
          <>
            <SectionHeading className="mt-4">Session Controls</SectionHeading>
            <div
              className="rounded border p-2.5 text-xs"
              style={{
                borderColor: COLORS.border,
                backgroundColor: COLORS.bgCard,
              }}
            >
              {formatExtractedSessionControls(evalResult.sessionControls).map(({ label, value }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span style={{ color: COLORS.textMuted }}>{label}:</span>
                  <span style={{ color: COLORS.text }}>{value}</span>
                </div>
              ))}
            </div>
          </>
        )}
    </div>
  );
}

// ── Pre-evaluation detail ───────────────────────────────────────────

function PreEvalDetail({
  policy,
  displayNames,
}: {
  policy: ConditionalAccessPolicy;
  displayNames: Map<string, string>;
}) {
  return (
    <div className="px-4 pb-4">
      {/* Conditions overview */}
      <SectionHeading>Conditions</SectionHeading>
      <div className="space-y-1.5">
        {MATRIX_COLUMNS.map((col) => {
          const summary = getCellSummary(policy, col.key, displayNames);
          const isDim = summary === '\u00b7';
          return (
            <div
              key={col.key}
              className="flex items-center gap-2 text-xs"
            >
              <span
                style={{ color: COLORS.textMuted, width: '80px', flexShrink: 0 }}
              >
                {col.header}
              </span>
              <span style={{ color: isDim ? COLORS.textDim : COLORS.text }}>
                {summary}
              </span>
            </div>
          );
        })}
      </div>

      {/* Grant Controls */}
      <SectionHeading className="mt-4">Grant Controls</SectionHeading>
      <div
        className="rounded border p-2.5 text-xs"
        style={{
          borderColor: COLORS.border,
          backgroundColor: COLORS.bgCard,
        }}
      >
        <span style={{ color: COLORS.text }}>
          {getVerdictSummary(policy)}
        </span>
      </div>

      {/* Session Controls */}
      {policy.sessionControls && (
        <>
          <SectionHeading className="mt-4">Session Controls</SectionHeading>
          <div
            className="rounded border p-2.5 text-xs"
            style={{
              borderColor: COLORS.border,
              backgroundColor: COLORS.bgCard,
            }}
          >
            <SessionControlsList sessionControls={policy.sessionControls} />
          </div>
        </>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function ConditionRow({
  label,
  conditionResult,
  summary,
}: {
  label: string;
  conditionResult: ConditionMatchResult | undefined;
  summary: string;
}) {
  let icon: React.ReactNode;
  let statusColor: string;
  let statusText: string;

  if (!conditionResult) {
    icon = <Minus className="h-3 w-3 shrink-0" style={{ color: COLORS.textDim }} />;
    statusColor = COLORS.textDim;
    statusText = summary === '\u00b7' ? 'Not configured' : 'Not evaluated';
  } else if (conditionResult.phase === 'exclusion') {
    icon = (
      <AlertTriangle
        className="h-3 w-3 shrink-0"
        style={{ color: COLORS.reportOnly }}
      />
    );
    statusColor = COLORS.reportOnly;
    statusText = 'Excluded';
  } else if (conditionResult.phase === 'notConfigured') {
    icon = <Minus className="h-3 w-3 shrink-0" style={{ color: COLORS.textDim }} />;
    statusColor = COLORS.textDim;
    statusText = 'Not configured';
  } else if (conditionResult.matches) {
    icon = (
      <CheckCircle2
        className="h-3 w-3 shrink-0"
        style={{ color: COLORS.granted }}
      />
    );
    statusColor = COLORS.granted;
    statusText = 'Match';
  } else {
    icon = (
      <XCircle
        className="h-3 w-3 shrink-0"
        style={{ color: COLORS.blocked }}
      />
    );
    statusColor = COLORS.blocked;
    statusText = 'No match';
  }

  return (
    <div
      className="rounded border px-2.5 py-1.5 text-xs"
      style={{
        borderColor: COLORS.border,
        backgroundColor: COLORS.bgCard,
      }}
    >
      <div className="flex items-center gap-1.5">
        {icon}
        <span style={{ color: COLORS.text, fontWeight: 500 }}>{label}</span>
        <span className="ml-auto text-[10px]" style={{ color: statusColor }}>
          {statusText}
        </span>
      </div>
      {conditionResult?.reason && (
        <p
          className="mt-0.5 pl-[18px] text-[10px] leading-tight line-clamp-2"
          style={{ color: COLORS.textMuted }}
        >
          {conditionResult.reason}
        </p>
      )}
    </div>
  );
}

function SessionControlsList({
  sessionControls,
}: {
  sessionControls: NonNullable<ConditionalAccessPolicy['sessionControls']>;
}) {
  const items: { label: string; value: string }[] = [];

  if (sessionControls.signInFrequency?.isEnabled) {
    const freq = sessionControls.signInFrequency;
    const unit = freq.type === 'hours'
      ? (freq.value === 1 ? 'hour' : 'hours')
      : (freq.value === 1 ? 'day' : 'days');
    items.push({
      label: 'Sign-in frequency',
      value: `${freq.value} ${unit}`,
    });
  }
  if (sessionControls.persistentBrowser?.isEnabled) {
    items.push({
      label: 'Persistent browser',
      value: sessionControls.persistentBrowser.mode,
    });
  }
  if (sessionControls.applicationEnforcedRestrictions?.isEnabled) {
    items.push({ label: 'App enforced restrictions', value: 'Enabled' });
  }
  if (sessionControls.cloudAppSecurity?.isEnabled) {
    items.push({
      label: 'Cloud App Security',
      value: sessionControls.cloudAppSecurity.cloudAppSecurityType,
    });
  }
  if (sessionControls.continuousAccessEvaluation) {
    items.push({
      label: 'CAE',
      value: sessionControls.continuousAccessEvaluation.mode,
    });
  }
  if (sessionControls.disableResilienceDefaults === true) {
    items.push({ label: 'Resilience defaults', value: 'Disabled' });
  }
  if (sessionControls.secureSignInSession?.isEnabled) {
    items.push({ label: 'Token protection', value: 'Enabled' });
  }

  if (items.length === 0) {
    return <span style={{ color: COLORS.textDim }}>None</span>;
  }

  return (
    <div className="space-y-0.5">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span style={{ color: COLORS.textMuted }}>{item.label}:</span>
          <span style={{ color: COLORS.text }}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function formatExtractedSessionControls(
  sc: ExtractedSessionControls,
): { label: string; value: string }[] {
  const items: { label: string; value: string }[] = [];

  if (sc.signInFrequency) {
    const freq = sc.signInFrequency;
    const unit = freq.type === 'hours'
      ? (freq.value === 1 ? 'hour' : 'hours')
      : (freq.value === 1 ? 'day' : 'days');
    items.push({ label: 'Sign-in frequency', value: `${freq.value} ${unit}` });
  }
  if (sc.persistentBrowser) {
    items.push({ label: 'Persistent browser', value: sc.persistentBrowser });
  }
  if (sc.cloudAppSecurity) {
    items.push({ label: 'Cloud app security', value: sc.cloudAppSecurity });
  }
  if (sc.continuousAccessEvaluation) {
    items.push({ label: 'CAE', value: sc.continuousAccessEvaluation });
  }
  if (sc.applicationEnforcedRestrictions) {
    items.push({ label: 'App enforced restrictions', value: 'Enabled' });
  }
  if (sc.disableResilienceDefaults) {
    items.push({ label: 'Resilience defaults', value: 'Disabled' });
  }
  if (sc.secureSignInSession) {
    items.push({ label: 'Token protection', value: 'Enabled' });
  }

  return items;
}

function SectionHeading({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h4
      className={`mb-1.5 text-[10px] font-semibold uppercase tracking-wider ${className}`}
      style={{ color: COLORS.textMuted }}
    >
      {children}
    </h4>
  );
}
