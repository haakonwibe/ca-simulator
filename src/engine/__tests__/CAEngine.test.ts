// CAEngine integration tests — full pipeline from policies + context to final decision.

import { describe, it, expect } from 'vitest';
import { CAEngine } from '../CAEngine';
import { createTestContext } from './fixtures/testScenarios';
import type { ConditionalAccessPolicy, PolicyConditions } from '../models/Policy';
import type { SimulationContext } from '../models/SimulationContext';

const engine = new CAEngine();

// ──────────────────────────────────────────────
// Full policy builder helpers
// ──────────────────────────────────────────────

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

const DEFAULT_CONTEXT = createTestContext();

describe('CAEngine', () => {
  // ──────────────────────────────────────────────
  // No policies
  // ──────────────────────────────────────────────
  describe('no policies', () => {
    it('finalDecision: allow, empty arrays', () => {
      const result = engine.evaluate([], DEFAULT_CONTEXT);

      expect(result.finalDecision).toBe('allow');
      expect(result.appliedPolicies).toHaveLength(0);
      expect(result.skippedPolicies).toHaveLength(0);
      expect(result.reportOnlyPolicies).toHaveLength(0);
      expect(result.requiredControls).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────
  // All disabled
  // ──────────────────────────────────────────────
  describe('all disabled policies', () => {
    it('finalDecision: allow, all in skippedPolicies', () => {
      const policies = [
        createPolicy({ id: 'd1', displayName: 'Disabled 1', state: 'disabled' }),
        createPolicy({ id: 'd2', displayName: 'Disabled 2', state: 'disabled' }),
      ];
      const result = engine.evaluate(policies, DEFAULT_CONTEXT);

      expect(result.finalDecision).toBe('allow');
      expect(result.skippedPolicies).toHaveLength(2);
      expect(result.appliedPolicies).toHaveLength(0);
    });
  });

  // ──────────────────────────────────────────────
  // One enabled policy — MFA satisfied
  // ──────────────────────────────────────────────
  describe('single enabled policy, MFA satisfied', () => {
    it('finalDecision: allow', () => {
      const ctx = createTestContext({ satisfiedControls: ['mfa'] });
      const policies = [
        createPolicy({
          id: 'mfa-policy',
          displayName: 'Require MFA',
          grantControls: { operator: 'AND', builtInControls: ['mfa'] },
        }),
      ];

      const result = engine.evaluate(policies, ctx);

      expect(result.finalDecision).toBe('allow');
      expect(result.appliedPolicies).toHaveLength(1);
      expect(result.appliedPolicies[0].policyId).toBe('mfa-policy');
    });
  });

  // ──────────────────────────────────────────────
  // One enabled policy — MFA missing
  // ──────────────────────────────────────────────
  describe('single enabled policy, MFA missing', () => {
    it('finalDecision: controlsRequired', () => {
      const policies = [
        createPolicy({
          id: 'mfa-policy',
          displayName: 'Require MFA',
          grantControls: { operator: 'AND', builtInControls: ['mfa'] },
        }),
      ];

      const result = engine.evaluate(policies, DEFAULT_CONTEXT);

      expect(result.finalDecision).toBe('controlsRequired');
      expect(result.requiredControls).toContain('mfa');
    });
  });

  // ──────────────────────────────────────────────
  // Block policy
  // ──────────────────────────────────────────────
  describe('block policy', () => {
    it('finalDecision: block regardless of other policies', () => {
      const ctx = createTestContext({ satisfiedControls: ['mfa', 'compliantDevice'] });
      const policies = [
        createPolicy({
          id: 'allow-policy',
          displayName: 'Allow with MFA',
          grantControls: { operator: 'AND', builtInControls: ['mfa'] },
        }),
        createPolicy({
          id: 'block-policy',
          displayName: 'Block Access',
          grantControls: { operator: 'AND', builtInControls: ['block'] },
        }),
      ];

      const result = engine.evaluate(policies, ctx);

      expect(result.finalDecision).toBe('block');
    });
  });

  // ──────────────────────────────────────────────
  // Report-only policy
  // ──────────────────────────────────────────────
  describe('report-only policy', () => {
    it('report-only that would block → finalDecision: allow, appears in reportOnlyPolicies', () => {
      const policies = [
        createPolicy({
          id: 'report-block',
          displayName: 'Report-Only Block',
          state: 'enabledForReportingButNotEnforced',
          grantControls: { operator: 'AND', builtInControls: ['block'] },
        }),
      ];

      const result = engine.evaluate(policies, DEFAULT_CONTEXT);

      // Report-only does NOT enforce
      expect(result.finalDecision).toBe('allow');
      expect(result.reportOnlyPolicies).toHaveLength(1);
      expect(result.reportOnlyPolicies[0].policyId).toBe('report-block');
      expect(result.appliedPolicies).toHaveLength(0);
    });

    it('report-only with MFA requirement → allow, does not require MFA', () => {
      const policies = [
        createPolicy({
          id: 'report-mfa',
          displayName: 'Report-Only MFA',
          state: 'enabledForReportingButNotEnforced',
          grantControls: { operator: 'AND', builtInControls: ['mfa'] },
        }),
      ];

      const result = engine.evaluate(policies, DEFAULT_CONTEXT);

      expect(result.finalDecision).toBe('allow');
      expect(result.requiredControls).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────
  // Mix of enabled and report-only
  // ──────────────────────────────────────────────
  describe('mix of enabled and report-only', () => {
    it('only enabled policies affect the decision', () => {
      const policies = [
        createPolicy({
          id: 'enabled-mfa',
          displayName: 'Enabled MFA',
          state: 'enabled',
          grantControls: { operator: 'AND', builtInControls: ['mfa'] },
        }),
        createPolicy({
          id: 'report-block',
          displayName: 'Report-Only Block',
          state: 'enabledForReportingButNotEnforced',
          grantControls: { operator: 'AND', builtInControls: ['block'] },
        }),
      ];

      const result = engine.evaluate(policies, DEFAULT_CONTEXT);

      // The block is report-only, so it doesn't enforce
      expect(result.finalDecision).toBe('controlsRequired');
      expect(result.requiredControls).toContain('mfa');
      expect(result.appliedPolicies).toHaveLength(1);
      expect(result.reportOnlyPolicies).toHaveLength(1);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  //  ⚠️  THE CLASSIC TRAP — END-TO-END (full policy objects)
  // ══════════════════════════════════════════════════════════════════
  describe('THE CLASSIC TRAP — end-to-end', () => {
    it('OR(mfa, compliant) + AND(mfa), user has only compliant → controlsRequired: [mfa]', () => {
      const ctx = createTestContext({ satisfiedControls: ['compliantDevice'] });

      const policyA = createPolicy({
        id: 'policy-a',
        displayName: 'MFA or Compliant Device',
        grantControls: {
          operator: 'OR',
          builtInControls: ['mfa', 'compliantDevice'],
        },
      });

      const policyB = createPolicy({
        id: 'policy-b',
        displayName: 'Require MFA',
        grantControls: {
          operator: 'AND',
          builtInControls: ['mfa'],
        },
      });

      const result = engine.evaluate([policyA, policyB], ctx);

      // Policy A: OR(mfa, compliantDevice) → compliantDevice present → SATISFIED
      // Policy B: AND(mfa) → mfa missing → NOT SATISFIED
      // Cross-policy: A ✅ AND B ❌ → controlsRequired
      expect(result.finalDecision).toBe('controlsRequired');
      expect(result.requiredControls).toContain('mfa');
      expect(result.appliedPolicies).toHaveLength(2);
    });
  });

  // ──────────────────────────────────────────────
  // Deterministic output
  // ──────────────────────────────────────────────
  describe('deterministic output', () => {
    it('identical inputs produce identical outputs (excluding timestamps)', () => {
      const ctx = createTestContext({ satisfiedControls: ['mfa'] });
      const policies = [
        createPolicy({
          id: 'det-1',
          displayName: 'Deterministic Test',
          grantControls: { operator: 'AND', builtInControls: ['mfa'] },
        }),
      ];

      const result1 = engine.evaluate(policies, ctx);
      const result2 = engine.evaluate(policies, ctx);

      // Compare everything except timestamps
      expect(result1.finalDecision).toBe(result2.finalDecision);
      expect(result1.requiredControls).toEqual(result2.requiredControls);
      expect(result1.satisfiedControls).toEqual(result2.satisfiedControls);
      expect(result1.appliedPolicies.length).toBe(result2.appliedPolicies.length);
      expect(result1.skippedPolicies.length).toBe(result2.skippedPolicies.length);
      expect(result1.reportOnlyPolicies.length).toBe(result2.reportOnlyPolicies.length);
      expect(result1.trace.length).toBe(result2.trace.length);

      // Verify same phases in same order
      const phases1 = result1.trace.map((t) => t.phase);
      const phases2 = result2.trace.map((t) => t.phase);
      expect(phases1).toEqual(phases2);
    });
  });

  // ──────────────────────────────────────────────
  // Trace completeness
  // ──────────────────────────────────────────────
  describe('trace completeness', () => {
    it('contains entries for all four phases', () => {
      const ctx = createTestContext({ satisfiedControls: ['mfa'] });
      const policies = [
        createPolicy({
          id: 'trace-test',
          displayName: 'Trace Test',
          grantControls: { operator: 'AND', builtInControls: ['mfa'] },
          sessionControls: {
            signInFrequency: { isEnabled: true, value: 4, type: 'hours' as const, frequencyInterval: 'timeBased' },
          },
        }),
      ];

      const result = engine.evaluate(policies, ctx);
      const phases = new Set(result.trace.map((t) => t.phase));

      expect(phases.has('signalCollection')).toBe(true);
      expect(phases.has('policyMatching')).toBe(true);
      expect(phases.has('grantResolution')).toBe(true);
      expect(phases.has('sessionAggregation')).toBe(true);
    });

    it('signal collection is the first trace entry', () => {
      const result = engine.evaluate([], DEFAULT_CONTEXT);

      expect(result.trace.length).toBeGreaterThan(0);
      expect(result.trace[0].phase).toBe('signalCollection');
      expect(result.trace[0].message).toContain('context collected');
    });

    it('trace entries are in chronological order (non-decreasing timestamps)', () => {
      const policies = [
        createPolicy({
          id: 'p1',
          grantControls: { operator: 'AND', builtInControls: ['mfa'] },
        }),
      ];

      const result = engine.evaluate(policies, DEFAULT_CONTEXT);

      for (let i = 1; i < result.trace.length; i++) {
        expect(result.trace[i].timestamp).toBeGreaterThanOrEqual(result.trace[i - 1].timestamp);
      }
    });
  });

  // ──────────────────────────────────────────────
  // Authentication flows condition
  // ──────────────────────────────────────────────
  describe('authentication flows', () => {
    const deviceCodeBlockPolicy = createPolicy({
      id: 'block-device-code',
      displayName: 'Block Device Code Flow',
      conditions: createBaseConditions({
        authenticationFlows: { transferMethods: ['deviceCodeFlow'] },
      }),
      grantControls: { operator: 'OR', builtInControls: ['block'] },
    });

    it('blocks when context uses device code flow', () => {
      const ctx = createTestContext({ authenticationFlow: 'deviceCodeFlow' });
      const result = engine.evaluate([deviceCodeBlockPolicy], ctx);

      expect(result.finalDecision).toBe('block');
      expect(result.appliedPolicies).toHaveLength(1);
    });

    it('allows when context uses normal sign-in (policy does not apply)', () => {
      const ctx = createTestContext(); // no authenticationFlow = normal
      const result = engine.evaluate([deviceCodeBlockPolicy], ctx);

      expect(result.finalDecision).toBe('allow');
      expect(result.skippedPolicies).toHaveLength(1);
      expect(result.appliedPolicies).toHaveLength(0);
    });

    it('skips policy for excluded break-glass user even with device code flow', () => {
      const ctx = createTestContext({
        authenticationFlow: 'deviceCodeFlow',
        user: {
          id: 'break-glass',
          displayName: 'Break Glass',
          userType: 'member',
          memberOfGroupIds: ['group-breakglass'],
          directoryRoleIds: [],
        },
      });

      const policy = createPolicy({
        id: 'block-device-code-exclude-bg',
        displayName: 'Block Device Code (exclude break-glass)',
        conditions: createBaseConditions({
          users: {
            includeUsers: ['All'],
            excludeUsers: [],
            includeGroups: [],
            excludeGroups: ['group-breakglass'],
            includeRoles: [],
            excludeRoles: [],
          },
          authenticationFlows: { transferMethods: ['deviceCodeFlow'] },
        }),
        grantControls: { operator: 'OR', builtInControls: ['block'] },
      });

      const result = engine.evaluate([policy], ctx);

      expect(result.finalDecision).toBe('allow');
      expect(result.skippedPolicies).toHaveLength(1);
    });
  });

  // ──────────────────────────────────────────────
  // Policy that doesn't match
  // ──────────────────────────────────────────────
  describe('non-matching policy', () => {
    it('goes to skippedPolicies, not appliedPolicies', () => {
      const ctx = createTestContext({
        user: {
          id: 'user-001',
          displayName: 'Test User',
          userType: 'member',
          memberOfGroupIds: [],
          directoryRoleIds: [],
        },
      });
      const policies = [
        createPolicy({
          id: 'non-match',
          displayName: 'Only for other user',
          conditions: createBaseConditions({
            users: {
              includeUsers: ['other-user'],
              excludeUsers: [],
              includeGroups: [],
              excludeGroups: [],
              includeRoles: [],
              excludeRoles: [],
            },
          }),
          grantControls: { operator: 'AND', builtInControls: ['block'] },
        }),
      ];

      const result = engine.evaluate(policies, ctx);

      expect(result.finalDecision).toBe('allow');
      expect(result.skippedPolicies).toHaveLength(1);
      expect(result.appliedPolicies).toHaveLength(0);
    });
  });
});
