// lib/gapPersonas.ts — Persona slot definitions for guided gap analysis mapping.

import type { UserContext } from '@/engine/models/SimulationContext';

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
