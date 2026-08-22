// stores/usePersonaStore.ts — Zustand store for persona resolution + cache.

import { create } from 'zustand';
import type { UserContext } from '../engine/models/SimulationContext';
import {
  searchUsers as searchUsersApi,
  fetchDefaultUsers as fetchDefaultUsersApi,
  resolveUserContext,
  type UserSearchResult,
} from '../services/personaService';
import { getAccessToken } from '../services/auth';
import { GraphPermissionError, ADMIN_CONSENT_ERROR } from '../services/graphClient';
import { SAMPLE_PERSONAS } from '../data/samplePersonas';
import { GAP_PERSONA_SLOTS, type GapPersonaSlot } from '../lib/gapPersonas';

// Module-scoped in-flight request tracker to deduplicate concurrent resolveAndCache calls
const inflight = new Map<string, Promise<UserContext>>();

/** Fresh, unmapped slots — one source for both the initial state and clear(). */
function emptySlots(): GapPersonaSlot[] {
  return GAP_PERSONA_SLOTS.map((slot) => ({ ...slot, user: undefined }));
}

interface PersonaState {
  // Resolved personas cache: userId → UserContext
  resolvedPersonas: Map<string, UserContext>;
  /** Guided persona mapping, shared by the Gaps sweep and the Baseline assessment.
   *  Lives here rather than in a view so a mapping survives switching tabs. */
  personaSlots: GapPersonaSlot[];
  // Currently selected persona for simulation
  selectedPersonaId: string | null;
  /** True while ANY resolution is in flight (counter-backed — concurrent
   * resolutions for different users don't clear each other's loading state) */
  isResolving: boolean;
  resolvingCount: number;
  error: string | null;

  // Actions
  searchUsers: (query: string) => Promise<UserSearchResult[]>;
  fetchDefaultUsers: () => Promise<UserSearchResult[]>;
  searchSampleUsers: (query: string) => UserSearchResult[];
  resolveAndCache: (userId: string) => Promise<UserContext>;
  resolveAndCacheSample: (userId: string) => UserContext | null;
  selectPersona: (userId: string) => void;
  getSelectedContext: () => UserContext | null;
  setSlotUser: (slotKey: string, user: UserContext) => void;
  clearSlotUser: (slotKey: string) => void;
  clear: () => void;
}

export const usePersonaStore = create<PersonaState>((set, get) => ({
  resolvedPersonas: new Map(),
  personaSlots: emptySlots(),
  selectedPersonaId: null,
  isResolving: false,
  resolvingCount: 0,
  error: null,

  searchUsers: async (query: string) => {
    const token = await getAccessToken();
    return searchUsersApi(token, query);
  },

  fetchDefaultUsers: async () => {
    const token = await getAccessToken();
    return fetchDefaultUsersApi(token);
  },

  searchSampleUsers: (query: string) => {
    const lower = query.toLowerCase();
    return SAMPLE_PERSONAS
      .filter((p) => p.displayName.toLowerCase().includes(lower))
      .map((p) => ({
        id: p.id,
        displayName: p.displayName,
        userPrincipalName: `${p.displayName.toLowerCase().replace(/\s+/g, '.')}@contoso.com`,
        userType: p.userType,
      }));
  },

  resolveAndCache: async (userId: string) => {
    // Check cache first
    const cached = get().resolvedPersonas.get(userId);
    if (cached) {
      set({ selectedPersonaId: userId });
      return cached;
    }

    // Deduplicate concurrent requests for the same user
    const pending = inflight.get(userId);
    if (pending) return pending;

    const promise = (async () => {
      set((s) => ({ resolvingCount: s.resolvingCount + 1, isResolving: true, error: null }));
      try {
        const token = await getAccessToken();
        const context = await resolveUserContext(token, userId);
        const updated = new Map(get().resolvedPersonas);
        updated.set(userId, context);
        set({
          resolvedPersonas: updated,
          selectedPersonaId: userId,
        });
        return context;
      } catch (error) {
        const errorMessage =
          error instanceof GraphPermissionError
            ? ADMIN_CONSENT_ERROR
            : error instanceof Error ? error.message : 'Failed to resolve user';
        set({ error: errorMessage });
        throw error;
      } finally {
        set((s) => {
          const resolvingCount = s.resolvingCount - 1;
          return { resolvingCount, isResolving: resolvingCount > 0 };
        });
        inflight.delete(userId);
      }
    })();

    inflight.set(userId, promise);
    return promise;
  },

  resolveAndCacheSample: (userId: string) => {
    const cached = get().resolvedPersonas.get(userId);
    if (cached) {
      set({ selectedPersonaId: userId });
      return cached;
    }

    const persona = SAMPLE_PERSONAS.find((p) => p.id === userId);
    if (!persona) return null;

    const updated = new Map(get().resolvedPersonas);
    updated.set(userId, persona);
    set({
      resolvedPersonas: updated,
      selectedPersonaId: userId,
    });
    return persona;
  },

  selectPersona: (userId: string) => {
    set({ selectedPersonaId: userId });
  },

  getSelectedContext: () => {
    const { selectedPersonaId, resolvedPersonas } = get();
    if (!selectedPersonaId) return null;
    return resolvedPersonas.get(selectedPersonaId) ?? null;
  },

  setSlotUser: (slotKey: string, user: UserContext) => {
    set((s) => ({
      personaSlots: s.personaSlots.map((slot) => (slot.key === slotKey ? { ...slot, user } : slot)),
    }));
  },

  clearSlotUser: (slotKey: string) => {
    set((s) => ({
      personaSlots: s.personaSlots.map((slot) =>
        slot.key === slotKey ? { ...slot, user: undefined } : slot,
      ),
    }));
  },

  clear: () => {
    // Called on logout and on data-source switch — mapped accounts belong to the
    // tenant that was signed in, so they must not survive either.
    set({
      resolvedPersonas: new Map(),
      personaSlots: emptySlots(),
      selectedPersonaId: null,
      error: null,
    });
  },
}));
