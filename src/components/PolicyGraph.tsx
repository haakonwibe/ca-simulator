// components/PolicyGraph.tsx — Interactive policy grid visualization.

import { useMemo } from 'react';
import { usePolicyStore } from '@/stores/usePolicyStore';
import { useEvaluationStore } from '@/stores/useEvaluationStore';
import { COLORS, CATEGORY_META } from '@/data/theme';
import type { ConditionalAccessPolicy } from '@/engine/models/Policy';
import type { PolicyEvaluationResult } from '@/engine/models/EvaluationResult';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Eye,
  Zap,
} from 'lucide-react';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip';
import { inferCategory } from '@/components/matrix/matrixUtils';

// ── Tile evaluation state ───────────────────────────────────────────

type TileState =
  | 'default'
  | 'applied-satisfied'
  | 'applied-unsatisfied'
  | 'applied-block'
  | 'reportOnly'
  | 'skipped'
  | 'disabled';

function getTileStyle(state: TileState): {
  borderColor: string;
  bg: string;
  opacity: number;
  glow: string;
  icon: typeof CheckCircle2 | typeof AlertTriangle | typeof XCircle | typeof Eye | null;
  iconColor: string;
} {
  switch (state) {
    case 'applied-satisfied':
      return {
        borderColor: COLORS.granted,
        bg: COLORS.grantedBg,
        opacity: 1,
        glow: `0 0 8px ${COLORS.grantedGlow}`,
        icon: CheckCircle2,
        iconColor: COLORS.granted,
      };
    case 'applied-unsatisfied':
      return {
        borderColor: COLORS.unsatisfied,
        bg: COLORS.unsatisfiedBg,
        opacity: 1,
        glow: `0 0 8px ${COLORS.unsatisfiedGlow}`,
        icon: AlertTriangle,
        iconColor: COLORS.unsatisfied,
      };
    case 'applied-block':
      return {
        borderColor: COLORS.blocked,
        bg: COLORS.blockedBg,
        opacity: 1,
        glow: `0 0 8px ${COLORS.blockedGlow}`,
        icon: XCircle,
        iconColor: COLORS.blocked,
      };
    case 'reportOnly':
      return {
        borderColor: COLORS.reportOnly,
        bg: COLORS.reportOnlyBg,
        opacity: 1,
        glow: `0 0 8px ${COLORS.reportOnlyGlow}`,
        icon: Eye,
        iconColor: COLORS.reportOnly,
      };
    case 'skipped':
      return {
        borderColor: COLORS.border,
        bg: 'transparent',
        opacity: 0.4,
        glow: 'none',
        icon: null,
        iconColor: '',
      };
    case 'disabled':
      return {
        borderColor: COLORS.border,
        bg: 'transparent',
        opacity: 0.3,
        glow: 'none',
        icon: null,
        iconColor: '',
      };
    default:
      return {
        borderColor: COLORS.border,
        bg: COLORS.bgCard,
        opacity: 1,
        glow: 'none',
        icon: null,
        iconColor: '',
      };
  }
}

// ── Tooltip verdict helper ──────────────────────────────────────────

function getEvalVerdict(tileState: TileState, evalResult?: PolicyEvaluationResult): string | null {
  if (!evalResult || tileState === 'default') return null;
  switch (tileState) {
    case 'applied-block':
      return 'Applied \u2014 Block';
    case 'applied-satisfied':
      return 'Applied \u2014 Controls satisfied';
    case 'applied-unsatisfied': {
      const unsatisfied = evalResult.grantControls?.unsatisfiedControls ?? [];
      return `Applied \u2014 Requires: ${unsatisfied.join(', ')}`;
    }
    case 'reportOnly':
      return 'Report-only \u2014 Would apply';
    case 'skipped': {
      const failed = evalResult.conditionResults.find((cr) => !cr.matches);
      return `Skipped \u2014 ${failed?.reason ?? 'Not in scope'}`;
    }
    case 'disabled':
      return 'Disabled';
    default:
      return null;
  }
}

// ── Main component ──────────────────────────────────────────────────

export function PolicyGraph() {
  const policies = usePolicyStore((s) => s.policies);
  const isLoading = usePolicyStore((s) => s.isLoading);
  const result = useEvaluationStore((s) => s.result);
  const selectedPolicyId = useEvaluationStore((s) => s.selectedPolicyId);
  const setSelectedPolicyId = useEvaluationStore((s) => s.setSelectedPolicyId);

  // Build lookup maps from evaluation result
  const evalMap = useMemo(() => {
    if (!result) return null;

    const map = new Map<string, { state: TileState; evalResult: PolicyEvaluationResult }>();

    for (const p of result.appliedPolicies) {
      let state: TileState;
      if (p.grantControls?.controls.includes('block')) {
        state = 'applied-block';
      } else if (p.grantControls?.satisfied) {
        state = 'applied-satisfied';
      } else {
        state = 'applied-unsatisfied';
      }
      map.set(p.policyId, { state, evalResult: p });
    }

    for (const p of result.reportOnlyPolicies) {
      map.set(p.policyId, { state: 'reportOnly', evalResult: p });
    }

    for (const p of result.skippedPolicies) {
      const state: TileState = p.state === 'disabled' ? 'disabled' : 'skipped';
      map.set(p.policyId, { state, evalResult: p });
    }

    return map;
  }, [result]);

  if (policies.length === 0) {
    return <EmptyState isLoading={isLoading} />;
  }

  // Stats
  const enabledCount = policies.filter((p) => p.state === 'enabled').length;
  const disabledCount = policies.filter((p) => p.state === 'disabled').length;
  const reportOnlyCount = policies.filter(
    (p) => p.state === 'enabledForReportingButNotEnforced',
  ).length;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Stats bar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
        <span className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{policies.length}</span> policies
        </span>
        <span className="text-[10px] text-muted-foreground">
          {enabledCount} enabled &middot; {disabledCount} disabled &middot; {reportOnlyCount} report-only
        </span>
      </div>

      {/* Grid area */}
      <TooltipProvider delayDuration={300}>
        <div className="flex-1 overflow-y-auto p-4">
          <div
            className="mx-auto grid gap-3"
            style={{
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              maxWidth: '900px',
            }}
          >
            {policies.map((policy, index) => {
              const category = inferCategory(policy);
              const evalEntry = evalMap?.get(policy.id);
              const tileState: TileState = evalEntry?.state ?? (
                policy.state === 'disabled' ? 'disabled' : 'default'
              );

              return (
                <PolicyTile
                  key={policy.id}
                  policy={policy}
                  category={category}
                  tileState={tileState}
                  evalResult={evalEntry?.evalResult}
                  isSelected={selectedPolicyId === policy.id}
                  onClick={() => setSelectedPolicyId(selectedPolicyId === policy.id ? null : policy.id)}
                  index={index}
                  hasEvaluation={!!result}
                />
              );
            })}
          </div>
        </div>
      </TooltipProvider>

      {/* Category legend */}
      <CategoryLegend />
    </div>
  );
}

// ── Policy tile ─────────────────────────────────────────────────────

function PolicyTile({
  policy,
  category,
  tileState,
  evalResult,
  isSelected,
  onClick,
  index,
  hasEvaluation,
}: {
  policy: ConditionalAccessPolicy;
  category: string;
  tileState: TileState;
  evalResult?: PolicyEvaluationResult;
  isSelected: boolean;
  onClick: () => void;
  index: number;
  hasEvaluation: boolean;
}) {
  const meta = CATEGORY_META[category] ?? CATEGORY_META.identity;
  const style = getTileStyle(tileState);
  const OverlayIcon = style.icon;

  // Border colors — use explicit longhand to avoid shorthand/longhand conflict
  const isGlowState =
    tileState === 'applied-satisfied' ||
    tileState === 'applied-unsatisfied' ||
    tileState === 'applied-block' ||
    tileState === 'reportOnly';

  const topBorderColor = isSelected
    ? COLORS.borderActive
    : isGlowState
      ? style.borderColor
      : meta.color;

  const sideBorderColor = isSelected
    ? COLORS.borderActive
    : isGlowState
      ? style.borderColor
      : COLORS.border;

  // State badge config
  let stateBadge: { label: string; dotColor: string };
  if (policy.state === 'enabled') {
    stateBadge = { label: 'On', dotColor: COLORS.granted };
  } else if (policy.state === 'enabledForReportingButNotEnforced') {
    stateBadge = { label: 'RO', dotColor: COLORS.reportOnly };
  } else {
    stateBadge = { label: 'Off', dotColor: COLORS.textDim };
  }

  // Tooltip text
  const stateLabel = policy.state === 'enabled' ? 'Enabled'
    : policy.state === 'enabledForReportingButNotEnforced' ? 'Report-Only' : 'Disabled';
  const evalVerdict = getEvalVerdict(tileState, evalResult);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className="relative flex flex-col rounded-lg border text-left"
          style={{
            borderTopColor: topBorderColor,
            borderRightColor: sideBorderColor,
            borderBottomColor: sideBorderColor,
            borderLeftColor: sideBorderColor,
            backgroundColor: style.bg,
            opacity: style.opacity,
            boxShadow: isSelected ? `0 0 0 1px ${COLORS.borderActive}` : style.glow,
            borderTopWidth: 3,
            minHeight: '90px',
            transition: 'all 0.3s ease',
            transitionDelay: hasEvaluation ? `${index * 30}ms` : '0ms',
          }}
          onMouseEnter={(e) => {
            if (tileState !== 'skipped' && tileState !== 'disabled') {
              e.currentTarget.style.backgroundColor = COLORS.bgCardHover;
              e.currentTarget.style.transform = 'scale(1.02)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = style.bg;
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          {/* State badge — top right */}
          <div className="absolute right-1.5 top-1.5">
            <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: stateBadge.dotColor }}
              />
              {stateBadge.label}
            </span>
          </div>

          {/* Evaluation overlay icon — top right below state badge */}
          {OverlayIcon && (
            <div className="absolute right-1.5 top-5">
              <OverlayIcon className="h-3.5 w-3.5" style={{ color: style.iconColor }} />
            </div>
          )}

          {/* Policy name */}
          <div className="flex-1 px-2.5 pt-2 pr-8">
            <span
              className="text-[11px] font-medium leading-tight text-foreground"
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                textDecoration: tileState === 'disabled' ? 'line-through' : undefined,
              }}
            >
              {policy.displayName}
            </span>
          </div>

          {/* Category icon — bottom left */}
          <div className="px-2.5 pb-1.5">
            <span className="text-xs" title={meta.label}>
              {meta.icon}
            </span>
          </div>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[250px]">
        <p className="font-semibold text-xs">{policy.displayName}</p>
        <p className="text-[10px] text-muted-foreground">
          {stateLabel} &middot; {meta.label}
        </p>
        {evalVerdict && (
          <p className="text-[10px] mt-0.5" style={{ color: style.iconColor || COLORS.textMuted }}>
            {evalVerdict}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

// ── Category legend ─────────────────────────────────────────────────

function CategoryLegend() {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-border px-4 py-2">
      {Object.entries(CATEGORY_META).map(([key, meta]) => (
        <span key={key} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: meta.color }}
          />
          {meta.label}
        </span>
      ))}
    </div>
  );
}

// ── Empty / Loading states ──────────────────────────────────────────

function EmptyState({ isLoading }: { isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex h-full flex-col p-4">
        <div
          className="mx-auto flex-1 grid gap-3 w-full"
          style={{
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            maxWidth: '900px',
          }}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse rounded-lg border"
              style={{
                borderColor: COLORS.border,
                backgroundColor: COLORS.bgCard,
                minHeight: '90px',
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
        Sign in and load policies to see the policy landscape
      </p>
    </div>
  );
}
