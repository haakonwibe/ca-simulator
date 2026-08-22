// stores/__tests__/usePersonaStore.test.ts — Persona slot mapping.
//
// The slots hold real tenant accounts, so clear() must wipe them: it is the
// hook logout and data-source switching both rely on.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GAP_PERSONA_SLOTS } from '../../lib/gapPersonas';
import type { UserContext } from '../../engine/models/SimulationContext';

// Same reason as usePolicyStore.test.ts: the real auth module reads window at
// import time. Slot mapping is pure state and needs none of it.
vi.mock('../../services/auth', () => ({
  getAccessToken: vi.fn(async () => 'mock-token'),
}));
vi.mock('../../services/personaService', () => ({
  searchUsers: vi.fn(),
  fetchDefaultUsers: vi.fn(),
  resolveUserContext: vi.fn(),
}));

import { usePersonaStore } from '../usePersonaStore';

const admin: UserContext = {
  id: '11111111-2222-3333-4444-555555555555',
  displayName: 'admin@contoso.com',
  userType: 'member',
  memberOfGroupIds: ['group-1'],
  directoryRoleIds: ['62e90394-69f5-4237-9190-012177145e10'],
};

describe('usePersonaStore persona slots', () => {
  beforeEach(() => {
    usePersonaStore.getState().clear();
  });

  it('starts with every catalog slot unmapped', () => {
    const { personaSlots } = usePersonaStore.getState();
    expect(personaSlots).toHaveLength(GAP_PERSONA_SLOTS.length);
    expect(personaSlots.every((s) => s.user === undefined)).toBe(true);
  });

  it('assigns and clears a single slot without touching the others', () => {
    usePersonaStore.getState().setSlotUser('administrator', admin);

    let slots = usePersonaStore.getState().personaSlots;
    expect(slots.find((s) => s.key === 'administrator')?.user).toEqual(admin);
    expect(slots.filter((s) => s.user).length).toBe(1);

    usePersonaStore.getState().clearSlotUser('administrator');
    slots = usePersonaStore.getState().personaSlots;
    expect(slots.find((s) => s.key === 'administrator')?.user).toBeUndefined();
  });

  it('ignores an unknown slot key', () => {
    usePersonaStore.getState().setSlotUser('no-such-slot', admin);
    expect(usePersonaStore.getState().personaSlots.some((s) => s.user)).toBe(false);
  });

  it('clear() wipes mapped accounts — logout and source switch depend on it', () => {
    usePersonaStore.getState().setSlotUser('administrator', admin);
    usePersonaStore.getState().setSlotUser('break-glass', { ...admin, id: 'bg', displayName: 'BG' });
    expect(usePersonaStore.getState().personaSlots.filter((s) => s.user).length).toBe(2);

    usePersonaStore.getState().clear();

    const { personaSlots, resolvedPersonas, selectedPersonaId } = usePersonaStore.getState();
    expect(personaSlots.every((s) => s.user === undefined)).toBe(true);
    expect(resolvedPersonas.size).toBe(0);
    expect(selectedPersonaId).toBeNull();
  });

  it('clear() hands back fresh slot objects, not the mutated originals', () => {
    usePersonaStore.getState().setSlotUser('administrator', admin);
    usePersonaStore.getState().clear();
    usePersonaStore.getState().clear();
    expect(usePersonaStore.getState().personaSlots.every((s) => s.user === undefined)).toBe(true);
    // catalog definitions must survive untouched for the next session
    expect(GAP_PERSONA_SLOTS.every((s) => !('user' in s))).toBe(true);
  });
});
