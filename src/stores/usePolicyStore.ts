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
import { TEMPLATE_POLICIES, templateDraftId } from '../data/templatePolicies';

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
  /** Beta policy endpoint unavailable — agent targeting invisible in loaded policies */
  agentDetailsUnavailable: boolean;

  // Sandbox: hypothetical policy overrides (state + assignments), applied on
  // top of live policies. effectivePolicies is what every consumer reads —
  // identical reference to policies when the sandbox is off or has no changes.
  sandboxActive: boolean;
  sandboxOverrides: SandboxOverrides;
  sandboxAssignments: SandboxAssignments;
  /** Draft policies that exist only in the sandbox (e.g. Fix-in-sandbox templates) */
  sandboxDrafts: Record<string, ConditionalAccessPolicy>;
  effectivePolicies: ConditionalAccessPolicy[];

  // Actions
  loadTenantName: () => Promise<void>;
  loadFromGraph: () => Promise<void>;
  loadSampleData: () => void;
  clear: () => void;
  setSandboxActive: (active: boolean) => void;
  setSandboxOverride: (policyId: string, state: PolicyState) => void;
  setAssignmentOverride: (policyId: string, field: AssignmentField, values: string[]) => void;
  /** Creates (or reuses) a draft from a baseline template; activates the sandbox. Returns the draft id. */
  createDraftFromTemplate: (checkId: string) => string | null;
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
  drafts: Record<string, ConditionalAccessPolicy>,
): ConditionalAccessPolicy[] {
  if (!sandboxActive) return policies;
  const draftList = Object.values(drafts);
  if (Object.keys(overrides).length === 0 && Object.keys(assignments).length === 0 && draftList.length === 0) {
    return policies;
  }
  return [...applySandboxEdits(policies, overrides, assignments), ...draftList];
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
  agentDetailsUnavailable: false,
  sandboxActive: false,
  sandboxOverrides: {},
  sandboxAssignments: {},
  sandboxDrafts: {},
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
      const [{ policies, namedLocations, displayNames, authStrengthMap, tenantApplications, agentDetailsUnavailable }, tenantName] = await Promise.all([
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
      // Drafts are independent of tenant state — kept on refresh, cleared on switch
      const sandboxDrafts = isRefresh ? get().sandboxDrafts : {};
      set({
        policies,
        namedLocations,
        displayNames,
        authStrengthMap,
        tenantApplications,
        tenantName,
        isLoading: false,
        dataSource: 'live',
        agentDetailsUnavailable: agentDetailsUnavailable ?? false,
        sandboxActive,
        sandboxOverrides,
        sandboxAssignments,
        sandboxDrafts,
        effectivePolicies: computeEffectivePolicies(policies, sandboxActive, sandboxOverrides, sandboxAssignments, sandboxDrafts),
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
    const sandboxDrafts = isRefresh ? get().sandboxDrafts : {};
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
      agentDetailsUnavailable: false,
      sandboxActive,
      sandboxOverrides,
      sandboxAssignments,
      sandboxDrafts,
      effectivePolicies: computeEffectivePolicies(SAMPLE_POLICIES, sandboxActive, sandboxOverrides, sandboxAssignments, sandboxDrafts),
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
      sandboxDrafts: {},
      effectivePolicies: [],
    });
  },

  setSandboxActive: (active) => {
    const { policies, sandboxOverrides, sandboxAssignments, sandboxDrafts } = get();
    set({
      sandboxActive: active,
      effectivePolicies: computeEffectivePolicies(policies, active, sandboxOverrides, sandboxAssignments, sandboxDrafts),
    });
  },

  setSandboxOverride: (policyId, state) => {
    const { policies, sandboxActive, sandboxOverrides, sandboxAssignments, sandboxDrafts } = get();

    // Drafts have no live counterpart — write the state into the draft itself
    if (policyId in sandboxDrafts) {
      const drafts = { ...sandboxDrafts, [policyId]: { ...sandboxDrafts[policyId], state } };
      set({
        sandboxDrafts: drafts,
        effectivePolicies: computeEffectivePolicies(policies, sandboxActive, sandboxOverrides, sandboxAssignments, drafts),
      });
      return;
    }

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
      effectivePolicies: computeEffectivePolicies(policies, sandboxActive, overrides, sandboxAssignments, sandboxDrafts),
    });
  },

  setAssignmentOverride: (policyId, field, values) => {
    const { policies, sandboxActive, sandboxOverrides, sandboxAssignments, sandboxDrafts } = get();

    // Drafts have no live counterpart — write the field into the draft itself
    if (policyId in sandboxDrafts) {
      const draft = sandboxDrafts[policyId];
      const isAppField = field === 'includeApplications' || field === 'excludeApplications';
      const updated: ConditionalAccessPolicy = {
        ...draft,
        conditions: {
          ...draft.conditions,
          users: isAppField ? draft.conditions.users : { ...draft.conditions.users, [field]: values },
          applications: isAppField
            ? { ...draft.conditions.applications, [field]: values }
            : draft.conditions.applications,
        },
      };
      const drafts = { ...sandboxDrafts, [policyId]: updated };
      set({
        sandboxDrafts: drafts,
        effectivePolicies: computeEffectivePolicies(policies, sandboxActive, sandboxOverrides, sandboxAssignments, drafts),
      });
      return;
    }

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
      effectivePolicies: computeEffectivePolicies(policies, sandboxActive, sandboxOverrides, assignments, sandboxDrafts),
    });
  },

  createDraftFromTemplate: (checkId) => {
    const template = TEMPLATE_POLICIES.get(checkId);
    if (!template) return null;

    const draftId = templateDraftId(checkId);
    const { policies, sandboxOverrides, sandboxAssignments, sandboxDrafts } = get();

    // Repeat clicks reuse the existing draft (no twins)
    const drafts = draftId in sandboxDrafts
      ? sandboxDrafts
      : { ...sandboxDrafts, [draftId]: { ...template, id: draftId, state: 'enabled' as PolicyState } };

    set({
      sandboxActive: true, // Fix-in-sandbox always lands in the sandbox
      sandboxDrafts: drafts,
      effectivePolicies: computeEffectivePolicies(policies, true, sandboxOverrides, sandboxAssignments, drafts),
    });
    return draftId;
  },

  revertPolicySandbox: (policyId) => {
    const { policies, sandboxActive, sandboxOverrides, sandboxAssignments, sandboxDrafts } = get();
    const overrides = { ...sandboxOverrides };
    const assignments = { ...sandboxAssignments };
    const drafts = { ...sandboxDrafts };
    delete overrides[policyId];
    delete assignments[policyId];
    delete drafts[policyId];
    set({
      sandboxOverrides: overrides,
      sandboxAssignments: assignments,
      sandboxDrafts: drafts,
      effectivePolicies: computeEffectivePolicies(policies, sandboxActive, overrides, assignments, drafts),
    });
  },

  resetSandbox: () => {
    set({ sandboxOverrides: {}, sandboxAssignments: {}, sandboxDrafts: {}, effectivePolicies: get().policies });
  },

  mergeDisplayNames: (entries) => {
    const merged = new Map(get().displayNames);
    for (const [id, name] of Object.entries(entries)) {
      merged.set(id, name);
    }
    set({ displayNames: merged });
  },
}));
