// stores/usePolicyStore.ts — Zustand store for fetched policies.

import { create } from 'zustand';
import type { ConditionalAccessPolicy } from '../engine/models/Policy';
import { loadPoliciesFromGraph, fetchTenantName, type NamedLocationInfo } from '../services/graphService';
import { getAccessToken } from '../services/auth';
import { SAMPLE_POLICIES, SAMPLE_DISPLAY_NAMES } from '../data/samplePolicies';

interface PolicyState {
  policies: ConditionalAccessPolicy[];
  namedLocations: Map<string, NamedLocationInfo>;
  displayNames: Map<string, string>;
  tenantName: string | null;
  isLoading: boolean;
  error: string | null;
  dataSource: 'none' | 'live' | 'sample';

  // Actions
  loadTenantName: () => Promise<void>;
  loadFromGraph: () => Promise<void>;
  loadSampleData: () => void;
  clear: () => void;
}

export const usePolicyStore = create<PolicyState>((set) => ({
  policies: [],
  namedLocations: new Map(),
  displayNames: new Map(),
  tenantName: null,
  isLoading: false,
  error: null,
  dataSource: 'none',

  loadTenantName: async () => {
    const token = await getAccessToken();
    const name = await fetchTenantName(token);
    if (name) set({ tenantName: name });
  },

  loadFromGraph: async () => {
    set({ isLoading: true, error: null });
    try {
      const token = await getAccessToken();
      const [{ policies, namedLocations, displayNames }, tenantName] = await Promise.all([
        loadPoliciesFromGraph(token),
        fetchTenantName(token),
      ]);
      set({
        policies,
        namedLocations,
        displayNames,
        tenantName,
        isLoading: false,
        dataSource: 'live',
      });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load policies',
      });
    }
  },

  loadSampleData: () => {
    const displayNames = new Map<string, string>();
    for (const [id, name] of Object.entries(SAMPLE_DISPLAY_NAMES)) {
      displayNames.set(id, name);
    }
    set({
      policies: SAMPLE_POLICIES,
      namedLocations: new Map(),
      displayNames,
      isLoading: false,
      error: null,
      dataSource: 'sample',
    });
  },

  clear: () => {
    set({
      policies: [],
      namedLocations: new Map(),
      displayNames: new Map(),
      tenantName: null,
      error: null,
      dataSource: 'none',
    });
  },
}));
