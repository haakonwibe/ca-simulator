// stores/usePolicyStore.ts — Zustand store for fetched policies.

import { create } from 'zustand';
import type { ConditionalAccessPolicy } from '../engine/models/Policy';
import { loadPoliciesFromGraph, fetchTenantName, type NamedLocationInfo } from '../services/graphService';
import { getAccessToken } from '../services/auth';
import { SAMPLE_POLICIES, SAMPLE_DISPLAY_NAMES } from '../data/samplePolicies';
import type { TenantApplication } from '../types/TenantApplication';

interface PolicyState {
  policies: ConditionalAccessPolicy[];
  namedLocations: Map<string, NamedLocationInfo>;
  displayNames: Map<string, string>;
  authStrengthMap: Map<string, number>;
  tenantApplications: TenantApplication[];
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
  authStrengthMap: new Map(),
  tenantApplications: [],
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
      const [{ policies, namedLocations, displayNames, authStrengthMap, tenantApplications }, tenantName] = await Promise.all([
        loadPoliciesFromGraph(token),
        fetchTenantName(token),
      ]);
      set({
        policies,
        namedLocations,
        displayNames,
        authStrengthMap,
        tenantApplications,
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
    const sampleAuthStrengthMap = new Map<string, number>();
    sampleAuthStrengthMap.set('00000000-0000-0000-0000-000000000099', 3); // Phishing-resistant tier
    const sampleTenantApps: TenantApplication[] = [
      { appId: '797f4846-ba00-4fd7-ba43-dac1f8f63013', displayName: 'Azure Service Management', source: 'enterprise' },
      { appId: '499b84ac-1321-427f-aa17-267ca6975798', displayName: 'Azure DevOps', source: 'enterprise' },
      { appId: 'de8bc8b5-d9f9-48b1-a8ad-b748da725064', displayName: 'Graph Explorer', source: 'enterprise' },
      { appId: '14d82eec-204b-4c2f-b7e8-296a70dab67e', displayName: 'Microsoft Graph Command Line Tools', source: 'enterprise' },
      { appId: '00000009-0000-0000-c000-000000000000', displayName: 'Power BI Service', source: 'enterprise' },
    ];
    set({
      policies: SAMPLE_POLICIES,
      namedLocations: new Map(),
      displayNames,
      authStrengthMap: sampleAuthStrengthMap,
      tenantApplications: sampleTenantApps,
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
      authStrengthMap: new Map(),
      tenantApplications: [],
      tenantName: null,
      error: null,
      dataSource: 'none',
    });
  },
}));
