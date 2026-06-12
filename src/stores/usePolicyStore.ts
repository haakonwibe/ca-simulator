// stores/usePolicyStore.ts — Zustand store for fetched policies.

import { create } from 'zustand';
import type { ConditionalAccessPolicy, PolicyState } from '../engine/models/Policy';
import { loadPoliciesFromGraph, fetchTenantName, type NamedLocationInfo } from '../services/graphService';
import { getAccessToken } from '../services/auth';
import { SAMPLE_POLICIES, SAMPLE_DISPLAY_NAMES } from '../data/samplePolicies';
import type { TenantApplication } from '../types/TenantApplication';
import {
  applySandboxEdits,
  pruneSandboxOverrides,
  pruneSandboxAssignments,
  sameMembers,
  getAssignmentField,
  type SandboxOverrides,
  type SandboxAssignments,
  type AssignmentField,
} from '../lib/sandbox';

interface PolicyStoreState {
  policies: ConditionalAccessPolicy[];
  namedLocations: Map<string, NamedLocationInfo>;
  displayNames: Map<string, string>;
  authStrengthMap: Map<string, number>;
  tenantApplications: TenantApplication[];
  tenantName: string | null;
  isLoading: boolean;
  error: string | null;
  dataSource: 'none' | 'live' | 'sample';

  // Sandbox: hypothetical policy overrides (state + assignments), applied on
  // top of live policies. effectivePolicies is what every consumer reads —
  // identical reference to policies when the sandbox is off or has no changes.
  sandboxActive: boolean;
  sandboxOverrides: SandboxOverrides;
  sandboxAssignments: SandboxAssignments;
  effectivePolicies: ConditionalAccessPolicy[];

  // Actions
  loadTenantName: () => Promise<void>;
  loadFromGraph: () => Promise<void>;
  loadSampleData: () => void;
  clear: () => void;
  setSandboxActive: (active: boolean) => void;
  setSandboxOverride: (policyId: string, state: PolicyState) => void;
  setAssignmentOverride: (policyId: string, field: AssignmentField, values: string[]) => void;
  revertPolicySandbox: (policyId: string) => void;
  resetSandbox: () => void;
  /** Merge resolved display names (e.g. from user search picks) for GUID rendering. */
  mergeDisplayNames: (entries: Record<string, string>) => void;
}

function computeEffectivePolicies(
  policies: ConditionalAccessPolicy[],
  sandboxActive: boolean,
  overrides: SandboxOverrides,
  assignments: SandboxAssignments,
): ConditionalAccessPolicy[] {
  if (!sandboxActive) return policies;
  if (Object.keys(overrides).length === 0 && Object.keys(assignments).length === 0) return policies;
  return applySandboxEdits(policies, overrides, assignments);
}

export const usePolicyStore = create<PolicyStoreState>((set, get) => ({
  policies: [],
  namedLocations: new Map(),
  displayNames: new Map(),
  authStrengthMap: new Map(),
  tenantApplications: [],
  tenantName: null,
  isLoading: false,
  error: null,
  dataSource: 'none',
  sandboxActive: false,
  sandboxOverrides: {},
  sandboxAssignments: {},
  effectivePolicies: [],

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
      // Refreshing the same source keeps sandbox changes (pruned against the
      // new policy list); switching sources starts with a clean sandbox.
      const isRefresh = get().dataSource === 'live';
      const sandboxActive = isRefresh ? get().sandboxActive : false;
      const sandboxOverrides = isRefresh
        ? pruneSandboxOverrides(policies, get().sandboxOverrides)
        : {};
      const sandboxAssignments = isRefresh
        ? pruneSandboxAssignments(policies, get().sandboxAssignments)
        : {};
      set({
        policies,
        namedLocations,
        displayNames,
        authStrengthMap,
        tenantApplications,
        tenantName,
        isLoading: false,
        dataSource: 'live',
        sandboxActive,
        sandboxOverrides,
        sandboxAssignments,
        effectivePolicies: computeEffectivePolicies(policies, sandboxActive, sandboxOverrides, sandboxAssignments),
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
    const isRefresh = get().dataSource === 'sample';
    const sandboxActive = isRefresh ? get().sandboxActive : false;
    const sandboxOverrides = isRefresh ? get().sandboxOverrides : {};
    const sandboxAssignments = isRefresh ? get().sandboxAssignments : {};
    set({
      policies: SAMPLE_POLICIES,
      namedLocations: new Map(),
      displayNames,
      authStrengthMap: sampleAuthStrengthMap,
      tenantApplications: sampleTenantApps,
      tenantName: null,
      isLoading: false,
      error: null,
      dataSource: 'sample',
      sandboxActive,
      sandboxOverrides,
      sandboxAssignments,
      effectivePolicies: computeEffectivePolicies(SAMPLE_POLICIES, sandboxActive, sandboxOverrides, sandboxAssignments),
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
      sandboxActive: false,
      sandboxOverrides: {},
      sandboxAssignments: {},
      effectivePolicies: [],
    });
  },

  setSandboxActive: (active) => {
    const { policies, sandboxOverrides, sandboxAssignments } = get();
    set({
      sandboxActive: active,
      effectivePolicies: computeEffectivePolicies(policies, active, sandboxOverrides, sandboxAssignments),
    });
  },

  setSandboxOverride: (policyId, state) => {
    const { policies, sandboxActive, sandboxOverrides, sandboxAssignments } = get();
    const livePolicy = policies.find((p) => p.id === policyId);
    if (!livePolicy) return;

    const overrides = { ...sandboxOverrides };
    if (livePolicy.state === state) {
      delete overrides[policyId]; // back to live state — not a change
    } else {
      overrides[policyId] = state;
    }
    set({
      sandboxOverrides: overrides,
      effectivePolicies: computeEffectivePolicies(policies, sandboxActive, overrides, sandboxAssignments),
    });
  },

  setAssignmentOverride: (policyId, field, values) => {
    const { policies, sandboxActive, sandboxOverrides, sandboxAssignments } = get();
    const livePolicy = policies.find((p) => p.id === policyId);
    if (!livePolicy) return;

    const assignments = { ...sandboxAssignments };
    const override = { ...(assignments[policyId] ?? {}) };

    if (sameMembers(values, getAssignmentField(livePolicy, field))) {
      delete override[field]; // back to live value — not a change
    } else {
      override[field] = values;
    }

    if (Object.keys(override).length === 0) {
      delete assignments[policyId];
    } else {
      assignments[policyId] = override;
    }
    set({
      sandboxAssignments: assignments,
      effectivePolicies: computeEffectivePolicies(policies, sandboxActive, sandboxOverrides, assignments),
    });
  },

  revertPolicySandbox: (policyId) => {
    const { policies, sandboxActive, sandboxOverrides, sandboxAssignments } = get();
    const overrides = { ...sandboxOverrides };
    const assignments = { ...sandboxAssignments };
    delete overrides[policyId];
    delete assignments[policyId];
    set({
      sandboxOverrides: overrides,
      sandboxAssignments: assignments,
      effectivePolicies: computeEffectivePolicies(policies, sandboxActive, overrides, assignments),
    });
  },

  resetSandbox: () => {
    set({ sandboxOverrides: {}, sandboxAssignments: {}, effectivePolicies: get().policies });
  },

  mergeDisplayNames: (entries) => {
    const merged = new Map(get().displayNames);
    for (const [id, name] of Object.entries(entries)) {
      merged.set(id, name);
    }
    set({ displayNames: merged });
  },
}));
