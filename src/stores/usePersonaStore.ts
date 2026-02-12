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
import { SAMPLE_PERSONAS } from '../data/samplePersonas';

interface PersonaState {
  // Resolved personas cache: userId → UserContext
  resolvedPersonas: Map<string, UserContext>;
  // Currently selected persona for simulation
  selectedPersonaId: string | null;
  isResolving: boolean;
  error: string | null;

  // Actions
  searchUsers: (query: string) => Promise<UserSearchResult[]>;
  fetchDefaultUsers: () => Promise<UserSearchResult[]>;
  searchSampleUsers: (query: string) => UserSearchResult[];
  resolveAndCache: (userId: string) => Promise<UserContext>;
  resolveAndCacheSample: (userId: string) => UserContext | null;
  selectPersona: (userId: string) => void;
  getSelectedContext: () => UserContext | null;
  clear: () => void;
}

export const usePersonaStore = create<PersonaState>((set, get) => ({
  resolvedPersonas: new Map(),
  selectedPersonaId: null,
  isResolving: false,
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

    set({ isResolving: true, error: null });
    try {
      const token = await getAccessToken();
      const context = await resolveUserContext(token, userId);
      const updated = new Map(get().resolvedPersonas);
      updated.set(userId, context);
      set({
        resolvedPersonas: updated,
        selectedPersonaId: userId,
        isResolving: false,
      });
      return context;
    } catch (error) {
      set({
        isResolving: false,
        error: error instanceof Error ? error.message : 'Failed to resolve user',
      });
      throw error;
    }
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

  clear: () => {
    set({
      resolvedPersonas: new Map(),
      selectedPersonaId: null,
      error: null,
    });
  },
}));
