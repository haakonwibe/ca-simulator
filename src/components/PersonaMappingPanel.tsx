// components/PersonaMappingPanel.tsx — Guided mapping of real tenant accounts
// onto the persona slots.
//
// Shared by the Gaps sweep and the Baseline assessment. The slots live in
// usePersonaStore rather than in either view, so a mapping made in one tab holds
// in the other — and resolution runs through the same resolveAndCache path that
// the ScenarioPanel uses, so memberships and role template ids are real.

import { useState } from 'react';
import { usePersonaStore } from '@/stores/usePersonaStore';
import { usePolicyStore } from '@/stores/usePolicyStore';
import { COLORS } from '@/data/theme';
import { classifyPersona, EXCEPTION_SLOT_KEYS } from '@/lib/gapPersonas';
import type { GapPersonaSlot } from '@/lib/gapPersonas';
import { REMOTE_HELP_OPERATOR_SLOT } from '@/data/baselineChecks';
import { UserSearchInput } from '@/components/UserSearchInput';
import type { UserSearchResult } from '@/services/personaService';
import type { UserContext } from '@/engine/models/SimulationContext';
import { Badge } from '@/components/ui/badge';
import { Loader2, X, User, ShieldCheck, UserPlus, KeyRound, Bot, Headset } from 'lucide-react';

const SLOT_ICONS: Record<string, typeof User> = {
  'standard-member': User,
  'administrator': ShieldCheck,
  'guest-user': UserPlus,
  'break-glass': KeyRound,
  'service-account': Bot,
  [REMOTE_HELP_OPERATOR_SLOT]: Headset,
};

const PERSONA_LABELS: Record<string, string> = {
  member: 'Member',
  guest: 'Guest',
  admin: 'Admin',
};

/**
 * Resolves a picked user and files it into a slot. Returns the slot currently
 * resolving so cards can show their own spinner.
 */
export function usePersonaSlots() {
  const personaSlots = usePersonaStore((s) => s.personaSlots);
  const setSlotUser = usePersonaStore((s) => s.setSlotUser);
  const clearSlotUser = usePersonaStore((s) => s.clearSlotUser);
  const dataSource = usePolicyStore((s) => s.dataSource);
  const [resolvingSlot, setResolvingSlot] = useState<string | null>(null);

  const selectSlotUser = async (slotKey: string, searchResult: UserSearchResult) => {
    setResolvingSlot(slotKey);
    try {
      let resolved: UserContext | null;
      if (dataSource === 'sample') {
        resolved = usePersonaStore.getState().resolveAndCacheSample(searchResult.id);
      } else {
        resolved = await usePersonaStore.getState().resolveAndCache(searchResult.id);
      }
      if (resolved) setSlotUser(slotKey, resolved);
    } catch (err) {
      console.error('Failed to resolve user for slot:', err instanceof Error ? err.message : 'Unknown error');
    }
    setResolvingSlot(null);
  };

  return { personaSlots, resolvingSlot, selectSlotUser, clearSlotUser };
}

export function PersonaSlotCard({
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
  // Assessed class comes from what the account IS, not the slot it sits in —
  // show it so an admin slot holding a role-less account isn't a silent surprise.
  const assessedAs = slot.user ? classifyPersona(slot.user) : null;
  const isException = EXCEPTION_SLOT_KEYS.has(slot.key);

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
        {isException && (
          <Badge
            variant="outline"
            className="shrink-0 px-1.5 py-0 text-[10px]"
            style={{ color: COLORS.warning, borderColor: 'rgba(217, 119, 6, 0.4)' }}
          >
            not counted
          </Badge>
        )}
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
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-xs font-medium text-foreground">
                {slot.user.displayName}
              </span>
              <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px]">
                {slot.user.userType === 'guest' ? 'Guest' : 'Member'}
              </Badge>
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              {slot.user.memberOfGroupIds.length} groups &middot; {slot.user.directoryRoleIds.length} roles
              {assessedAs && ` · assessed as ${PERSONA_LABELS[assessedAs] ?? assessedAs}`}
              {slot.key === REMOTE_HELP_OPERATOR_SLOT && ' · Remote Help operator'}
            </div>
          </div>
          <button onClick={onClear} className="shrink-0 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <UserSearchInput onSelect={onSelect} placeholder={`Assign ${slot.label.toLowerCase()}...`} />
      )}
    </div>
  );
}

/** The full slot list — the mapping surface both tabs render. */
export function PersonaMappingPanel() {
  const { personaSlots, resolvingSlot, selectSlotUser, clearSlotUser } = usePersonaSlots();

  return (
    <>
      {personaSlots.map((slot) => (
        <PersonaSlotCard
          key={slot.key}
          slot={slot}
          isResolving={resolvingSlot === slot.key}
          onSelect={(user) => selectSlotUser(slot.key, user)}
          onClear={() => clearSlotUser(slot.key)}
        />
      ))}
    </>
  );
}
