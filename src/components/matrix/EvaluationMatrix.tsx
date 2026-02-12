// components/matrix/EvaluationMatrix.tsx — Heatmap-style policy evaluation matrix.

import { useMemo } from 'react';
import { usePolicyStore } from '@/stores/usePolicyStore';
import { useEvaluationStore } from '@/stores/useEvaluationStore';
import { COLORS } from '@/data/theme';
import type { ConditionalAccessPolicy } from '@/engine/models/Policy';
import type { PolicyEvaluationResult } from '@/engine/models/EvaluationResult';
import { Zap } from 'lucide-react';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip';

import {
  MATRIX_COLUMNS,
  getCellSummary,
  getVerdictSummary,
  getPolicySubtitle,
  findConditionResult,
  getCellState,
  getRowGroup,
  sortPoliciesForMatrix,
  isFirstFailure,
  type MatrixColumn,
  type CellState,
  type RowGroup,
} from './matrixUtils';

// ── Color maps ──────────────────────────────────────────────────────

const CELL_BG: Record<CellState, string> = {
  match: COLORS.grantedBg,
  fail: COLORS.blockedBg,
  excluded: 'rgba(59, 130, 246, 0.06)',
  notConfigured: 'transparent',
  notEvaluated: 'transparent',
  disabled: 'transparent',
};

const CELL_TEXT: Record<CellState, string> = {
  match: COLORS.granted,
  fail: COLORS.blocked,
  excluded: COLORS.reportOnly,
  notConfigured: COLORS.textDim,
  notEvaluated: COLORS.textDim,
  disabled: COLORS.textDim,
};

const CELL_ICON: Record<CellState, string> = {
  match: '\u2713',
  fail: '\u2717',
  excluded: 'Excl',
  notConfigured: '\u00b7',
  notEvaluated: '\u2014',
  disabled: '\u00b7',
};

const ROW_BORDER_COLOR: Record<RowGroup, string> = {
  block: COLORS.blocked,
  controlsRequired: COLORS.unsatisfied,
  satisfied: COLORS.granted,
  reportOnly: COLORS.reportOnly,
  skipped: COLORS.textDim,
  disabled: COLORS.border,
};

const VERDICT_BADGE: Record<
  RowGroup,
  { color: string; bg: string }
> = {
  block: { color: COLORS.blocked, bg: COLORS.blockedBg },
  controlsRequired: { color: COLORS.unsatisfied, bg: COLORS.unsatisfiedBg },
  satisfied: { color: COLORS.granted, bg: COLORS.grantedBg },
  reportOnly: { color: COLORS.reportOnly, bg: COLORS.reportOnlyBg },
  skipped: { color: COLORS.textDim, bg: COLORS.notApplicableBg },
  disabled: { color: COLORS.textDim, bg: 'transparent' },
};

// ── Eval map type ───────────────────────────────────────────────────

interface EvalEntry {
  rowGroup: RowGroup;
  evalResult: PolicyEvaluationResult;
}

// ── Styles ──────────────────────────────────────────────────────────

const STICKY_LEFT: React.CSSProperties = {
  position: 'sticky',
  left: 0,
  zIndex: 20,
  backgroundColor: COLORS.bgPanel,
  width: '260px',
  minWidth: '220px',
  maxWidth: '300px',
};

const STICKY_RIGHT: React.CSSProperties = {
  position: 'sticky',
  right: 0,
  zIndex: 20,
  backgroundColor: COLORS.bgPanel,
  width: '100px',
  minWidth: '90px',
  textAlign: 'center',
};

const CELL_STYLE: React.CSSProperties = {
  padding: '6px 8px',
  minWidth: '70px',
  maxWidth: '100px',
  borderBottom: `1px solid ${COLORS.border}`,
  borderRight: `1px solid ${COLORS.border}`,
  textAlign: 'center',
  fontSize: '11px',
  whiteSpace: 'nowrap',
};

const HEADER_STYLE: React.CSSProperties = {
  padding: '6px 8px',
  textAlign: 'left',
  fontWeight: 600,
  fontSize: '10px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: COLORS.textMuted,
  borderBottom: `2px solid ${COLORS.border}`,
  whiteSpace: 'nowrap',
};

// ── Main component ──────────────────────────────────────────────────

export function EvaluationMatrix() {
  const policies = usePolicyStore((s) => s.policies);
  const displayNames = usePolicyStore((s) => s.displayNames);
  const isLoading = usePolicyStore((s) => s.isLoading);
  const result = useEvaluationStore((s) => s.result);
  const selectedPolicyId = useEvaluationStore((s) => s.selectedPolicyId);
  const setSelectedPolicyId = useEvaluationStore((s) => s.setSelectedPolicyId);

  const sortedPolicies = useMemo(
    () => sortPoliciesForMatrix(policies, result),
    [policies, result],
  );

  // Build eval lookup
  const evalMap = useMemo(() => {
    if (!result) return null;
    const map = new Map<string, EvalEntry>();

    for (const p of result.appliedPolicies) {
      let rowGroup: RowGroup;
      if (p.grantControls?.controls.includes('block')) {
        rowGroup = 'block';
      } else if (!p.grantControls?.satisfied) {
        rowGroup = 'controlsRequired';
      } else {
        rowGroup = 'satisfied';
      }
      map.set(p.policyId, { rowGroup, evalResult: p });
    }
    for (const p of result.reportOnlyPolicies) {
      map.set(p.policyId, { rowGroup: 'reportOnly', evalResult: p });
    }
    for (const p of result.skippedPolicies) {
      const rowGroup: RowGroup = p.state === 'disabled' ? 'disabled' : 'skipped';
      map.set(p.policyId, { rowGroup, evalResult: p });
    }
    return map;
  }, [result]);

  if (policies.length === 0) {
    return <EmptyState isLoading={isLoading} />;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TooltipProvider delayDuration={300}>
        <div className="flex-1 overflow-auto">
          <table
            style={{
              width: '100%',
              minWidth: '800px',
              borderCollapse: 'separate',
              borderSpacing: 0,
              backgroundColor: COLORS.bgPanel,
              fontSize: '11px',
            }}
          >
            <thead>
              <tr>
                <th style={{ ...HEADER_STYLE, ...STICKY_LEFT, borderBottom: `2px solid ${COLORS.border}` }}>
                  Policy
                </th>
                {MATRIX_COLUMNS.map((col) => (
                  <th key={col.key} style={{ ...HEADER_STYLE, textAlign: 'center', minWidth: '70px' }}>
                    {col.header}
                  </th>
                ))}
                <th style={{ ...HEADER_STYLE, ...STICKY_RIGHT, textAlign: 'center', borderBottom: `2px solid ${COLORS.border}` }}>
                  Verdict
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedPolicies.map((policy, i) => {
                const evalEntry = evalMap?.get(policy.id);
                const rowGroup = evalEntry?.rowGroup ?? getRowGroup(policy, result);

                return (
                  <MatrixRow
                    key={policy.id}
                    policy={policy}
                    evalEntry={evalEntry}
                    rowGroup={rowGroup}
                    isSelected={selectedPolicyId === policy.id}
                    onClick={() =>
                      setSelectedPolicyId(
                        selectedPolicyId === policy.id ? null : policy.id,
                      )
                    }
                    displayNames={displayNames}
                    hasEvaluation={!!result}
                    isEven={i % 2 === 0}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </TooltipProvider>
    </div>
  );
}

// ── Matrix row ──────────────────────────────────────────────────────

function MatrixRow({
  policy,
  evalEntry,
  rowGroup,
  isSelected,
  onClick,
  displayNames,
  hasEvaluation,
  isEven,
}: {
  policy: ConditionalAccessPolicy;
  evalEntry: EvalEntry | undefined;
  rowGroup: RowGroup;
  isSelected: boolean;
  onClick: () => void;
  displayNames: Map<string, string>;
  hasEvaluation: boolean;
  isEven: boolean;
}) {
  const opacity =
    rowGroup === 'disabled' ? 0.3 : rowGroup === 'skipped' ? 0.6 : 1;
  const leftBorderColor = hasEvaluation
    ? ROW_BORDER_COLOR[rowGroup]
    : COLORS.border;

  const rowBg = isSelected
    ? 'rgba(59, 130, 246, 0.06)'
    : isEven
      ? COLORS.bgPanel
      : COLORS.bgCard;

  // State badge
  let stateBadge: { label: string; color: string };
  if (policy.state === 'enabled') {
    stateBadge = { label: 'On', color: COLORS.granted };
  } else if (policy.state === 'enabledForReportingButNotEnforced') {
    stateBadge = { label: 'RO', color: COLORS.reportOnly };
  } else {
    stateBadge = { label: 'Off', color: COLORS.textDim };
  }

  // Disambiguating subtitle
  const subtitle = getPolicySubtitle(policy, displayNames);

  return (
    <tr
      onClick={onClick}
      style={{
        cursor: 'pointer',
        opacity,
        borderLeft: `3px solid ${leftBorderColor}`,
      }}
      onMouseEnter={(e) => {
        const cells = e.currentTarget.querySelectorAll('td');
        cells.forEach((td) => {
          td.style.filter = 'brightness(1.15)';
        });
      }}
      onMouseLeave={(e) => {
        const cells = e.currentTarget.querySelectorAll('td');
        cells.forEach((td) => {
          td.style.filter = '';
        });
      }}
    >
      {/* Policy name — sticky left */}
      <td
        style={{
          ...STICKY_LEFT,
          padding: '5px 8px',
          borderBottom: `1px solid ${COLORS.border}`,
          borderRight: `1px solid ${COLORS.border}`,
          backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.06)' : (isEven ? COLORS.bgPanel : COLORS.bgCard),
        }}
      >
        <div className="flex items-center gap-2">
          <span
            style={{
              fontSize: '11px',
              fontWeight: 500,
              color: COLORS.text,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '220px',
              display: 'block',
              textDecoration: policy.state === 'disabled' ? 'line-through' : undefined,
            }}
          >
            {policy.displayName}
          </span>
          <span
            style={{
              fontSize: '9px',
              color: stateBadge.color,
              flexShrink: 0,
            }}
          >
            {stateBadge.label}
          </span>
        </div>
        {subtitle && (
          <div
            style={{
              fontSize: '10px',
              color: COLORS.textMuted,
              lineHeight: 1.2,
              marginTop: '1px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '220px',
            }}
          >
            {subtitle}
          </div>
        )}
      </td>

      {/* Condition cells */}
      {MATRIX_COLUMNS.map((col) => (
        <ConditionCell
          key={col.key}
          policy={policy}
          column={col}
          evalEntry={evalEntry}
          displayNames={displayNames}
          hasEvaluation={hasEvaluation}
          rowBg={rowBg}
        />
      ))}

      {/* Verdict — sticky right */}
      <VerdictCell
        policy={policy}
        evalEntry={evalEntry}
        rowGroup={rowGroup}
        hasEvaluation={hasEvaluation}
        isSelected={isSelected}
        isEven={isEven}
      />
    </tr>
  );
}

// ── Condition cell ──────────────────────────────────────────────────

function ConditionCell({
  policy,
  column,
  evalEntry,
  displayNames,
  hasEvaluation,
  rowBg,
}: {
  policy: ConditionalAccessPolicy;
  column: MatrixColumn;
  evalEntry: EvalEntry | undefined;
  displayNames: Map<string, string>;
  hasEvaluation: boolean;
  rowBg: string;
}) {
  const summary = getCellSummary(policy, column.key, displayNames);

  if (!hasEvaluation) {
    // Pre-evaluation: config summary text
    const isDim = summary === '\u00b7';
    return (
      <td style={{ ...CELL_STYLE, backgroundColor: rowBg }}>
        <span style={{ color: isDim ? COLORS.textDim : COLORS.textMuted }}>
          {summary}
        </span>
      </td>
    );
  }

  // Post-evaluation: match indicators
  const conditionResult = evalEntry
    ? findConditionResult(evalEntry.evalResult.conditionResults, column)
    : undefined;
  const cellState = getCellState(conditionResult, policy, column.key);
  const isKnockout =
    cellState === 'fail' &&
    evalEntry &&
    isFirstFailure(evalEntry.evalResult.conditionResults, column);

  const cellBg = CELL_BG[cellState];
  const cellText = CELL_TEXT[cellState];
  const icon = CELL_ICON[cellState];

  const knockoutStyle: React.CSSProperties = isKnockout
    ? {
        borderLeft: `2px solid ${COLORS.blocked}`,
        backgroundColor: 'rgba(239, 68, 68, 0.12)',
      }
    : {};

  // Only show tooltip for cells with actual condition results
  if (conditionResult && cellState !== 'notConfigured') {
    return (
      <td
        style={{
          ...CELL_STYLE,
          backgroundColor: cellBg,
          ...knockoutStyle,
        }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              style={{
                color: cellText,
                fontWeight: cellState === 'match' || cellState === 'fail' ? 600 : 400,
                cursor: 'default',
              }}
            >
              {icon}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[280px]">
            <p className="text-xs font-semibold" style={{ color: cellText }}>
              {column.header} — {conditionResult.matches ? 'Match' : 'No Match'}
            </p>
            <p className="text-[10px] text-muted-foreground">
              Phase: {conditionResult.phase}
            </p>
            <p className="text-[10px] text-muted-foreground line-clamp-2">
              {conditionResult.reason}
            </p>
          </TooltipContent>
        </Tooltip>
      </td>
    );
  }

  // No tooltip — unconfigured, not evaluated, or disabled
  const tooltipText =
    cellState === 'notEvaluated'
      ? 'Not evaluated — policy was skipped before reaching this condition'
      : null;

  if (tooltipText) {
    return (
      <td style={{ ...CELL_STYLE, backgroundColor: cellBg }}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div style={{ color: cellText, cursor: 'default' }}>{icon}</div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-[10px] text-muted-foreground">{tooltipText}</p>
          </TooltipContent>
        </Tooltip>
      </td>
    );
  }

  return (
    <td style={{ ...CELL_STYLE, backgroundColor: cellBg }}>
      <span style={{ color: cellText }}>{icon}</span>
    </td>
  );
}

// ── Verdict cell ────────────────────────────────────────────────────

function VerdictCell({
  policy,
  evalEntry,
  rowGroup,
  hasEvaluation,
  isSelected,
  isEven,
}: {
  policy: ConditionalAccessPolicy;
  evalEntry: EvalEntry | undefined;
  rowGroup: RowGroup;
  hasEvaluation: boolean;
  isSelected: boolean;
  isEven: boolean;
}) {
  const stickyBg = isSelected
    ? 'rgba(59, 130, 246, 0.06)'
    : isEven
      ? COLORS.bgPanel
      : COLORS.bgCard;

  if (!hasEvaluation || policy.state === 'disabled') {
    // Pre-eval or disabled: show grant control summary
    return (
      <td
        style={{
          ...STICKY_RIGHT,
          padding: '6px 8px',
          borderBottom: `1px solid ${COLORS.border}`,
          backgroundColor: stickyBg,
        }}
      >
        <span style={{ color: COLORS.textDim, fontSize: '11px' }}>
          {getVerdictSummary(policy)}
        </span>
      </td>
    );
  }

  // Post-eval: colored verdict badge
  const { label, unsatisfiedControls } = getVerdictLabel(evalEntry, rowGroup);
  const badge = VERDICT_BADGE[rowGroup];

  return (
    <td
      style={{
        ...STICKY_RIGHT,
        padding: '6px 8px',
        borderBottom: `1px solid ${COLORS.border}`,
        backgroundColor: stickyBg,
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            style={{
              display: 'inline-block',
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: 600,
              color: badge.color,
              backgroundColor: badge.bg,
              textTransform: 'uppercase',
            }}
          >
            {label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p className="text-xs font-semibold" style={{ color: badge.color }}>
            {label}
          </p>
          {unsatisfiedControls && unsatisfiedControls.length > 0 && (
            <p className="text-[10px] text-muted-foreground">
              Requires: {unsatisfiedControls.join(', ')}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </td>
  );
}

function getVerdictLabel(
  evalEntry: EvalEntry | undefined,
  rowGroup: RowGroup,
): { label: string; unsatisfiedControls?: string[] } {
  if (!evalEntry) {
    return { label: rowGroup === 'disabled' ? 'OFF' : '\u2014' };
  }

  switch (rowGroup) {
    case 'block':
      return { label: 'BLOCK' };
    case 'controlsRequired': {
      const ctrls = evalEntry.evalResult.grantControls?.unsatisfiedControls ?? [];
      return { label: ctrls.length <= 2 ? ctrls.join(',') : 'CONTROLS', unsatisfiedControls: ctrls };
    }
    case 'satisfied':
      return { label: 'ALLOW' };
    case 'reportOnly':
      return { label: 'REPORT' };
    case 'skipped':
      return { label: 'SKIP' };
    case 'disabled':
      return { label: 'OFF' };
  }
}

// ── Empty / Loading states ──────────────────────────────────────────

function EmptyState({ isLoading }: { isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex h-full flex-col p-4">
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse rounded"
              style={{
                backgroundColor: COLORS.bgCard,
                height: '32px',
                opacity: 0.5,
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8">
      <Zap className="h-8 w-8" style={{ color: COLORS.textDim }} />
      <p className="text-center text-sm text-muted-foreground">
        Sign in and load policies to see the evaluation matrix
      </p>
    </div>
  );
}
