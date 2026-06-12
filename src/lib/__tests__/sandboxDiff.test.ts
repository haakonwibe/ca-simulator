// lib/__tests__/sandboxDiff.test.ts — Sandbox-vs-live sweep comparison tests.

import { describe, it, expect } from 'vitest';
import { compareSweeps, describeSandboxChanges } from '../sandboxDiff';
import { applySandboxOverrides } from '../sandbox';
import type { ConditionalAccessPolicy, PolicyConditions } from '@/engine/models/Policy';

// 3 users × 3 apps × 5 platforms × 4 clients × 2 locations × 4 signInRisk × 4 userRisk
const TOTAL_SCENARIOS = 5760;
// Legacy client types (exchangeActiveSync, other) = 2 of 4 client types
const LEGACY_SCENARIOS = TOTAL_SCENARIOS / 2;

// ── Helpers ──

function createBaseConditions(overrides?: Partial<PolicyConditions>): PolicyConditions {
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
    ...overrides,
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

const mfaForAll = (state: ConditionalAccessPolicy['state'] = 'enabled') =>
  createPolicy({
    id: 'mfa-all',
    displayName: 'Require MFA for All',
    state,
    grantControls: { operator: 'OR', builtInControls: ['mfa'] },
  });

const blockLegacyAuth = (state: ConditionalAccessPolicy['state'] = 'enabled') =>
  createPolicy({
    id: 'block-legacy',
    displayName: 'Block Legacy Auth',
    state,
    conditions: createBaseConditions({
      clientAppTypes: ['exchangeActiveSync', 'other'],
    }),
    grantControls: { operator: 'OR', builtInControls: ['block'] },
  });

// ── describeSandboxChanges ──

describe('describeSandboxChanges', () => {
  it('lists state deviations in live policy order', () => {
    const policies = [mfaForAll('enabled'), blockLegacyAuth('enabled')];
    const changes = describeSandboxChanges(policies, {
      'block-legacy': 'disabled',
      'mfa-all': 'enabledForReportingButNotEnforced',
    });

    expect(changes).toEqual([
      {
        policyId: 'mfa-all',
        policyName: 'Require MFA for All',
        stateChange: { from: 'enabled', to: 'enabledForReportingButNotEnforced' },
        fieldChanges: [],
      },
      {
        policyId: 'block-legacy',
        policyName: 'Block Legacy Auth',
        stateChange: { from: 'enabled', to: 'disabled' },
        fieldChanges: [],
      },
    ]);
  });

  it('skips overrides matching live state and unknown ids', () => {
    const policies = [mfaForAll('enabled')];
    const changes = describeSandboxChanges(policies, {
      'mfa-all': 'enabled',
      ghost: 'disabled',
    });

    expect(changes).toEqual([]);
  });

  it('describes assignment field changes with added and removed display names', () => {
    const userId = 'aaaaaaaa-1111-2222-3333-444444444444';
    const policy = createPolicy({
      id: 'p1',
      displayName: 'Scoped Policy',
      conditions: createBaseConditions({
        users: {
          includeUsers: ['All'],
          excludeUsers: [userId],
          includeGroups: [],
          excludeGroups: [],
          includeRoles: [],
          excludeRoles: [],
        },
      }),
    });
    const displayNames = new Map([[userId, 'Sam Chen']]);
    const changes = describeSandboxChanges(
      [policy],
      {},
      { p1: { excludeUsers: [], includeApplications: ['All', 'Office365'] } },
      displayNames,
    );

    expect(changes).toHaveLength(1);
    expect(changes[0].stateChange).toBeUndefined();
    expect(changes[0].fieldChanges).toEqual(
      expect.arrayContaining([
        {
          field: 'excludeUsers',
          fieldLabel: 'Excluded users',
          added: [],
          removed: ['Sam Chen'],
        },
        {
          field: 'includeApplications',
          fieldLabel: 'Included applications',
          added: ['Office 365'],
          removed: [],
        },
      ]),
    );
  });

  it('combines state and assignment changes for the same policy', () => {
    const policy = mfaForAll('enabled');
    const changes = describeSandboxChanges(
      [policy],
      { 'mfa-all': 'disabled' },
      { 'mfa-all': { excludeGroups: ['g1'] } },
    );

    expect(changes).toHaveLength(1);
    expect(changes[0].stateChange).toEqual({ from: 'enabled', to: 'disabled' });
    expect(changes[0].fieldChanges).toHaveLength(1);
    expect(changes[0].fieldChanges[0].added).toEqual(['g1']); // no display name → raw id
  });

  it('skips field overrides equal to the live value', () => {
    const policy = mfaForAll('enabled');
    const changes = describeSandboxChanges([policy], {}, { 'mfa-all': { includeUsers: ['All'] } });

    expect(changes).toEqual([]);
  });
});

// ── compareSweeps ──

describe('compareSweeps', () => {
  it('reports no differences for identical sets', () => {
    const policies = [mfaForAll(), blockLegacyAuth()];
    const diff = compareSweeps(policies, policies);

    expect(diff.totalScenarios).toBe(TOTAL_SCENARIOS);
    expect(diff.affectedScenarios).toBe(0);
    expect(diff.newlyBlocked).toBe(0);
    expect(diff.newlyAllowed).toBe(0);
    expect(diff.strengthened).toBe(0);
    expect(diff.weakened).toBe(0);
    expect(diff.postureAfter).toBe(diff.postureBefore);
    expect(diff.affectedUserTypes.affected).toEqual([]);
    expect(diff.affectedUserTypes.notAffected).toHaveLength(3);
  });

  it('promoting a report-only MFA policy strengthens posture for all user types', () => {
    const live = [mfaForAll('enabledForReportingButNotEnforced')];
    const sandbox = applySandboxOverrides(live, { 'mfa-all': 'enabled' });
    const diff = compareSweeps(live, sandbox);

    expect(diff.strengthened).toBeGreaterThan(0);
    expect(diff.newlyBlocked).toBe(0);
    expect(diff.newlyAllowed).toBe(0);
    expect(diff.weakened).toBe(0);
    expect(diff.postureAfter).toBeGreaterThan(diff.postureBefore);
    expect(diff.affectedUserTypes.affected).toHaveLength(3);
    expect(diff.affectedUserTypes.notAffected).toEqual([]);
  });

  it('disabling a legacy-auth block opens exactly the legacy scenarios', () => {
    const live = [blockLegacyAuth('enabled')];
    const sandbox = applySandboxOverrides(live, { 'block-legacy': 'disabled' });
    const diff = compareSweeps(live, sandbox);

    expect(diff.newlyAllowed).toBe(LEGACY_SCENARIOS);
    expect(diff.affectedScenarios).toBe(LEGACY_SCENARIOS);
    expect(diff.newlyBlocked).toBe(0);
    expect(diff.postureAfter).toBeLessThan(diff.postureBefore);
  });

  it('enabling a report-only block-all policy blocks every scenario', () => {
    const blockAll = createPolicy({
      id: 'block-all',
      displayName: 'Block Everything',
      state: 'enabledForReportingButNotEnforced',
      grantControls: { operator: 'OR', builtInControls: ['block'] },
    });
    const live = [blockAll];
    const sandbox = applySandboxOverrides(live, { 'block-all': 'enabled' });
    const diff = compareSweeps(live, sandbox);

    expect(diff.newlyBlocked).toBe(TOTAL_SCENARIOS);
    expect(diff.affectedScenarios).toBe(TOTAL_SCENARIOS);
    expect(diff.postureAfter).toBe(100);
  });

  it('disabling a non-matching policy affects nothing', () => {
    const guestOnly = createPolicy({
      id: 'never-matches',
      displayName: 'Empty Include',
      conditions: createBaseConditions({
        users: {
          includeUsers: ['11111111-1111-1111-1111-111111111111'],
          excludeUsers: [],
          includeGroups: [],
          excludeGroups: [],
          includeRoles: [],
          excludeRoles: [],
        },
      }),
      grantControls: { operator: 'OR', builtInControls: ['mfa'] },
    });
    const live = [mfaForAll(), guestOnly];
    const sandbox = applySandboxOverrides(live, { 'never-matches': 'disabled' });
    const diff = compareSweeps(live, sandbox);

    expect(diff.affectedScenarios).toBe(0);
    expect(diff.postureAfter).toBe(diff.postureBefore);
  });
});
