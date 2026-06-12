// stores/__tests__/usePolicyStore.test.ts — Sandbox slice behavior.
//
// Services are mocked: the real auth module touches MSAL/window at import time,
// and loadFromGraph must be driven with controllable policy sets.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ConditionalAccessPolicy, PolicyConditions } from '@/engine/models/Policy';

vi.mock('../../services/auth', () => ({
  getAccessToken: vi.fn(async () => 'mock-token'),
}));

const loadPoliciesFromGraphMock = vi.fn();
vi.mock('../../services/graphService', () => ({
  loadPoliciesFromGraph: (...args: unknown[]) => loadPoliciesFromGraphMock(...args),
  fetchTenantName: vi.fn(async () => 'Contoso'),
}));

import { usePolicyStore } from '../usePolicyStore';

// ── Helpers ──

function createBaseConditions(): PolicyConditions {
  return {
    users: {
      includeUsers: ['All'],
      excludeUsers: [],
      includeGroups: [],
      excludeGroups: [],
      includeRoles: [],
      excludeRoles: [],
    },
    applications: {
      includeApplications: ['All'],
      excludeApplications: [],
    },
    clientAppTypes: [],
    signInRiskLevels: [],
    userRiskLevels: [],
  };
}

function createPolicy(overrides?: Partial<ConditionalAccessPolicy>): ConditionalAccessPolicy {
  return {
    id: 'test-policy',
    displayName: 'Test Policy',
    state: 'enabled',
    conditions: createBaseConditions(),
    grantControls: null,
    sessionControls: null,
    ...overrides,
  };
}

function graphResult(policies: ConditionalAccessPolicy[]) {
  return {
    policies,
    namedLocations: new Map(),
    displayNames: new Map(),
    authStrengthMap: new Map(),
    tenantApplications: [],
  };
}

const initialState = usePolicyStore.getState();

function seedLive(policies: ConditionalAccessPolicy[]) {
  usePolicyStore.setState({
    policies,
    effectivePolicies: policies,
    dataSource: 'live',
  });
}

beforeEach(() => {
  usePolicyStore.setState(initialState, true);
  loadPoliciesFromGraphMock.mockReset();
});

describe('sandbox overrides', () => {
  it('setSandboxOverride records a deviation and updates effectivePolicies when active', () => {
    const p1 = createPolicy({ id: 'p1', state: 'enabled' });
    seedLive([p1]);
    usePolicyStore.getState().setSandboxActive(true);

    usePolicyStore.getState().setSandboxOverride('p1', 'disabled');

    const s = usePolicyStore.getState();
    expect(s.sandboxOverrides).toEqual({ p1: 'disabled' });
    expect(s.effectivePolicies[0].state).toBe('disabled');
    expect(s.policies[0].state).toBe('enabled'); // live untouched
  });

  it('setting a policy back to its live state removes the override', () => {
    const p1 = createPolicy({ id: 'p1', state: 'enabled' });
    seedLive([p1]);
    usePolicyStore.getState().setSandboxActive(true);
    usePolicyStore.getState().setSandboxOverride('p1', 'disabled');

    usePolicyStore.getState().setSandboxOverride('p1', 'enabled');

    const s = usePolicyStore.getState();
    expect(s.sandboxOverrides).toEqual({});
    expect(s.effectivePolicies).toBe(s.policies);
  });

  it('ignores overrides for unknown policy ids', () => {
    seedLive([createPolicy({ id: 'p1' })]);
    usePolicyStore.getState().setSandboxActive(true);

    usePolicyStore.getState().setSandboxOverride('ghost', 'disabled');

    expect(usePolicyStore.getState().sandboxOverrides).toEqual({});
  });

  it('deactivating the sandbox keeps overrides but serves live policies', () => {
    const p1 = createPolicy({ id: 'p1', state: 'enabled' });
    seedLive([p1]);
    usePolicyStore.getState().setSandboxActive(true);
    usePolicyStore.getState().setSandboxOverride('p1', 'disabled');

    usePolicyStore.getState().setSandboxActive(false);

    const s = usePolicyStore.getState();
    expect(s.sandboxOverrides).toEqual({ p1: 'disabled' });
    expect(s.effectivePolicies).toBe(s.policies);

    // Flipping back re-applies the retained overrides
    usePolicyStore.getState().setSandboxActive(true);
    expect(usePolicyStore.getState().effectivePolicies[0].state).toBe('disabled');
  });

  it('resetSandbox clears overrides and restores the live reference', () => {
    const p1 = createPolicy({ id: 'p1', state: 'enabled' });
    seedLive([p1]);
    usePolicyStore.getState().setSandboxActive(true);
    usePolicyStore.getState().setSandboxOverride('p1', 'disabled');

    usePolicyStore.getState().resetSandbox();

    const s = usePolicyStore.getState();
    expect(s.sandboxOverrides).toEqual({});
    expect(s.effectivePolicies).toBe(s.policies);
    expect(s.sandboxActive).toBe(true); // reset clears changes, not the mode
  });

  it('clear() resets all sandbox state', () => {
    seedLive([createPolicy({ id: 'p1' })]);
    usePolicyStore.getState().setSandboxActive(true);
    usePolicyStore.getState().setSandboxOverride('p1', 'disabled');

    usePolicyStore.getState().clear();

    const s = usePolicyStore.getState();
    expect(s.sandboxActive).toBe(false);
    expect(s.sandboxOverrides).toEqual({});
    expect(s.effectivePolicies).toEqual([]);
  });
});

describe('sandbox across data loads', () => {
  it('switching to sample data starts with a clean sandbox', () => {
    seedLive([createPolicy({ id: 'p1' })]);
    usePolicyStore.getState().setSandboxActive(true);
    usePolicyStore.getState().setSandboxOverride('p1', 'disabled');

    usePolicyStore.getState().loadSampleData();

    const s = usePolicyStore.getState();
    expect(s.dataSource).toBe('sample');
    expect(s.sandboxActive).toBe(false);
    expect(s.sandboxOverrides).toEqual({});
    expect(s.effectivePolicies).toBe(s.policies);
  });

  it('re-loading sample data while in sample mode keeps the sandbox', () => {
    usePolicyStore.getState().loadSampleData();
    const sampleId = usePolicyStore.getState().policies[0].id;
    usePolicyStore.getState().setSandboxActive(true);
    usePolicyStore.getState().setSandboxOverride(sampleId, 'disabled');

    usePolicyStore.getState().loadSampleData();

    const s = usePolicyStore.getState();
    expect(s.sandboxActive).toBe(true);
    expect(s.sandboxOverrides).toEqual({ [sampleId]: 'disabled' });
    expect(s.effectivePolicies.find((p) => p.id === sampleId)?.state).toBe('disabled');
  });

  it('a live refresh prunes overrides against the new policy list', async () => {
    const p1 = createPolicy({ id: 'p1', state: 'enabled' });
    const p2 = createPolicy({ id: 'p2', state: 'enabled' });
    seedLive([p1, p2]);
    usePolicyStore.getState().setSandboxActive(true);
    usePolicyStore.getState().setSandboxOverride('p1', 'disabled');
    usePolicyStore.getState().setSandboxOverride('p2', 'disabled');

    // p2 disappeared from the tenant between refreshes
    loadPoliciesFromGraphMock.mockResolvedValue(graphResult([p1]));
    await usePolicyStore.getState().loadFromGraph();

    const s = usePolicyStore.getState();
    expect(s.sandboxActive).toBe(true);
    expect(s.sandboxOverrides).toEqual({ p1: 'disabled' });
    expect(s.effectivePolicies[0].state).toBe('disabled');
  });

  it('switching from sample to live starts with a clean sandbox', async () => {
    usePolicyStore.getState().loadSampleData();
    const sampleId = usePolicyStore.getState().policies[0].id;
    usePolicyStore.getState().setSandboxActive(true);
    usePolicyStore.getState().setSandboxOverride(sampleId, 'disabled');

    loadPoliciesFromGraphMock.mockResolvedValue(graphResult([createPolicy({ id: 'p1' })]));
    await usePolicyStore.getState().loadFromGraph();

    const s = usePolicyStore.getState();
    expect(s.dataSource).toBe('live');
    expect(s.sandboxActive).toBe(false);
    expect(s.sandboxOverrides).toEqual({});
    expect(s.effectivePolicies).toBe(s.policies);
  });
});
