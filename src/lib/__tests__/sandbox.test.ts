// lib/__tests__/sandbox.test.ts — Sandbox override helper tests.

import { describe, it, expect } from 'vitest';
import { applySandboxOverrides, pruneSandboxOverrides } from '../sandbox';
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
