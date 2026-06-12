// lib/__tests__/sandbox.test.ts — Sandbox override helper tests.

import { describe, it, expect } from 'vitest';
import {
  applySandboxOverrides,
  applySandboxEdits,
  pruneSandboxOverrides,
  pruneSandboxAssignments,
  sameMembers,
  getAssignmentField,
} from '../sandbox';
import type { ConditionalAccessPolicy, PolicyConditions } from '@/engine/models/Policy';

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

describe('applySandboxOverrides', () => {
  it('applies an overridden state as a shallow copy', () => {
    const policy = createPolicy({ id: 'p1', state: 'enabled' });
    const result = applySandboxOverrides([policy], { p1: 'disabled' });

    expect(result[0].state).toBe('disabled');
    expect(result[0]).not.toBe(policy);
    expect(result[0].conditions).toBe(policy.conditions); // shallow copy shares nested objects
  });

  it('never mutates the input policies', () => {
    const policy = createPolicy({ id: 'p1', state: 'enabled' });
    applySandboxOverrides([policy], { p1: 'disabled' });

    expect(policy.state).toBe('enabled');
  });

  it('keeps the original reference for untouched policies', () => {
    const p1 = createPolicy({ id: 'p1' });
    const p2 = createPolicy({ id: 'p2' });
    const result = applySandboxOverrides([p1, p2], { p1: 'disabled' });

    expect(result[1]).toBe(p2);
  });

  it('promotes report-only to enabled', () => {
    const policy = createPolicy({ id: 'p1', state: 'enabledForReportingButNotEnforced' });
    const result = applySandboxOverrides([policy], { p1: 'enabled' });

    expect(result[0].state).toBe('enabled');
  });

  it('returns the same object when an override matches the live state', () => {
    const policy = createPolicy({ id: 'p1', state: 'enabled' });
    const result = applySandboxOverrides([policy], { p1: 'enabled' });

    expect(result[0]).toBe(policy);
  });

  it('ignores overrides for unknown policy ids', () => {
    const policy = createPolicy({ id: 'p1', state: 'enabled' });
    const result = applySandboxOverrides([policy], { ghost: 'disabled' });

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(policy);
  });

  it('handles empty overrides', () => {
    const policy = createPolicy({ id: 'p1' });
    const result = applySandboxOverrides([policy], {});

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(policy);
  });
});

describe('sameMembers', () => {
  it('is order-insensitive', () => {
    expect(sameMembers(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameMembers(['a'], ['a', 'b'])).toBe(false);
    expect(sameMembers([], [])).toBe(true);
  });
});

describe('applySandboxEdits', () => {
  it('applies assignment overrides as new condition objects without mutating live', () => {
    const policy = createPolicy({ id: 'p1' });
    const result = applySandboxEdits([policy], {}, { p1: { excludeUsers: ['u1'] } });

    expect(result[0].conditions.users.excludeUsers).toEqual(['u1']);
    expect(result[0]).not.toBe(policy);
    expect(result[0].conditions).not.toBe(policy.conditions);
    expect(result[0].conditions.users).not.toBe(policy.conditions.users);
    expect(policy.conditions.users.excludeUsers).toEqual([]); // live untouched
    // Unrelated nested objects keep their reference
    expect(result[0].conditions.applications).not.toBe(policy.conditions.applications); // new object (patched container)
    expect(result[0].conditions.applications.includeApplications).toBe(policy.conditions.applications.includeApplications);
  });

  it('applies app field overrides to conditions.applications', () => {
    const policy = createPolicy({ id: 'p1' });
    const result = applySandboxEdits([policy], {}, { p1: { includeApplications: ['Office365'] } });

    expect(result[0].conditions.applications.includeApplications).toEqual(['Office365']);
    expect(result[0].conditions.users.includeUsers).toEqual(['All']);
  });

  it('combines state and assignment overrides', () => {
    const policy = createPolicy({ id: 'p1', state: 'enabled' });
    const result = applySandboxEdits([policy], { p1: 'disabled' }, { p1: { excludeUsers: ['u1'] } });

    expect(result[0].state).toBe('disabled');
    expect(result[0].conditions.users.excludeUsers).toEqual(['u1']);
  });

  it('keeps untouched policies by reference', () => {
    const p1 = createPolicy({ id: 'p1' });
    const p2 = createPolicy({ id: 'p2' });
    const result = applySandboxEdits([p1, p2], {}, { p1: { excludeUsers: ['u1'] } });

    expect(result[1]).toBe(p2);
  });
});

describe('pruneSandboxAssignments', () => {
  it('drops entries for vanished policies', () => {
    const policies = [createPolicy({ id: 'p1' })];
    const pruned = pruneSandboxAssignments(policies, {
      p1: { excludeUsers: ['u1'] },
      ghost: { excludeUsers: ['u2'] },
    });

    expect(pruned).toEqual({ p1: { excludeUsers: ['u1'] } });
  });

  it('drops field overrides now equal to live (set-equality)', () => {
    const policy = createPolicy({
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
    const pruned = pruneSandboxAssignments([policy], {
      p1: { excludeUsers: ['u2', 'u1'], includeUsers: ['None'] },
    });

    expect(pruned).toEqual({ p1: { includeUsers: ['None'] } });
  });

  it('keeps overrides whose live value changed underneath', () => {
    // The sandbox states intent — not a three-way merge
    const policy = createPolicy({ id: 'p1' }); // live excludeUsers: []
    const pruned = pruneSandboxAssignments([policy], { p1: { excludeUsers: ['u1'] } });

    expect(pruned).toEqual({ p1: { excludeUsers: ['u1'] } });
  });
});

describe('getAssignmentField', () => {
  it('reads user and application fields', () => {
    const policy = createPolicy({ id: 'p1' });
    expect(getAssignmentField(policy, 'includeUsers')).toEqual(['All']);
    expect(getAssignmentField(policy, 'includeApplications')).toEqual(['All']);
    expect(getAssignmentField(policy, 'excludeGroups')).toEqual([]);
  });

  it('reads agent fields, defaulting to empty without clientApplications', () => {
    const plain = createPolicy({ id: 'p1' });
    expect(getAssignmentField(plain, 'includeAgentIdServicePrincipals')).toEqual([]);

    const agentPolicy = createPolicy({
      id: 'p2',
      conditions: {
        ...createBaseConditions(),
        clientApplications: {
          includeServicePrincipals: [],
          excludeServicePrincipals: [],
          includeAgentIdServicePrincipals: ['All'],
          excludeAgentIdServicePrincipals: ['agent-1'],
        },
      },
    });
    expect(getAssignmentField(agentPolicy, 'includeAgentIdServicePrincipals')).toEqual(['All']);
    expect(getAssignmentField(agentPolicy, 'excludeAgentIdServicePrincipals')).toEqual(['agent-1']);
  });
});

describe('applySandboxEdits — agent fields', () => {
  it('patches the clientApplications block without mutating live', () => {
    const policy = createPolicy({
      id: 'p1',
      conditions: {
        ...createBaseConditions(),
        clientApplications: {
          includeServicePrincipals: [],
          excludeServicePrincipals: [],
          includeAgentIdServicePrincipals: ['All'],
        },
      },
    });
    const result = applySandboxEdits([policy], {}, {
      p1: { excludeAgentIdServicePrincipals: ['approved-agent'] },
    });

    expect(result[0].conditions.clientApplications!.excludeAgentIdServicePrincipals).toEqual(['approved-agent']);
    expect(result[0].conditions.clientApplications!.includeAgentIdServicePrincipals).toEqual(['All']);
    expect(policy.conditions.clientApplications!.excludeAgentIdServicePrincipals).toBeUndefined();
  });
});

describe('pruneSandboxOverrides', () => {
  it('drops overrides for policies that no longer exist', () => {
    const policies = [createPolicy({ id: 'p1', state: 'enabled' })];
    const pruned = pruneSandboxOverrides(policies, {
      p1: 'disabled',
      deleted: 'disabled',
    });

    expect(pruned).toEqual({ p1: 'disabled' });
  });

  it('drops overrides matching the new live state', () => {
    // The admin applied the sandboxed change for real, then refreshed.
    const policies = [createPolicy({ id: 'p1', state: 'disabled' })];
    const pruned = pruneSandboxOverrides(policies, { p1: 'disabled' });

    expect(pruned).toEqual({});
  });

  it('keeps overrides that still deviate', () => {
    const policies = [
      createPolicy({ id: 'p1', state: 'enabled' }),
      createPolicy({ id: 'p2', state: 'enabledForReportingButNotEnforced' }),
    ];
    const overrides = {
      p1: 'disabled',
      p2: 'enabled',
    } as const;
    const pruned = pruneSandboxOverrides(policies, overrides);

    expect(pruned).toEqual(overrides);
  });

  it('returns empty for empty overrides', () => {
    const policies = [createPolicy({ id: 'p1' })];

    expect(pruneSandboxOverrides(policies, {})).toEqual({});
  });
});
