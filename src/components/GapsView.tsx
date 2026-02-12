// components/GapsView.tsx — Coverage gap analysis view.

import { useState, useCallback, useEffect, useRef } from 'react';
import { usePolicyStore } from '@/stores/usePolicyStore';
import { usePersonaStore } from '@/stores/usePersonaStore';
import { COLORS } from '@/data/theme';
import { SAMPLE_PERSONAS } from '@/data/samplePersonas';
import { analyzeGaps, groupGaps, detectDisagreement, getSweepScenarioCount } from '@/lib/gapAnalysis';
import type { GapGroup, GapSeverity, GapPersonaSource, GapDisagreement } from '@/lib/gapAnalysis';
import { GAP_PERSONA_SLOTS } from '@/lib/gapPersonas';
import type { GapPersonaSlot } from '@/lib/gapPersonas';
import { UserSearchInput } from '@/components/UserSearchInput';
import type { UserSearchResult } from '@/services/personaService';
import type { UserContext } from '@/engine/models/SimulationContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  Info,
  Loader2,
  Search,
  Users,
  User,
  UsersRound,
  UserPlus,
  KeyRound,
  Bot,
  ChevronRight,
  X,
} from 'lucide-react';

// ── Severity styling ──

const SEVERITY_CONFIG: Record<GapSeverity, {
  label: string;
  color: string;
  bg: string;
  border: string;
  Icon: typeof AlertTriangle;
}> = {
  critical: {
    label: 'CRITICAL',
    color: COLORS.blocked,
    bg: COLORS.blockedBg,
    border: COLORS.blocked,
    Icon: ShieldAlert,
  },
  warning: {
    label: 'WARNING',
    color: COLORS.unsatisfied,
    bg: COLORS.unsatisfiedBg,
    border: COLORS.unsatisfied,
    Icon: AlertTriangle,
  },
  caution: {
    label: 'CAUTION',
    color: COLORS.mfa,
    bg: COLORS.mfaBg,
    border: COLORS.mfa,
    Icon: AlertOctagon,
  },
  info: {
    label: 'INFO',
    color: COLORS.reportOnly,
    bg: COLORS.reportOnlyBg,
    border: COLORS.reportOnly,
    Icon: Info,
  },
};

// ── Slot icon mapping ──

const SLOT_ICONS: Record<string, typeof User> = {
  'standard-member': User,
  'administrator': ShieldCheck,
  'guest-user': UserPlus,
  'break-glass': KeyRound,
  'service-account': Bot,
};

// ── User type icons ──

const USER_TYPE_LABELS: Record<string, string> = {
  'Standard Member': 'Standard Member',
  'Guest User': 'Guest User',
  'Global Administrator': 'Global Administrator',
};

// ── Gap type labels ──

const GAP_TYPE_LABELS: Record<string, string> = {
  'no-policy': 'No Policy',
  'no-mfa': 'No MFA',
  'no-device-compliance': 'No Device Compliance',
  'no-mfa-or-device': 'No MFA or Device',
  'legacy-auth-not-blocked': 'Legacy Auth Not Blocked',
  'report-only': 'Report-Only',
};

const LEGACY_CLIENT_APP_TYPES = new Set(['exchangeActiveSync', 'other']);

function getGapTypeLabel(group: GapGroup): string {
  const base = GAP_TYPE_LABELS[group.gapType] ?? group.gapType;
  if (
    group.gapType !== 'legacy-auth-not-blocked' &&
    group.clientApps.length > 0 &&
    group.clientApps.every((c) => LEGACY_CLIENT_APP_TYPES.has(c))
  ) {
    return `${base} (Legacy Auth)`;
  }
  return base;
}

// ── Compact dimension display ──

function formatDimension(label: string, values: string[]): string {
  return `${label}: ${values.join(' \u00b7 ')}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatRiskLevels(levels: string[]): string {
  return levels.map(capitalize).join(' \u00b7 ');
}

function formatClientApp(app: string): string {
  if (app === 'mobileAppsAndDesktopClients') return 'Mobile/Desktop';
  if (app === 'browser') return 'Browser';
  if (app === 'exchangeActiveSync') return 'Exchange ActiveSync';
  if (app === 'other') return 'Other (Legacy)';
  return app;
}

// ── Persona source toggle ──

function PersonaSourceToggle({
  personaSource,
  setPersonaSource,
  selectedUserName,
  canUseSelected,
  mappedCount,
}: {
  personaSource: GapPersonaSource;
  setPersonaSource: (source: GapPersonaSource) => void;
  selectedUserName: string | null;
  canUseSelected: boolean;
  mappedCount: number;
}) {
  const btnClass = (active: boolean, disabled: boolean) =>
    `h-7 gap-1.5 px-2.5 text-xs ${active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`;

  return (
    <div className="flex items-center gap-1">
      <span className="mr-1 text-xs" style={{ color: COLORS.textDim }}>Sweep:</span>
      <Button
        variant="ghost"
        size="sm"
        className={btnClass(personaSource === 'generic', false)}
        onClick={() => setPersonaSource('generic')}
      >
        <Users className="h-3.5 w-3.5" />
        Generic
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={btnClass(personaSource === 'selected', !canUseSelected)}
        onClick={() => canUseSelected && setPersonaSource('selected')}
        title={canUseSelected ? undefined : 'Select a user first'}
        disabled={!canUseSelected}
      >
        <User className="h-3.5 w-3.5" />
        {selectedUserName ?? 'Selected User'}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={btnClass(personaSource === 'resolved', false)}
        onClick={() => setPersonaSource('resolved')}
      >
        <UsersRound className="h-3.5 w-3.5" />
        Mapped Personas ({mappedCount}/5)
      </Button>
    </div>
  );
}

// ── Disagreement banner ──

function DisagreementBanner({ disagreement }: { disagreement: GapDisagreement }) {
  return (
    <Card
      className="overflow-hidden border"
      style={{
        backgroundColor: COLORS.bgCard,
        borderColor: COLORS.border,
        borderLeftWidth: '4px',
        borderLeftColor: COLORS.mfa,
      }}
    >
      <div className="flex items-start gap-3 p-4">
        <ShieldAlert className="h-5 w-5 shrink-0" style={{ color: COLORS.mfa }} />
        <div>
          <p className="text-sm font-medium" style={{ color: COLORS.mfa }}>
            Coverage Discrepancy Detected
          </p>
          <p className="mt-1 text-xs" style={{ color: COLORS.textMuted }}>
            {disagreement.message}
          </p>
        </div>
      </div>
    </Card>
  );
}

// ── Persona slot card ──

function PersonaSlotCard({
  slot,
  isResolving,
  onSelect,
  onClear,
}: {
  slot: GapPersonaSlot;
  isResolving: boolean;
  onSelect: (user: UserSearchResult) => void;
  onClear: () => void;
}) {
  const SlotIcon = SLOT_ICONS[slot.key] ?? User;

  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: slot.user ? COLORS.accent + '40' : COLORS.border, backgroundColor: COLORS.bgCard }}
    >
      <div className="mb-2 flex items-center gap-2">
        <SlotIcon className="h-4 w-4" style={{ color: slot.user ? COLORS.accent : COLORS.textMuted }} />
        <span className="text-sm font-medium" style={{ color: COLORS.text }}>
          {slot.label}
        </span>
      </div>
      <p className="mb-3 text-xs" style={{ color: COLORS.textDim }}>
        {slot.description}
      </p>

      {isResolving ? (
        <div className="flex items-center gap-2 text-xs" style={{ color: COLORS.textMuted }}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Resolving memberships...
        </div>
      ) : slot.user ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-card/50 px-3 py-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-foreground truncate">
                {slot.user.displayName}
              </span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                {slot.user.userType === 'guest' ? 'Guest' : 'Member'}
              </Badge>
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              {slot.user.memberOfGroupIds.length} groups &middot; {slot.user.directoryRoleIds.length} roles
            </div>
          </div>
          <button
            onClick={onClear}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <UserSearchInput onSelect={onSelect} placeholder={`Assign ${slot.label.toLowerCase()}...`} />
      )}
    </div>
  );
}

// ── Mapped persona summary ──

function MappedPersonaSummary({
  slots,
  activeFilter,
  onFilterToggle,
  onRemap,
}: {
  slots: GapPersonaSlot[];
  activeFilter: string | null;
  onFilterToggle: (personaName: string) => void;
  onRemap: () => void;
}) {
  const mapped = slots.filter((s) => s.user);
  if (mapped.length === 0) return null;

  return (
    <div
      className="rounded-lg border px-4 py-2"
      style={{ borderColor: COLORS.border, backgroundColor: COLORS.bgCard }}
    >
      <div className="flex items-center gap-2">
        <UsersRound className="h-4 w-4 shrink-0" style={{ color: COLORS.accent }} />
        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          {mapped.map((s) => {
            const personaName = `${s.label} (${s.user!.displayName})`;
            const SlotIcon = SLOT_ICONS[s.key] ?? User;
            const isActive = activeFilter === personaName;
            return (
              <button
                key={s.key}
                onClick={() => onFilterToggle(personaName)}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors cursor-pointer"
                style={{
                  borderColor: isActive ? COLORS.accent : COLORS.border,
                  backgroundColor: isActive ? COLORS.accent + '33' : 'transparent',
                  color: isActive ? COLORS.accent : COLORS.textMuted,
                }}
              >
                <SlotIcon className="h-3 w-3" />
                <span className="truncate max-w-[140px]">{s.label} ({s.user!.displayName})</span>
              </button>
            );
          })}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs shrink-0"
          style={{ color: COLORS.accent }}
          onClick={onRemap}
        >
          Remap Users
        </Button>
      </div>
    </div>
  );
}

// ── Compact gap row ──

function GapRow({
  group,
  expanded,
  onToggle,
}: {
  group: GapGroup;
  expanded: boolean;
  onToggle: () => void;
}) {
  const config = SEVERITY_CONFIG[group.severity];
  const SeverityIcon = config.Icon;

  return (
    <div className="border-b" style={{ borderColor: COLORS.border }}>
      {/* Collapsed: single-line summary */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-accent/10"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
          style={{ color: COLORS.textDim }}
        />
        <SeverityIcon className="h-3.5 w-3.5 shrink-0" style={{ color: config.color }} />
        <span className="shrink-0 text-xs" style={{ color: COLORS.text }}>
          {USER_TYPE_LABELS[group.userType] ?? group.personaName}
        </span>
        <span style={{ color: COLORS.textDim }}>&rarr;</span>
        <span className="shrink-0 text-xs" style={{ color: COLORS.text }}>
          {group.application}
        </span>
        <span className="flex-1 truncate text-xs" style={{ color: COLORS.textDim }}>
          &middot; {getGapTypeLabel(group)}
        </span>
        <Badge
          variant="outline"
          className="shrink-0 border-0 px-1.5 py-0 text-[10px]"
          style={{ color: COLORS.textMuted }}
        >
          {group.scenarioCount}
        </Badge>
      </button>

      {/* Expanded: dimension details */}
      {expanded && (
        <div className="space-y-1 px-4 pb-3 pl-12 text-xs" style={{ color: COLORS.textMuted }}>
          <p className="text-xs" style={{ color: COLORS.text }}>{group.reason}</p>
          <p>{formatDimension('Platforms', group.platforms.map(capitalize))}</p>
          <p>{formatDimension('Client Apps', group.clientApps.map(formatClientApp))}</p>
          <p>{formatDimension('Locations', group.locations.map(capitalize))}</p>
          {(group.signInRiskLevels.length > 1 || group.signInRiskLevels[0] !== 'none') && (
            <p>Sign-in Risk: {formatRiskLevels(group.signInRiskLevels)}</p>
          )}
          {(group.userRiskLevels.length > 1 || group.userRiskLevels[0] !== 'none') && (
            <p>User Risk: {formatRiskLevels(group.userRiskLevels)}</p>
          )}
          <p className="mt-1" style={{ color: COLORS.textDim }}>
            {group.scenarioCount} unprotected scenario{group.scenarioCount !== 1 ? 's' : ''}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Severity swimlane ──

function SeveritySwimlane({
  severity,
  groups,
  expandedKeys,
  onToggle,
  indexOffset,
}: {
  severity: GapSeverity;
  groups: GapGroup[];
  expandedKeys: Set<string>;
  onToggle: (key: string) => void;
  indexOffset: number;
}) {
  if (groups.length === 0) return null;
  const config = SEVERITY_CONFIG[severity];
  const SeverityIcon = config.Icon;

  return (
    <div className="mb-2">
      <div
        className="flex items-center gap-2 px-4 py-1.5"
        style={{ backgroundColor: config.bg }}
      >
        <SeverityIcon className="h-3.5 w-3.5" style={{ color: config.color }} />
        <span
          className="text-xs font-bold tracking-wider"
          style={{ color: config.color }}
        >
          {config.label} ({groups.length})
        </span>
      </div>
      {groups.map((group, i) => {
        const key = `${group.severity}-${group.personaName}-${group.application}-${group.gapType}-${indexOffset + i}`;
        return (
          <GapRow
            key={key}
            group={group}
            expanded={expandedKeys.has(key)}
            onToggle={() => onToggle(key)}
          />
        );
      })}
    </div>
  );
}

// ── Summary bar ──

function SummaryBar({ groups, filterLabel, onClearFilter }: {
  groups: GapGroup[];
  filterLabel?: string | null;
  onClearFilter?: () => void;
}) {
  const counts = { critical: 0, warning: 0, caution: 0, info: 0 };
  for (const g of groups) {
    counts[g.severity]++;
  }

  return (
    <div className="flex items-center gap-3">
      {filterLabel && (
        <span className="flex items-center gap-1 text-xs" style={{ color: COLORS.accent }}>
          Showing {filterLabel}
          <button onClick={onClearFilter} className="hover:text-foreground" title="Show all personas">
            <X className="h-3 w-3" />
          </button>
          <span style={{ color: COLORS.textDim }}>&middot;</span>
        </span>
      )}
      {counts.critical > 0 && (
        <Badge
          variant="outline"
          className="gap-1 border-0 px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: COLORS.blockedBg, color: COLORS.blocked }}
        >
          {counts.critical} critical
        </Badge>
      )}
      {counts.warning > 0 && (
        <Badge
          variant="outline"
          className="gap-1 border-0 px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: COLORS.unsatisfiedBg, color: COLORS.unsatisfied }}
        >
          {counts.warning} warning{counts.warning !== 1 ? 's' : ''}
        </Badge>
      )}
      {counts.caution > 0 && (
        <Badge
          variant="outline"
          className="gap-1 border-0 px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: COLORS.mfaBg, color: COLORS.mfa }}
        >
          {counts.caution} caution{counts.caution !== 1 ? 's' : ''}
        </Badge>
      )}
      {counts.info > 0 && (
        <Badge
          variant="outline"
          className="gap-1 border-0 px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: COLORS.reportOnlyBg, color: COLORS.reportOnly }}
        >
          {counts.info} info
        </Badge>
      )}
      {counts.critical === 0 && counts.warning === 0 && counts.caution === 0 && counts.info === 0 && (
        <Badge
          variant="outline"
          className="gap-1 border-0 px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: COLORS.grantedBg, color: COLORS.granted }}
        >
          No gaps detected
        </Badge>
      )}
    </div>
  );
}

// ── Main component ──

export function GapsView() {
  const policies = usePolicyStore((s) => s.policies);
  const dataSource = usePolicyStore((s) => s.dataSource);

  const resolvedPersonas = usePersonaStore((s) => s.resolvedPersonas);
  const selectedPersonaId = usePersonaStore((s) => s.selectedPersonaId);

  const selectedUser = selectedPersonaId ? resolvedPersonas.get(selectedPersonaId) ?? null : null;
  const canUseSelected = selectedUser !== null;

  const [groups, setGroups] = useState<GapGroup[] | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [personaSource, setPersonaSource] = useState<GapPersonaSource>('generic');
  const [disagreement, setDisagreement] = useState<GapDisagreement | null>(null);
  const [activePersonaFilter, setActivePersonaFilter] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Mapped persona state
  const [personaSlots, setPersonaSlots] = useState<GapPersonaSlot[]>(
    GAP_PERSONA_SLOTS.map((slot) => ({ ...slot, user: undefined }))
  );
  const [mappingComplete, setMappingComplete] = useState(false);
  const [isResolvingSlot, setIsResolvingSlot] = useState<string | null>(null);

  const mappedCount = personaSlots.filter((s) => s.user).length;
  const mappedUsers = personaSlots
    .filter((s) => s.user)
    .map((s) => ({
      ...s.user!,
      displayName: `${s.label} (${s.user!.displayName})`,
    }));

  // Track the policy set we last analyzed to auto-reanalyze on change
  const lastAnalyzedPoliciesRef = useRef<typeof policies | null>(null);

  // Fall back to generic if the selected source becomes unavailable
  useEffect(() => {
    if (personaSource === 'selected' && !canUseSelected) {
      setPersonaSource('generic');
    }
  }, [personaSource, canUseSelected]);

  // sourceOverride lets callers pass the new source directly, avoiding stale closure
  // when setPersonaSource hasn't flushed yet.
  const runAnalysis = useCallback((sourceOverride?: GapPersonaSource) => {
    const effectiveSource = sourceOverride ?? personaSource;
    setActivePersonaFilter(null);
    setExpandedGroups(new Set());
    setIsAnalyzing(true);
    // Use setTimeout to allow the UI to show the loading state
    setTimeout(() => {
      const samplePersonasForSweep = dataSource === 'sample' ? SAMPLE_PERSONAS : undefined;

      // For mapped personas, use the mapped user list
      const resolvedUsersForSweep = effectiveSource === 'resolved' && mappedUsers.length > 0
        ? mappedUsers : undefined;

      const options = {
        personaSource: effectiveSource,
        selectedUser: selectedUser ?? undefined,
        resolvedUsers: resolvedUsersForSweep,
        samplePersonas: samplePersonasForSweep,
      };
      const gaps = analyzeGaps(policies, options);
      const grouped = groupGaps(gaps);
      setGroups(grouped);
      lastAnalyzedPoliciesRef.current = policies;

      // Disagreement detection: run generic for comparison when using real personas
      if (effectiveSource !== 'generic') {
        const genericGaps = analyzeGaps(policies, { samplePersonas: samplePersonasForSweep });
        const userCount = effectiveSource === 'selected' ? 1 : mappedUsers.length;
        setDisagreement(detectDisagreement(genericGaps, gaps, grouped.length, getSweepScenarioCount(userCount)));
      } else {
        setDisagreement(null);
      }

      setIsAnalyzing(false);
    }, 0);
  }, [policies, personaSource, selectedUser, mappedUsers, dataSource]);

  // Auto-reanalyze when policies change (if we've already analyzed once)
  useEffect(() => {
    if (
      lastAnalyzedPoliciesRef.current !== null &&
      lastAnalyzedPoliciesRef.current !== policies &&
      policies.length > 0
    ) {
      runAnalysis();
    }
  }, [policies, runAnalysis]);

  // Toggle handler: update state and re-run analysis in one action (no second useEffect)
  const handlePersonaSourceChange = useCallback((source: GapPersonaSource) => {
    setPersonaSource(source);
    setActivePersonaFilter(null);
    setExpandedGroups(new Set());
    // For 'resolved', show mapping UI if not yet completed (don't auto-analyze)
    if (source === 'resolved' && !mappingComplete) return;
    if (lastAnalyzedPoliciesRef.current !== null && policies.length > 0) {
      runAnalysis(source);
    }
  }, [runAnalysis, policies, mappingComplete]);

  // Slot handlers
  const handleSlotSelect = async (slotKey: string, searchResult: UserSearchResult) => {
    setIsResolvingSlot(slotKey);
    try {
      let resolved: UserContext | null;
      if (dataSource === 'sample') {
        resolved = usePersonaStore.getState().resolveAndCacheSample(searchResult.id);
      } else {
        resolved = await usePersonaStore.getState().resolveAndCache(searchResult.id);
      }
      if (resolved) {
        setPersonaSlots((prev) =>
          prev.map((s) => (s.key === slotKey ? { ...s, user: resolved } : s))
        );
      }
    } catch (err) {
      console.error('Failed to resolve user for slot:', err);
    }
    setIsResolvingSlot(null);
  };

  const handleSlotClear = (slotKey: string) => {
    setPersonaSlots((prev) =>
      prev.map((s) => (s.key === slotKey ? { ...s, user: undefined } : s))
    );
  };

  const handleAnalyzeMapped = () => {
    setMappingComplete(true);
    runAnalysis('resolved');
  };

  const handleRemap = () => {
    setMappingComplete(false);
    setActivePersonaFilter(null);
  };

  // Scenario count for display
  const scenarioCount = personaSource === 'generic'
    ? getSweepScenarioCount(dataSource === 'sample' ? SAMPLE_PERSONAS.length : 3)
    : personaSource === 'selected'
      ? getSweepScenarioCount(1)
      : getSweepScenarioCount(mappedUsers.length || 1);

  const toggleProps = {
    personaSource,
    setPersonaSource: handlePersonaSourceChange,
    selectedUserName: selectedUser?.displayName ?? null,
    canUseSelected,
    mappedCount,
  };

  // Empty state: no policies loaded
  if (dataSource === 'none' || policies.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8">
        <Search className="h-8 w-8" style={{ color: COLORS.textDim }} />
        <p className="text-center text-sm text-muted-foreground">
          Sign in and load policies to see coverage gaps
        </p>
      </div>
    );
  }

  // Mapping setup view (resolved + not yet complete)
  if (personaSource === 'resolved' && !mappingComplete) {
    return (
      <div className="flex h-full flex-col">
        <div
          className="flex shrink-0 flex-col gap-2 border-b px-4 py-2"
          style={{ borderColor: COLORS.border }}
        >
          <PersonaSourceToggle {...toggleProps} />
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            <div>
              <h3 className="text-sm font-medium" style={{ color: COLORS.text }}>
                Map Representative Users
              </h3>
              <p className="mt-1 text-xs" style={{ color: COLORS.textMuted }}>
                Assign real users from your tenant to test how your policies affect different user types.
              </p>
            </div>

            {personaSlots.map((slot) => (
              <PersonaSlotCard
                key={slot.key}
                slot={slot}
                isResolving={isResolvingSlot === slot.key}
                onSelect={(user) => handleSlotSelect(slot.key, user)}
                onClear={() => handleSlotClear(slot.key)}
              />
            ))}

            <Button
              onClick={handleAnalyzeMapped}
              disabled={mappedCount === 0}
              className="w-full gap-2"
              style={mappedCount > 0 ? { backgroundColor: COLORS.accent } : undefined}
            >
              <Search className="h-4 w-4" />
              Analyze Mapped Personas ({mappedCount}/5)
            </Button>
          </div>
        </ScrollArea>
      </div>
    );
  }

  // Not yet analyzed
  if (groups === null && !isAnalyzing) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <ShieldAlert className="h-10 w-10" style={{ color: COLORS.textDim }} />
        <PersonaSourceToggle {...toggleProps} />
        <p className="text-center text-sm" style={{ color: COLORS.textMuted }}>
          Sweep {policies.length} policies across {scenarioCount.toLocaleString()} scenario combinations to find coverage gaps.
        </p>
        <Button
          onClick={() => runAnalysis()}
          className="gap-2"
          style={{ backgroundColor: COLORS.accent }}
        >
          <Search className="h-4 w-4" />
          Analyze Coverage
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
          Sweeping {scenarioCount.toLocaleString()} scenarios...
        </p>
      </div>
    );
  }

  // No gaps found
  if (groups !== null && groups.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
        <ShieldCheck className="h-10 w-10" style={{ color: COLORS.granted }} />
        <p className="text-center text-sm" style={{ color: COLORS.granted }}>
          No coverage gaps detected
        </p>
        <p className="text-center text-xs" style={{ color: COLORS.textMuted }}>
          All swept scenarios have enforced policy coverage.
        </p>
        <PersonaSourceToggle {...toggleProps} />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => runAnalysis()}
          className="mt-2 text-xs"
          style={{ color: COLORS.textMuted }}
        >
          Re-analyze
        </Button>
      </div>
    );
  }

  // Results
  const displayGroups = activePersonaFilter
    ? groups!.filter((g) => g.personaName === activePersonaFilter)
    : groups!;

  // Split display groups by severity for swimlanes
  const severityOrder: GapSeverity[] = ['critical', 'warning', 'caution', 'info'];
  const groupsBySeverity: Record<GapSeverity, GapGroup[]> = {
    critical: [], warning: [], caution: [], info: [],
  };
  const indexOffsets: Record<GapSeverity, number> = { critical: 0, warning: 0, caution: 0, info: 0 };
  let offset = 0;
  for (const sev of severityOrder) {
    const sevGroups = displayGroups.filter((g) => g.severity === sev);
    groupsBySeverity[sev] = sevGroups;
    indexOffsets[sev] = offset;
    offset += sevGroups.length;
  }

  const getGroupKey = (group: GapGroup, i: number) =>
    `${group.severity}-${group.personaName}-${group.application}-${group.gapType}-${i}`;

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandAll = () => {
    const allKeys = new Set<string>();
    for (const sev of severityOrder) {
      groupsBySeverity[sev].forEach((g, i) =>
        allKeys.add(getGroupKey(g, indexOffsets[sev] + i)),
      );
    }
    setExpandedGroups(allKeys);
  };

  const collapseAll = () => setExpandedGroups(new Set());

  return (
    <div className="flex h-full flex-col">
      {/* Toggle + Summary bar */}
      <div
        className="flex shrink-0 flex-col gap-2 border-b px-4 py-2"
        style={{ borderColor: COLORS.border }}
      >
        <div className="flex items-center justify-between">
          <PersonaSourceToggle {...toggleProps} />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => runAnalysis()}
            className="h-7 text-xs"
            style={{ color: COLORS.textMuted }}
          >
            Re-analyze
          </Button>
        </div>
        <div className="flex items-center justify-between">
          <SummaryBar
            groups={displayGroups}
            filterLabel={activePersonaFilter}
            onClearFilter={() => setActivePersonaFilter(null)}
          />
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={expandAll}
              className="h-6 px-2 text-[10px]"
              style={{ color: COLORS.textMuted }}
            >
              Expand all
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={collapseAll}
              className="h-6 px-2 text-[10px]"
              style={{ color: COLORS.textMuted }}
            >
              Collapse all
            </Button>
          </div>
        </div>
      </div>

      {/* Swimlanes */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-0">
          {/* Mapped persona summary */}
          {personaSource === 'resolved' && mappingComplete && (
            <div className="mb-3">
              <MappedPersonaSummary
                slots={personaSlots}
                activeFilter={activePersonaFilter}
                onFilterToggle={(name) =>
                  setActivePersonaFilter((prev) => (prev === name ? null : name))
                }
                onRemap={handleRemap}
              />
            </div>
          )}
          {/* Disagreement banner */}
          {disagreement && !activePersonaFilter && (
            <div className="mb-3">
              <DisagreementBanner disagreement={disagreement} />
            </div>
          )}
          {/* Severity swimlanes */}
          {severityOrder.map((sev) => (
            <SeveritySwimlane
              key={sev}
              severity={sev}
              groups={groupsBySeverity[sev]}
              expandedKeys={expandedGroups}
              onToggle={toggleGroup}
              indexOffset={indexOffsets[sev]}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
