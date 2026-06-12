// components/BaselineView.tsx — Microsoft baseline assessment view.
//
// Assesses effectivePolicies (sandbox-aware) against the template catalog in
// data/baselineChecks.ts via lib/baselineAssessment.ts. Full-area view like
// Gaps/Impact.

import { useState, useMemo } from 'react';
import { usePolicyStore } from '@/stores/usePolicyStore';
import { useEvaluationStore } from '@/stores/useEvaluationStore';
import { COLORS } from '@/data/theme';
import { assessBaseline, type BaselineCheckResult, type BaselineStatus } from '@/lib/baselineAssessment';
import { BASELINE_CATEGORY_LABELS, type BaselineCategory } from '@/data/baselineChecks';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ClipboardCheck,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Eye,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Beaker,
} from 'lucide-react';

// ── Status styling ──

const STATUS_CONFIG: Record<BaselineStatus, {
  label: string;
  color: string;
  bg: string;
  Icon: typeof ShieldCheck;
  order: number;
}> = {
  fail: { label: 'FAIL', color: COLORS.blocked, bg: COLORS.blockedBg, Icon: ShieldAlert, order: 0 },
  partial: { label: 'PARTIAL', color: COLORS.unsatisfied, bg: COLORS.unsatisfiedBg, Icon: AlertTriangle, order: 1 },
  reportOnly: { label: 'REPORT-ONLY', color: COLORS.reportOnly, bg: COLORS.reportOnlyBg, Icon: Eye, order: 2 },
  pass: { label: 'PASS', color: COLORS.granted, bg: COLORS.grantedBg, Icon: ShieldCheck, order: 3 },
};

const CATEGORY_ORDER: BaselineCategory[] = [
  'secureFoundation',
  'zeroTrust',
  'remoteWork',
  'protectAdmin',
  'emergingThreats',
];

// ── Main view ──

export function BaselineView() {
  const policies = usePolicyStore((s) => s.effectivePolicies);
  const authStrengthMap = usePolicyStore((s) => s.authStrengthMap);
  const sandboxActive = usePolicyStore((s) => s.sandboxActive);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<BaselineCategory | null>(null);
  const [hideLicenseGated, setHideLicenseGated] = useState(false);

  const assessment = useMemo(
    () => (policies.length > 0 ? assessBaseline(policies, authStrengthMap) : null),
    [policies, authStrengthMap],
  );

  if (!assessment) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8">
        <ClipboardCheck className="h-8 w-8" style={{ color: COLORS.textDim }} />
        <p className="text-center text-sm text-muted-foreground">
          Load policies from your tenant or use sample data to assess your baseline
        </p>
      </div>
    );
  }

  const visibleChecks = assessment.checks
    .filter((c) => !categoryFilter || c.check.categories.includes(categoryFilter))
    .filter((c) => !hideLicenseGated || c.check.license === 'P1')
    .sort((a, b) => {
      const orderDiff = STATUS_CONFIG[a.status].order - STATUS_CONFIG[b.status].order;
      if (orderDiff !== 0) return orderDiff;
      return a.check.name.localeCompare(b.check.name);
    });

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <BaselineHeader
        assessment={assessment}
        categoryFilter={categoryFilter}
        onCategoryFilter={setCategoryFilter}
        hideLicenseGated={hideLicenseGated}
        onToggleLicenseGated={() => setHideLicenseGated((v) => !v)}
        sandboxActive={sandboxActive}
      />

      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-3xl space-y-2 p-4">
          {visibleChecks.map((result) => (
            <CheckCard
              key={result.check.id}
              result={result}
              isExpanded={expanded.has(result.check.id)}
              onToggle={() => toggleExpanded(result.check.id)}
              sandboxActive={sandboxActive}
            />
          ))}
          {visibleChecks.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No checks match the current filters
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Header ──

function BaselineHeader({
  assessment,
  categoryFilter,
  onCategoryFilter,
  hideLicenseGated,
  onToggleLicenseGated,
  sandboxActive,
}: {
  assessment: NonNullable<ReturnType<typeof assessBaseline>>;
  categoryFilter: BaselineCategory | null;
  onCategoryFilter: (c: BaselineCategory | null) => void;
  hideLicenseGated: boolean;
  onToggleLicenseGated: () => void;
  sandboxActive: boolean;
}) {
  const { counts } = assessment;
  const total = counts.pass + counts.reportOnly + counts.partial + counts.fail;

  const segments: { status: BaselineStatus; count: number }[] = [
    { status: 'pass', count: counts.pass },
    { status: 'reportOnly', count: counts.reportOnly },
    { status: 'partial', count: counts.partial },
    { status: 'fail', count: counts.fail },
  ];

  return (
    <div className="shrink-0 border-b border-border px-4 py-3">
      <div className="mx-auto max-w-3xl space-y-2.5">
        {/* Headline + segment bar */}
        <div className="flex items-center gap-4">
          <div className="shrink-0">
            <span className="text-lg font-bold" style={{ color: COLORS.text }}>
              {counts.pass} of {total}
            </span>
            <span className="ml-1.5 text-xs text-muted-foreground">checks pass</span>
          </div>
          <div
            className="flex h-2 flex-1 overflow-hidden rounded-full"
            style={{ backgroundColor: COLORS.bgCard }}
            role="img"
            aria-label={`${counts.pass} pass, ${counts.reportOnly} report-only, ${counts.partial} partial, ${counts.fail} fail`}
          >
            {segments.filter((s) => s.count > 0).map((s) => (
              <div
                key={s.status}
                style={{
                  width: `${(s.count / total) * 100}%`,
                  backgroundColor: STATUS_CONFIG[s.status].color,
                }}
              />
            ))}
          </div>
          {sandboxActive && (
            <span className="flex shrink-0 items-center gap-1 text-[10px]" style={{ color: COLORS.warning }}>
              <Beaker className="h-3 w-3" />
              assessing sandbox
            </span>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-1.5">
          {CATEGORY_ORDER.map((category) => {
            const active = categoryFilter === category;
            const catCounts = assessment.categoryCounts[category];
            return (
              <button
                key={category}
                onClick={() => onCategoryFilter(active ? null : category)}
                className="rounded-full border px-2 py-0.5 text-[10px] transition-colors"
                style={{
                  color: active ? COLORS.accentLight : COLORS.textMuted,
                  borderColor: active ? COLORS.accentLight : COLORS.border,
                  backgroundColor: active ? COLORS.selectedBg : 'transparent',
                }}
              >
                {BASELINE_CATEGORY_LABELS[category]} · {catCounts.passed}/{catCounts.total}
              </button>
            );
          })}
          <button
            onClick={onToggleLicenseGated}
            className="ml-auto rounded-full border px-2 py-0.5 text-[10px] transition-colors"
            style={{
              color: hideLicenseGated ? COLORS.accentLight : COLORS.textMuted,
              borderColor: hideLicenseGated ? COLORS.accentLight : COLORS.border,
              backgroundColor: hideLicenseGated ? COLORS.selectedBg : 'transparent',
            }}
            title="Hide checks requiring Entra ID P2 or Microsoft Purview"
          >
            {hideLicenseGated ? 'Showing P1 only' : 'Hide P2/Purview checks'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Check card ──

function CheckCard({
  result,
  isExpanded,
  onToggle,
  sandboxActive,
}: {
  result: BaselineCheckResult;
  isExpanded: boolean;
  onToggle: () => void;
  sandboxActive: boolean;
}) {
  const config = STATUS_CONFIG[result.status];
  const Icon = config.Icon;
  const Chevron = isExpanded ? ChevronDown : ChevronRight;
  const { check } = result;

  const coverage = result.status === 'partial'
    ? `${result.scenariosPassed}/${result.scenariosTotal} scenarios`
    : null;

  return (
    <Card
      className="overflow-hidden p-0"
      style={{ backgroundColor: COLORS.bgCard, borderColor: COLORS.border, borderLeftWidth: 3, borderLeftColor: config.color }}
    >
      <button
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-accent/30 transition-colors"
      >
        <Icon className="h-4 w-4 shrink-0" style={{ color: config.color }} />
        <span className="min-w-0 flex-1 text-sm font-medium" style={{ color: COLORS.text }}>
          {check.name}
        </span>
        {coverage && (
          <span className="shrink-0 text-[10px]" style={{ color: COLORS.textMuted }}>
            {coverage}
          </span>
        )}
        {check.license !== 'P1' && (
          <Badge
            variant="outline"
            className="shrink-0 px-1.5 py-0 text-[9px]"
            style={{ color: COLORS.evaluating, borderColor: COLORS.evaluating }}
          >
            {check.license === 'P2' ? 'Entra ID P2' : 'Purview'}
          </Badge>
        )}
        <Badge
          variant="outline"
          className="shrink-0 px-1.5 py-0 text-[9px]"
          style={{ color: config.color, borderColor: config.color, backgroundColor: config.bg }}
        >
          {config.label}
        </Badge>
        <Chevron className="h-3.5 w-3.5 shrink-0" style={{ color: COLORS.textDim }} />
      </button>

      {isExpanded && (
        <div className="space-y-3 border-t px-3 py-3 text-xs" style={{ borderColor: COLORS.border }}>
          {/* Why it matters */}
          <p style={{ color: COLORS.textMuted }}>
            {check.whyItMatters}{' '}
            <a
              href={check.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 hover:underline"
              style={{ color: COLORS.accentLight }}
            >
              Microsoft template
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </p>

          {/* Evidence */}
          {result.status === 'pass' && result.satisfyingPolicies.length > 0 && (
            <EvidenceSection title="Provided by">
              {result.satisfyingPolicies.map((name) => (
                <PolicyLink key={name} name={name} />
              ))}
            </EvidenceSection>
          )}

          {result.status === 'reportOnly' && (
            <EvidenceSection title="Configured but not enforced">
              <p style={{ color: COLORS.textMuted }}>
                {result.promotablePolicies.length === 1 ? 'This policy is' : 'These policies are'} in
                report-only mode and would satisfy this check if enabled
                {sandboxActive
                  ? ' — flip it to On below and watch this check pass:'
                  : ' — turn on Sandbox mode in the header to try it safely:'}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {result.promotablePolicies.map((name) => (
                  <PolicyLink key={name} name={name} />
                ))}
              </div>
            </EvidenceSection>
          )}

          {(result.status === 'partial' || result.status === 'fail') && result.failingExamples.length > 0 && (
            <EvidenceSection
              title={result.status === 'partial' ? 'Scenarios getting through' : 'Unprotected scenarios (examples)'}
            >
              <ul className="space-y-0.5">
                {result.failingExamples.map((example) => (
                  <li key={example} className="font-mono text-[10px]" style={{ color: COLORS.unsatisfied }}>
                    {example}
                  </li>
                ))}
              </ul>
              {result.scenariosTotal - result.scenariosPassed > result.failingExamples.length && (
                <p className="mt-1 text-[10px]" style={{ color: COLORS.textDim }}>
                  +{result.scenariosTotal - result.scenariosPassed - result.failingExamples.length} more
                  failing scenarios
                </p>
              )}
            </EvidenceSection>
          )}
        </div>
      )}
    </Card>
  );
}

function EvidenceSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: COLORS.textDim }}>
        {title}
      </h4>
      {children}
    </div>
  );
}

/** Policy name chip — clicking jumps to the Grid view with the policy selected
 *  (the detail panel there hosts the sandbox state control). */
function PolicyLink({ name }: { name: string }) {
  const policies = usePolicyStore((s) => s.effectivePolicies);
  const setActiveView = useEvaluationStore((s) => s.setActiveView);
  const setSelectedPolicyId = useEvaluationStore((s) => s.setSelectedPolicyId);

  const policy = policies.find((p) => p.displayName === name);

  if (!policy) {
    return (
      <span className="rounded border px-1.5 py-0.5 text-[10px]" style={{ color: COLORS.textMuted, borderColor: COLORS.border }}>
        {name}
      </span>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-auto rounded border px-1.5 py-0.5 text-[10px] font-normal"
      style={{ color: COLORS.accentLight, borderColor: COLORS.border }}
      onClick={() => {
        setSelectedPolicyId(policy.id);
        setActiveView('grid');
      }}
    >
      {name}
    </Button>
  );
}
