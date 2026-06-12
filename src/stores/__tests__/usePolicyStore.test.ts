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

describe('assignment overrides', () => {
  it('setAssignmentOverride records a deviation and updates effectivePolicies', () => {
    const p1 = createPolicy({ id: 'p1' });
    seedLive([p1]);
    usePolicyStore.getState().setSandboxActive(true);

    usePolicyStore.getState().setAssignmentOverride('p1', 'excludeUsers', ['u1']);

    const s = usePolicyStore.getState();
    expect(s.sandboxAssignments).toEqual({ p1: { excludeUsers: ['u1'] } });
    expect(s.effectivePolicies[0].conditions.users.excludeUsers).toEqual(['u1']);
    expect(s.policies[0].conditions.users.excludeUsers).toEqual([]); // live untouched
  });

  it('setting a field back to its live value removes the override', () => {
    const p1 = createPolicy({ id: 'p1' });
    seedLive([p1]);
    usePolicyStore.getState().setSandboxActive(true);
    usePolicyStore.getState().setAssignmentOverride('p1', 'excludeUsers', ['u1']);

    usePolicyStore.getState().setAssignmentOverride('p1', 'excludeUsers', []);

    const s = usePolicyStore.getState();
    expect(s.sandboxAssignments).toEqual({});
    expect(s.effectivePolicies).toBe(s.policies);
  });

  it('normalization is order-insensitive', () => {
    const p1 = createPolicy({
      id: 'p1',
      conditions: {
        ...createBaseConditions(),
        users: {
          includeUsers: ['All'],
          excludeUsers: ['u1', 'u2'],
          includeGroups: [],
          excludeGroups: [],
          includeRoles: [],
          excludeRoles: [],
        },
      },
    });
    seedLive([p1]);
    usePolicyStore.getState().setSandboxActive(true);

    usePolicyStore.getState().setAssignmentOverride('p1', 'excludeUsers', ['u2', 'u1']);

    expect(usePolicyStore.getState().sandboxAssignments).toEqual({});
  });

  it('revertPolicySandbox clears both maps for one policy only', () => {
    const p1 = createPolicy({ id: 'p1' });
    const p2 = createPolicy({ id: 'p2' });
    seedLive([p1, p2]);
    usePolicyStore.getState().setSandboxActive(true);
    usePolicyStore.getState().setSandboxOverride('p1', 'disabled');
    usePolicyStore.getState().setAssignmentOverride('p1', 'excludeUsers', ['u1']);
    usePolicyStore.getState().setSandboxOverride('p2', 'disabled');

    usePolicyStore.getState().revertPolicySandbox('p1');

    const s = usePolicyStore.getState();
    expect(s.sandboxOverrides).toEqual({ p2: 'disabled' });
    expect(s.sandboxAssignments).toEqual({});
    expect(s.effectivePolicies[0]).toBe(p1);
    expect(s.effectivePolicies[1].state).toBe('disabled');
  });

  it('resetSandbox clears assignment overrides too', () => {
    seedLive([createPolicy({ id: 'p1' })]);
    usePolicyStore.getState().setSandboxActive(true);
    usePolicyStore.getState().setAssignmentOverride('p1', 'excludeUsers', ['u1']);

    usePolicyStore.getState().resetSandbox();

    const s = usePolicyStore.getState();
    expect(s.sandboxAssignments).toEqual({});
    expect(s.effectivePolicies).toBe(s.policies);
  });

  it('mergeDisplayNames adds entries without dropping existing ones', () => {
    usePolicyStore.setState({ displayNames: new Map([['a', 'Alpha']]) });

    usePolicyStore.getState().mergeDisplayNames({ b: 'Beta' });

    const names = usePolicyStore.getState().displayNames;
    expect(names.get('a')).toBe('Alpha');
    expect(names.get('b')).toBe('Beta');
  });
});

describe('draft policies', () => {
  it('createDraftFromTemplate creates the draft, activates the sandbox, and appends to effectivePolicies', () => {
    seedLive([createPolicy({ id: 'p1' })]);

    const draftId = usePolicyStore.getState().createDraftFromTemplate('block-legacy-auth');

    const s = usePolicyStore.getState();
    expect(draftId).toBe('draft-block-legacy-auth');
    expect(s.sandboxActive).toBe(true);
    expect(s.sandboxDrafts[draftId!]).toBeDefined();
    expect(s.sandboxDrafts[draftId!].state).toBe('enabled');
    expect(s.effectivePolicies).toHaveLength(2);
    expect(s.effectivePolicies[1].displayName).toContain('[Draft]');
    expect(s.policies).toHaveLength(1); // live untouched
  });

  it('repeat clicks reuse the existing draft', () => {
    seedLive([createPolicy({ id: 'p1' })]);
    usePolicyStore.getState().createDraftFromTemplate('block-legacy-auth');
    usePolicyStore.getState().setSandboxOverride('draft-block-legacy-auth', 'disabled');

    usePolicyStore.getState().createDraftFromTemplate('block-legacy-auth');

    const s = usePolicyStore.getState();
    expect(Object.keys(s.sandboxDrafts)).toHaveLength(1);
    expect(s.sandboxDrafts['draft-block-legacy-auth'].state).toBe('disabled'); // edits preserved
  });

  it('returns null for unknown template ids', () => {
    seedLive([createPolicy({ id: 'p1' })]);
    expect(usePolicyStore.getState().createDraftFromTemplate('no-such-check')).toBeNull();
  });

  it('state and assignment edits write directly into the draft', () => {
    seedLive([createPolicy({ id: 'p1' })]);
    const draftId = usePolicyStore.getState().createDraftFromTemplate('require-mfa-all-users')!;

    usePolicyStore.getState().setSandboxOverride(draftId, 'enabledForReportingButNotEnforced');
    usePolicyStore.getState().setAssignmentOverride(draftId, 'excludeUsers', ['break-glass-id']);

    const s = usePolicyStore.getState();
    expect(s.sandboxDrafts[draftId].state).toBe('enabledForReportingButNotEnforced');
    expect(s.sandboxDrafts[draftId].conditions.users.excludeUsers).toEqual(['break-glass-id']);
    // No deviation entries recorded for drafts — the draft IS the record
    expect(s.sandboxOverrides).toEqual({});
    expect(s.sandboxAssignments).toEqual({});
  });

  it('revertPolicySandbox deletes a draft', () => {
    seedLive([createPolicy({ id: 'p1' })]);
    const draftId = usePolicyStore.getState().createDraftFromTemplate('block-legacy-auth')!;

    usePolicyStore.getState().revertPolicySandbox(draftId);

    const s = usePolicyStore.getState();
    expect(s.sandboxDrafts).toEqual({});
    expect(s.effectivePolicies).toHaveLength(1);
  });

  it('resetSandbox clears drafts', () => {
    seedLive([createPolicy({ id: 'p1' })]);
    usePolicyStore.getState().createDraftFromTemplate('block-legacy-auth');

    usePolicyStore.getState().resetSandbox();

    expect(usePolicyStore.getState().sandboxDrafts).toEqual({});
  });

  it('a live refresh keeps drafts; a source switch clears them', async () => {
    seedLive([createPolicy({ id: 'p1' })]);
    usePolicyStore.getState().createDraftFromTemplate('block-legacy-auth');

    loadPoliciesFromGraphMock.mockResolvedValue(graphResult([createPolicy({ id: 'p1' })]));
    await usePolicyStore.getState().loadFromGraph(); // refresh (live → live)
    expect(Object.keys(usePolicyStore.getState().sandboxDrafts)).toHaveLength(1);

    usePolicyStore.getState().loadSampleData(); // switch (live → sample)
    expect(usePolicyStore.getState().sandboxDrafts).toEqual({});
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
