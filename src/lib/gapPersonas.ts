// lib/gapPersonas.ts — Persona slot definitions for guided mapping.
//
// Shared by the Gaps sweep and the Baseline assessment: both need a way to put
// real tenant accounts behind the synthetic personas, and both read the same
// slots out of usePersonaStore so a mapping done in one tab holds in the other.

import type { UserContext } from '@/engine/models/SimulationContext';
import type { BaselinePersona } from '@/data/baselineChecks';

export interface GapPersonaSlot {
  key: string;
  label: string;
  description: string;
  user?: UserContext;
}

export const GAP_PERSONA_SLOTS: Omit<GapPersonaSlot, 'user'>[] = [
  {
    key: 'standard-member',
    label: 'Standard Member',
    description: 'A typical employee with no admin roles. Tests baseline policy coverage for the majority of your users.',
  },
  {
    key: 'administrator',
    label: 'Administrator',
    description: 'A Global Admin or privileged role holder. Verifies that admin-targeting policies apply correctly.',
  },
  {
    key: 'guest-user',
    label: 'Guest User',
    description: 'An external or B2B collaboration user. Checks that guest-specific policies provide adequate coverage.',
  },
  {
    key: 'break-glass',
    label: 'Break Glass',
    description: 'An emergency access account. These are intentionally excluded from most policies — verify the exclusions are deliberate.',
  },
  {
    key: 'service-account',
    label: 'Service Account',
    description: 'An automation or shared account. Often excluded from MFA — check for compensating controls like location or device restrictions.',
  },
];

/**
 * Slots holding accounts that are *meant* to sit outside policy — break-glass
 * and automation. Their failures are reported, but never counted against a
 * baseline check: an emergency access account excluded from MFA is the design,
 * not a regression, and counting it would park Protect Administrators on red.
 */
export const EXCEPTION_SLOT_KEYS: ReadonlySet<string> = new Set(['break-glass', 'service-account']);

/**
 * Which baseline persona class a real account stands in for.
 *
 * Derived from what the account actually IS, not the slot it was dropped into —
 * someone filed under Administrator who holds no directory role is a member, and
 * assessing them as an admin would invent coverage that isn't there.
 */
export function classifyPersona(user: UserContext): BaselinePersona {
  if (user.userType === 'guest') return 'guest';
  if (user.directoryRoleIds.length > 0) return 'admin';
  return 'member';
}
