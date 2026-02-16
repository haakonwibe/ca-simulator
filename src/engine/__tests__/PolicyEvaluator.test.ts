// PolicyEvaluator tests

import { describe, it, expect } from 'vitest';
import { PolicyEvaluator } from '../PolicyEvaluator';
import { createTestContext, STANDARD_USER_CONTEXT } from './fixtures/testScenarios';
import type { ConditionalAccessPolicy, PolicyConditions, GrantControls } from '../models/Policy';
import type { SimulationContext } from '../models/SimulationContext';

const evaluator = new PolicyEvaluator();

// ──────────────────────────────────────────────
// Policy builder helpers
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
    id: 'policy-001',
    displayName: 'Test Policy',
    state: 'enabled',
    conditions: createBaseConditions(),
    grantControls: null,
    sessionControls: null,
    ...overrides,
  };
}

describe('PolicyEvaluator', () => {
  // ──────────────────────────────────────────────
  // Disabled policy — skip early
  // ──────────────────────────────────────────────
  describe('disabled policy', () => {
    it('returns applies: false with no condition evaluation', () => {
      const policy = createPolicy({ state: 'disabled' });
      const result = evaluator.evaluate(policy, STANDARD_USER_CONTEXT);

      expect(result.applies).toBe(false);
      expect(result.state).toBe('disabled');
      expect(result.conditionResults).toHaveLength(0);
      expect(result.grantControls).toBeUndefined();
    });
  });

  // ──────────────────────────────────────────────
  // All conditions match
  // ──────────────────────────────────────────────
  describe('all conditions match', () => {
    it('returns applies: true when all conditions pass', () => {
      const policy = createPolicy();
      const result = evaluator.evaluate(policy, STANDARD_USER_CONTEXT);

      expect(result.applies).toBe(true);
      expect(result.policyId).toBe('policy-001');
      expect(result.policyName).toBe('Test Policy');
      // Should have results for: users, applications, clientAppTypes, risk
      expect(result.conditionResults.length).toBeGreaterThanOrEqual(4);
      expect(result.conditionResults.every((r) => r.matches)).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // Single condition fails
  // ──────────────────────────────────────────────
  describe('one condition fails', () => {
    it('returns applies: false when user condition fails', () => {
      const policy = createPolicy({
        conditions: createBaseConditions({
          users: {
            includeUsers: ['some-other-user'],
            excludeUsers: [],
            includeGroups: [],
            excludeGroups: [],
            includeRoles: [],
            excludeRoles: [],
          },
        }),
      });
      const result = evaluator.evaluate(policy, STANDARD_USER_CONTEXT);

      expect(result.applies).toBe(false);
      const failedCondition = result.conditionResults.find((r) => !r.matches);
      expect(failedCondition?.conditionType).toBe('users');
    });

    it('returns applies: false when application condition fails', () => {
      const policy = createPolicy({
        conditions: createBaseConditions({
          applications: {
            includeApplications: ['some-other-app'],
            excludeApplications: [],
          },
        }),
      });
      const result = evaluator.evaluate(policy, STANDARD_USER_CONTEXT);

      expect(result.applies).toBe(false);
      const failedCondition = result.conditionResults.find((r) => !r.matches);
      expect(failedCondition?.conditionType).toBe('applications');
    });

    it('returns applies: false when platform condition fails', () => {
      const ctx = createTestContext({ device: { platform: 'android' } });
      const policy = createPolicy({
        conditions: createBaseConditions({
          platforms: { includePlatforms: ['windows'] },
        }),
      });
      const result = evaluator.evaluate(policy, ctx);

      expect(result.applies).toBe(false);
      const failedCondition = result.conditionResults.find((r) => !r.matches);
      expect(failedCondition?.conditionType).toBe('platforms');
    });

    it('returns applies: false when location condition fails', () => {
      const ctx = createTestContext({
        location: { namedLocationId: 'loc-untrusted', isTrustedLocation: false },
      });
      const policy = createPolicy({
        conditions: createBaseConditions({
          locations: { includeLocations: ['AllTrusted'], excludeLocations: [] },
        }),
      });
      const result = evaluator.evaluate(policy, ctx);

      expect(result.applies).toBe(false);
    });

    it('returns applies: false when client app type fails', () => {
      const ctx = createTestContext({ clientAppType: 'exchangeActiveSync' });
      const policy = createPolicy({
        conditions: createBaseConditions({
          clientAppTypes: ['browser', 'mobileAppsAndDesktopClients'],
        }),
      });
      const result = evaluator.evaluate(policy, ctx);

      expect(result.applies).toBe(false);
    });

    it('returns applies: false when risk level fails', () => {
      const ctx = createTestContext({
        risk: { signInRiskLevel: 'low', userRiskLevel: 'none', insiderRiskLevel: 'none' },
      });
      const policy = createPolicy({
        conditions: createBaseConditions({
          signInRiskLevels: ['high'],
        }),
      });
      const result = evaluator.evaluate(policy, ctx);

      expect(result.applies).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // Short-circuit behavior
  // ──────────────────────────────────────────────
  describe('short-circuit on first failure', () => {
    it('stops after user condition fails — no platform/location/etc. results', () => {
      const policy = createPolicy({
        conditions: createBaseConditions({
          users: {
            includeUsers: ['nonexistent-user'],
            excludeUsers: [],
            includeGroups: [],
            excludeGroups: [],
            includeRoles: [],
            excludeRoles: [],
          },
          platforms: { includePlatforms: ['windows'] },
          locations: { includeLocations: ['All'], excludeLocations: [] },
        }),
      });
      const result = evaluator.evaluate(policy, STANDARD_USER_CONTEXT);

      expect(result.applies).toBe(false);
      // Should only have the users result (failed)
      expect(result.conditionResults).toHaveLength(1);
      expect(result.conditionResults[0].conditionType).toBe('users');
      expect(result.conditionResults[0].matches).toBe(false);
    });

    it('stops after application condition fails — no further conditions evaluated', () => {
      const policy = createPolicy({
        conditions: createBaseConditions({
          applications: {
            includeApplications: ['nonexistent-app'],
            excludeApplications: [],
          },
          platforms: { includePlatforms: ['all'] },
          locations: { includeLocations: ['All'], excludeLocations: [] },
          clientAppTypes: ['browser'],
        }),
      });
      const result = evaluator.evaluate(policy, STANDARD_USER_CONTEXT);

      expect(result.applies).toBe(false);
      // Should have users (pass) + applications (fail) = 2
      expect(result.conditionResults).toHaveLength(2);
      expect(result.conditionResults[0].conditionType).toBe('users');
      expect(result.conditionResults[0].matches).toBe(true);
      expect(result.conditionResults[1].conditionType).toBe('applications');
      expect(result.conditionResults[1].matches).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // Report-only policy — full evaluation
  // ──────────────────────────────────────────────
  describe('report-only policy', () => {
    it('goes through full evaluation same as enabled', () => {
      const policy = createPolicy({
        state: 'enabledForReportingButNotEnforced',
        grantControls: {
          operator: 'AND',
          builtInControls: ['mfa'],
        },
      });
      const result = evaluator.evaluate(policy, STANDARD_USER_CONTEXT);

      expect(result.applies).toBe(true);
      expect(result.state).toBe('enabledForReportingButNotEnforced');
      expect(result.grantControls).toBeDefined();
      expect(result.conditionResults.length).toBeGreaterThan(0);
    });
  });

  // ──────────────────────────────────────────────
  // Grant controls — AND operator
  // ──────────────────────────────────────────────
  describe('grant controls — AND operator', () => {
    it('satisfied: true when all controls are satisfied', () => {
      const ctx = createTestContext({
        satisfiedControls: ['mfa', 'compliantDevice'],
      });
      const policy = createPolicy({
        grantControls: {
          operator: 'AND',
          builtInControls: ['mfa', 'compliantDevice'],
        },
      });
      const result = evaluator.evaluate(policy, ctx);

      expect(result.applies).toBe(true);
      expect(result.grantControls?.satisfied).toBe(true);
      expect(result.grantControls?.satisfiedControls).toEqual(['mfa', 'compliantDevice']);
      expect(result.grantControls?.unsatisfiedControls).toEqual([]);
    });

    it('satisfied: false when one control is missing', () => {
      const ctx = createTestContext({
        satisfiedControls: ['mfa'],
      });
      const policy = createPolicy({
        grantControls: {
          operator: 'AND',
          builtInControls: ['mfa', 'compliantDevice'],
        },
      });
      const result = evaluator.evaluate(policy, ctx);

      expect(result.applies).toBe(true);
      expect(result.grantControls?.satisfied).toBe(false);
      expect(result.grantControls?.operator).toBe('AND');
      expect(result.grantControls?.satisfiedControls).toEqual(['mfa']);
      expect(result.grantControls?.unsatisfiedControls).toEqual(['compliantDevice']);
    });

    it('satisfied: false when no controls are satisfied', () => {
      const policy = createPolicy({
        grantControls: {
          operator: 'AND',
          builtInControls: ['mfa', 'compliantDevice'],
        },
      });
      const result = evaluator.evaluate(policy, STANDARD_USER_CONTEXT);

      expect(result.grantControls?.satisfied).toBe(false);
      expect(result.grantControls?.unsatisfiedControls).toEqual(['mfa', 'compliantDevice']);
    });
  });

  // ──────────────────────────────────────────────
  // Grant controls — OR operator
  // ──────────────────────────────────────────────
  describe('grant controls — OR operator', () => {
    it('satisfied: true when one control is satisfied', () => {
      const ctx = createTestContext({
        satisfiedControls: ['compliantDevice'],
      });
      const policy = createPolicy({
        grantControls: {
          operator: 'OR',
          builtInControls: ['mfa', 'compliantDevice'],
        },
      });
      const result = evaluator.evaluate(policy, ctx);

      expect(result.applies).toBe(true);
      expect(result.grantControls?.satisfied).toBe(true);
      expect(result.grantControls?.operator).toBe('OR');
      expect(result.grantControls?.satisfiedControls).toEqual(['compliantDevice']);
    });

    it('satisfied: false when no controls are satisfied', () => {
      const policy = createPolicy({
        grantControls: {
          operator: 'OR',
          builtInControls: ['mfa', 'compliantDevice'],
        },
      });
      const result = evaluator.evaluate(policy, STANDARD_USER_CONTEXT);

      expect(result.grantControls?.satisfied).toBe(false);
      expect(result.grantControls?.satisfiedControls).toEqual([]);
    });

    it('satisfied: true when all controls are satisfied', () => {
      const ctx = createTestContext({
        satisfiedControls: ['mfa', 'compliantDevice'],
      });
      const policy = createPolicy({
        grantControls: {
          operator: 'OR',
          builtInControls: ['mfa', 'compliantDevice'],
        },
      });
      const result = evaluator.evaluate(policy, ctx);

      expect(result.grantControls?.satisfied).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // grantControls: null — session-only policy
  // ──────────────────────────────────────────────
  describe('null grant controls', () => {
    it('applies with no controls required', () => {
      const policy = createPolicy({
        grantControls: null,
        sessionControls: {
          signInFrequency: { isEnabled: true, value: 1, type: 'hours', frequencyInterval: 'timeBased' },
        },
      });
      const result = evaluator.evaluate(policy, STANDARD_USER_CONTEXT);

      expect(result.applies).toBe(true);
      expect(result.grantControls).toBeUndefined();
      expect(result.sessionControls).toBeDefined();
    });
  });

  // ──────────────────────────────────────────────
  // Unconfigured optional conditions
  // ──────────────────────────────────────────────
  describe('unconfigured optional conditions match by default', () => {
    it('no platforms, no locations, no devices → all match', () => {
      const policy = createPolicy({
        conditions: createBaseConditions({
          // platforms: undefined (not set)
          // locations: undefined (not set)
          // devices: undefined (not set)
        }),
        grantControls: {
          operator: 'AND',
          builtInControls: ['mfa'],
        },
      });
      const result = evaluator.evaluate(policy, STANDARD_USER_CONTEXT);

      expect(result.applies).toBe(true);
      // conditionResults should NOT contain platform/location/device entries
      const conditionTypes = result.conditionResults.map((r) => r.conditionType);
      expect(conditionTypes).not.toContain('platforms');
      expect(conditionTypes).not.toContain('locations');
      expect(conditionTypes).not.toContain('devices');
    });

    it('empty clientAppTypes matches all (Hard-Won Lesson #7)', () => {
      const policy = createPolicy({
        conditions: createBaseConditions({
          clientAppTypes: [],
        }),
      });
      const result = evaluator.evaluate(policy, STANDARD_USER_CONTEXT);

      expect(result.applies).toBe(true);
      const clientAppResult = result.conditionResults.find((r) => r.conditionType === 'clientAppTypes');
      expect(clientAppResult?.matches).toBe(true);
      expect(clientAppResult?.phase).toBe('notConfigured');
    });

    it('empty risk levels match all', () => {
      const policy = createPolicy({
        conditions: createBaseConditions({
          signInRiskLevels: [],
          userRiskLevels: [],
        }),
      });
      const result = evaluator.evaluate(policy, STANDARD_USER_CONTEXT);

      expect(result.applies).toBe(true);
      const riskResult = result.conditionResults.find((r) => r.conditionType === 'risk');
      expect(riskResult?.matches).toBe(true);
      expect(riskResult?.phase).toBe('notConfigured');
    });
  });

  // ──────────────────────────────────────────────
  // Session controls extraction
  // ──────────────────────────────────────────────
  describe('session controls', () => {
    it('extracts enabled session controls', () => {
      const policy = createPolicy({
        sessionControls: {
          signInFrequency: { isEnabled: true, value: 4, type: 'hours', frequencyInterval: 'timeBased' },
          persistentBrowser: { isEnabled: true, mode: 'never' },
        },
      });
      const result = evaluator.evaluate(policy, STANDARD_USER_CONTEXT);

      expect(result.sessionControls).toEqual({
        signInFrequency: { value: 4, type: 'hours' },
        persistentBrowser: 'never',
      });
    });

    it('omits disabled session controls', () => {
      const policy = createPolicy({
        sessionControls: {
          signInFrequency: { isEnabled: false, value: 4, type: 'hours', frequencyInterval: 'timeBased' },
          persistentBrowser: { isEnabled: true, mode: 'always' },
        },
      });
      const result = evaluator.evaluate(policy, STANDARD_USER_CONTEXT);

      expect(result.sessionControls?.signInFrequency).toBeUndefined();
      expect(result.sessionControls?.persistentBrowser).toBe('always');
    });

    it('no session controls when sessionControls is null', () => {
      const policy = createPolicy({ sessionControls: null });
      const result = evaluator.evaluate(policy, STANDARD_USER_CONTEXT);

      expect(result.sessionControls).toBeUndefined();
    });

    it('extracts secureSignInSession when enabled', () => {
      const policy = createPolicy({
        sessionControls: {
          secureSignInSession: { isEnabled: true },
        },
      });
      const result = evaluator.evaluate(policy, STANDARD_USER_CONTEXT);

      expect(result.sessionControls?.secureSignInSession).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // Grant controls with authentication strength
  // ──────────────────────────────────────────────
  describe('authentication strength', () => {
    const PHISHING_RESISTANT_ID = '00000000-0000-0000-0000-000000000004';
    const MFA_ID = '00000000-0000-0000-0000-000000000002';

    it('returns structured authenticationStrength with displayName', () => {
      const policy = createPolicy({
        grantControls: {
          operator: 'AND',
          builtInControls: [],
          authenticationStrength: { id: 'str-001', displayName: 'Phishing-resistant MFA' },
        },
      });
      const result = evaluator.evaluate(policy, STANDARD_USER_CONTEXT);

      expect(result.grantControls?.authenticationStrength).toEqual({
        displayName: 'Phishing-resistant MFA',
        policyStrengthId: 'str-001',
        satisfied: false,
      });
    });

    it('falls back to id when displayName is missing', () => {
      const policy = createPolicy({
        grantControls: {
          operator: 'AND',
          builtInControls: [],
          authenticationStrength: { id: 'str-001' },
        },
      });
      const result = evaluator.evaluate(policy, STANDARD_USER_CONTEXT);

      expect(result.grantControls?.authenticationStrength?.displayName).toBe('str-001');
    });

    it('satisfied when user level meets requirement', () => {
      const policy = createPolicy({
        grantControls: {
          operator: 'OR',
          builtInControls: [],
          authenticationStrength: { id: PHISHING_RESISTANT_ID, displayName: 'Phishing-resistant MFA' },
        },
      });
      const ctx = createTestContext({ authenticationStrengthLevel: 3 });
      const result = evaluator.evaluate(policy, ctx);

      expect(result.grantControls?.authenticationStrength?.satisfied).toBe(true);
      expect(result.grantControls?.satisfied).toBe(true);
    });

    it('unsatisfied when user level is below requirement', () => {
      const policy = createPolicy({
        grantControls: {
          operator: 'OR',
          builtInControls: [],
          authenticationStrength: { id: PHISHING_RESISTANT_ID, displayName: 'Phishing-resistant MFA' },
        },
      });
      const ctx = createTestContext({ authenticationStrengthLevel: 1 });
      const result = evaluator.evaluate(policy, ctx);

      expect(result.grantControls?.authenticationStrength?.satisfied).toBe(false);
      expect(result.grantControls?.satisfied).toBe(false);
    });

    it('AND policy: mfa + authStrength both satisfied', () => {
      const policy = createPolicy({
        grantControls: {
          operator: 'AND',
          builtInControls: ['mfa'],
          authenticationStrength: { id: MFA_ID, displayName: 'Multifactor authentication' },
        },
      });
      const ctx = createTestContext({
        authenticationStrengthLevel: 1,
        satisfiedControls: ['mfa'],
      });
      const result = evaluator.evaluate(policy, ctx);

      expect(result.grantControls?.satisfied).toBe(true);
    });

    it('OR policy: authStrength satisfied overrides unsatisfied builtIn', () => {
      const policy = createPolicy({
        grantControls: {
          operator: 'OR',
          builtInControls: ['mfa'],
          authenticationStrength: { id: MFA_ID, displayName: 'Multifactor authentication' },
        },
      });
      const ctx = createTestContext({
        authenticationStrengthLevel: 1,
        satisfiedControls: [],
      });
      const result = evaluator.evaluate(policy, ctx);

      expect(result.grantControls?.satisfied).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // Device filter integration
  // ──────────────────────────────────────────────
  describe('device filter condition', () => {
    it('applies: false when device filter exclude rule matches', () => {
      const ctx = createTestContext({
        device: { properties: { model: 'Surface Pro' } },
      });
      const policy = createPolicy({
        conditions: createBaseConditions({
          devices: { mode: 'exclude', rule: 'device.model -startsWith "Surface"' },
        }),
      });
      const result = evaluator.evaluate(policy, ctx);

      expect(result.applies).toBe(false);
      const deviceResult = result.conditionResults.find((r) => r.conditionType === 'devices');
      expect(deviceResult?.matches).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // Trace quality
  // ──────────────────────────────────────────────
  describe('trace quality', () => {
    it('every condition result has conditionType and reason', () => {
      const policy = createPolicy({
        conditions: createBaseConditions({
          platforms: { includePlatforms: ['all'] },
          locations: { includeLocations: ['All'], excludeLocations: [] },
        }),
      });
      const ctx = createTestContext({ device: { platform: 'windows' } });
      const result = evaluator.evaluate(policy, ctx);

      expect(result.applies).toBe(true);
      for (const cr of result.conditionResults) {
        expect(cr.conditionType).toBeTruthy();
        expect(cr.reason).toBeTruthy();
      }
    });
  });
});
