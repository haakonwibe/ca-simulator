// lib/__tests__/impactAnalysis.test.ts — Impact analysis engine tests.

import { describe, it, expect } from 'vitest';
import { CAEngine } from '@/engine/CAEngine';
import { analyzeImpact, analyzeImpactSweep, describeVerdict, computePostureScore, MAX_POSTURE_SCORE } from '../impactAnalysis';
import type { ImpactSeverity } from '../impactAnalysis';
import type { CAEngineResult, PolicyEvaluationResult } from '@/engine/models/EvaluationResult';
import type { ConditionalAccessPolicy, PolicyConditions } from '@/engine/models/Policy';
import type { SimulationContext, UserContext } from '@/engine/models/SimulationContext';

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

const standardUser: UserContext = {
  id: 'user-1',
  displayName: 'Standard Member',
  userType: 'member',
  memberOfGroupIds: [],
  directoryRoleIds: [],
};

const adminUser: UserContext = {
  id: 'admin-1',
  displayName: 'Admin User',
  userType: 'member',
  memberOfGroupIds: [],
  directoryRoleIds: ['62e90394-69f5-4237-9190-012177145e10'], // Global Admin
};

function createContext(overrides?: Partial<SimulationContext>): SimulationContext {
  return {
    user: standardUser,
    application: { appId: 'All', displayName: 'All Cloud Apps' },
    device: {},
    location: {},
    risk: { signInRiskLevel: 'none', userRiskLevel: 'none', insiderRiskLevel: 'none' },
    clientAppType: 'browser',
    satisfiedControls: [],
    ...overrides,
  };
}

// ── Tests ──

describe('analyzeImpact', () => {
  it('disabling the only MFA policy → critical severity, verdict changes to allow', () => {
    const policies = [
      createPolicy({
        id: 'mfa-only',
        displayName: 'Only MFA Policy',
        grantControls: { operator: 'OR', builtInControls: ['mfa'] },
      }),
    ];
    const context = createContext();

    const result = analyzeImpact(policies, context);

    const impact = result.policyImpacts.find((p) => p.policyId === 'mfa-only');
    expect(impact).toBeDefined();
    expect(impact!.severity).toBe('critical');
    expect(impact!.verdictChange).not.toBeNull();
    expect(impact!.verdictChange!.from).toBe('controlsRequired');
    expect(impact!.verdictChange!.to).toBe('allow');
  });

  it('disabling one of two MFA policies → low severity, fallback exists', () => {
    const policies = [
      createPolicy({
        id: 'mfa-1',
        displayName: 'MFA Policy 1',
        grantControls: { operator: 'OR', builtInControls: ['mfa'] },
      }),
      createPolicy({
        id: 'mfa-2',
        displayName: 'MFA Policy 2',
        grantControls: { operator: 'OR', builtInControls: ['mfa'] },
      }),
    ];
    const context = createContext();

    const result = analyzeImpact(policies, context);

    // Both should have low severity since the other provides fallback
    for (const impact of result.policyImpacts) {
      expect(impact.verdictChange).toBeNull();
      expect(impact.controlsLost).toHaveLength(0);
      expect(impact.severity).toBe('low');
    }
  });

  it('disabling a block policy → critical severity, block → allow/controlsRequired', () => {
    const policies = [
      createPolicy({
        id: 'block-policy',
        displayName: 'Block Policy',
        grantControls: { operator: 'OR', builtInControls: ['block'] },
      }),
    ];
    const context = createContext();

    const result = analyzeImpact(policies, context);

    const impact = result.policyImpacts.find((p) => p.policyId === 'block-policy');
    expect(impact).toBeDefined();
    expect(impact!.severity).toBe('critical');
    expect(impact!.verdictChange).not.toBeNull();
    expect(impact!.verdictChange!.from).toBe('block');
    expect(impact!.verdictChange!.to).toBe('allow');
    expect(impact!.gapsCreated.length).toBeGreaterThan(0);
    expect(impact!.gapsCreated[0].description).toContain('no longer blocked');
  });

  it('disabling a policy that does not apply → low/no impact', () => {
    // Policy targets admin roles, but user is a standard member
    const policies = [
      createPolicy({
        id: 'admin-only',
        displayName: 'Admin MFA',
        conditions: createBaseConditions({
          users: {
            includeUsers: [],
            excludeUsers: [],
            includeGroups: [],
            excludeGroups: [],
            includeRoles: ['62e90394-69f5-4237-9190-012177145e10'],
            excludeRoles: [],
          },
        }),
        grantControls: { operator: 'OR', builtInControls: ['mfa'] },
      }),
    ];
    const context = createContext(); // standard user, no admin role

    const result = analyzeImpact(policies, context);

    const impact = result.policyImpacts.find((p) => p.policyId === 'admin-only');
    expect(impact).toBeDefined();
    expect(impact!.severity).toBe('low');
    expect(impact!.verdictChange).toBeNull();
    expect(impact!.controlsLost).toHaveLength(0);
  });

  it('disabling a report-only policy → no enforcement change', () => {
    const policies = [
      createPolicy({
        id: 'report-only',
        displayName: 'Report-Only MFA',
        state: 'enabledForReportingButNotEnforced',
        grantControls: { operator: 'OR', builtInControls: ['mfa'] },
      }),
    ];
    const context = createContext();

    const result = analyzeImpact(policies, context);

    const impact = result.policyImpacts.find((p) => p.policyId === 'report-only');
    expect(impact).toBeDefined();
    expect(impact!.severity).toBe('low');
    // Baseline allows since report-only doesn't enforce
    expect(result.baselineResult.finalDecision).toBe('allow');
  });

  it('all policies disabled one at a time → no crashes, valid structure', () => {
    const policies = [
      createPolicy({
        id: 'p1',
        displayName: 'Policy A',
        grantControls: { operator: 'OR', builtInControls: ['mfa'] },
      }),
      createPolicy({
        id: 'p2',
        displayName: 'Policy B',
        grantControls: { operator: 'OR', builtInControls: ['compliantDevice'] },
      }),
      createPolicy({
        id: 'p3',
        displayName: 'Policy C',
        state: 'enabledForReportingButNotEnforced',
        grantControls: { operator: 'OR', builtInControls: ['mfa'] },
      }),
    ];
    const context = createContext();

    const result = analyzeImpact(policies, context);

    // Should have 3 impacts (all enabled policies)
    expect(result.policyImpacts).toHaveLength(3);

    for (const impact of result.policyImpacts) {
      expect(impact.policyId).toBeTruthy();
      expect(impact.policyName).toBeTruthy();
      expect(['critical', 'high', 'medium', 'low']).toContain(impact.severity);
      expect(Array.isArray(impact.controlsLost)).toBe(true);
      expect(Array.isArray(impact.controlsRetained)).toBe(true);
      expect(Array.isArray(impact.gapsCreated)).toBe(true);
      expect(Array.isArray(impact.stillProtectedBy)).toBe(true);
      expect(impact.withoutResult).toBeDefined();
    }
  });

  it('controlsLost and controlsRetained are correct complements', () => {
    const policies = [
      createPolicy({
        id: 'mfa-policy',
        displayName: 'MFA Policy',
        grantControls: { operator: 'OR', builtInControls: ['mfa'] },
      }),
      createPolicy({
        id: 'device-policy',
        displayName: 'Device Policy',
        grantControls: { operator: 'OR', builtInControls: ['compliantDevice'] },
      }),
    ];
    const context = createContext();

    const result = analyzeImpact(policies, context);

    // Disabling MFA policy: mfa is lost, compliantDevice retained
    const mfaImpact = result.policyImpacts.find((p) => p.policyId === 'mfa-policy');
    expect(mfaImpact).toBeDefined();
    expect(mfaImpact!.controlsLost).toContain('mfa');
    expect(mfaImpact!.controlsRetained).toContain('compliantDevice');

    // Disabling device policy: compliantDevice is lost, mfa retained
    const deviceImpact = result.policyImpacts.find((p) => p.policyId === 'device-policy');
    expect(deviceImpact).toBeDefined();
    expect(deviceImpact!.controlsLost).toContain('compliantDevice');
    expect(deviceImpact!.controlsRetained).toContain('mfa');
  });

  it('stillProtectedBy lists correct fallback policies with their controls', () => {
    const policies = [
      createPolicy({
        id: 'mfa-and-device',
        displayName: 'MFA + Device Policy',
        grantControls: { operator: 'AND', builtInControls: ['mfa', 'compliantDevice'] },
      }),
      createPolicy({
        id: 'mfa-only',
        displayName: 'MFA Only Policy',
        grantControls: { operator: 'OR', builtInControls: ['mfa'] },
      }),
    ];
    const context = createContext();

    const result = analyzeImpact(policies, context);

    // Disabling MFA + Device: MFA is still required by MFA Only, but compliantDevice is lost
    const impact = result.policyImpacts.find((p) => p.policyId === 'mfa-and-device');
    expect(impact).toBeDefined();
    expect(impact!.controlsLost).toContain('compliantDevice');
    expect(impact!.controlsLost).not.toContain('mfa');

    // MFA Only Policy should be listed as fallback for mfa
    const mfaFallback = impact!.stillProtectedBy.find((f) => f.policyId === 'mfa-only');
    expect(mfaFallback).toBeUndefined(); // no fallback needed — mfa wasn't lost

    // No fallback for compliantDevice since no other policy requires it
    const deviceFallback = impact!.stillProtectedBy.find((f) =>
      f.controls.includes('compliantDevice'),
    );
    expect(deviceFallback).toBeUndefined();
  });

  it('severity ordering: critical before high before medium before low', () => {
    const policies = [
      // This one will have critical impact (only block policy)
      createPolicy({
        id: 'block',
        displayName: 'AAA Block',
        grantControls: { operator: 'OR', builtInControls: ['block'] },
        conditions: createBaseConditions({
          clientAppTypes: ['exchangeActiveSync'],
        }),
      }),
      // This one will have critical impact (only MFA for browser)
      createPolicy({
        id: 'mfa',
        displayName: 'BBB MFA',
        grantControls: { operator: 'OR', builtInControls: ['mfa'] },
        conditions: createBaseConditions({
          clientAppTypes: ['browser'],
        }),
      }),
    ];
    // Use exchangeActiveSync client so block applies, MFA does not
    const context = createContext({ clientAppType: 'exchangeActiveSync' });

    const result = analyzeImpact(policies, context);

    // Verify sorted by severity, then by name
    for (let i = 1; i < result.policyImpacts.length; i++) {
      const prev = result.policyImpacts[i - 1];
      const curr = result.policyImpacts[i];
      const SEVERITY_ORDER: Record<ImpactSeverity, number> = {
        critical: 0, high: 1, medium: 2, low: 3,
      };
      expect(SEVERITY_ORDER[prev.severity]).toBeLessThanOrEqual(SEVERITY_ORDER[curr.severity]);
    }
  });

  it('empty policies array → no impacts returned', () => {
    const context = createContext();
    const result = analyzeImpact([], context);

    expect(result.policyImpacts).toHaveLength(0);
    expect(result.baselineResult.finalDecision).toBe('allow');
  });

  it('disabled policies are excluded from analysis', () => {
    const policies = [
      createPolicy({
        id: 'disabled-one',
        displayName: 'Disabled Policy',
        state: 'disabled',
        grantControls: { operator: 'OR', builtInControls: ['mfa'] },
      }),
      createPolicy({
        id: 'enabled-one',
        displayName: 'Enabled Policy',
        grantControls: { operator: 'OR', builtInControls: ['mfa'] },
      }),
    ];
    const context = createContext();

    const result = analyzeImpact(policies, context);

    // Only the enabled policy should appear in impacts
    expect(result.policyImpacts).toHaveLength(1);
    expect(result.policyImpacts[0].policyId).toBe('enabled-one');
  });

  it('scenarioDescription includes user, app, and context details', () => {
    const context = createContext({
      user: { ...standardUser, displayName: 'Test User' },
      application: { appId: 'test-app', displayName: 'Test App' },
      device: { platform: 'windows' },
      location: { isTrustedLocation: true },
    });

    const result = analyzeImpact([], context);

    expect(result.scenarioDescription).toContain('Test User');
    expect(result.scenarioDescription).toContain('Test App');
    expect(result.scenarioDescription).toContain('windows');
    expect(result.scenarioDescription).toContain('Trusted Location');
  });
});

describe('fallback detection with control equivalence', () => {
  it('auth strength policy is detected as fallback when mfa is lost', () => {
    // Policy A: only source of mfa (builtInControls: ['mfa'])
    // Policy B: auth strength only (no mfa in builtInControls)
    // Removing A loses 'mfa'. B's authenticationStrength:* should cover it.
    const policies = [
      createPolicy({
        id: 'mfa-all',
        displayName: 'MFA for All',
        grantControls: { operator: 'OR', builtInControls: ['mfa'] },
      }),
      createPolicy({
        id: 'auth-strength-only',
        displayName: 'Auth Strength Policy',
        grantControls: {
          operator: 'OR',
          builtInControls: [],
          authenticationStrength: { id: 's1', displayName: 'Phishing-resistant' },
        },
      }),
    ];
    const context = createContext();

    const result = analyzeImpact(policies, context);

    const mfaImpact = result.policyImpacts.find((p) => p.policyId === 'mfa-all');
    expect(mfaImpact).toBeDefined();
    expect(mfaImpact!.controlsLost).toContain('mfa');
    // Auth strength policy should be a fallback (authenticationStrength covers mfa)
    const fallback = mfaImpact!.stillProtectedBy.find((f) => f.policyId === 'auth-strength-only');
    expect(fallback).toBeDefined();
  });

  it('mfa policy is detected as fallback when auth strength is lost', () => {
    // Policy A: auth strength only (no mfa in builtInControls)
    // Policy B: mfa only
    // Removing A loses authenticationStrength:*. B's mfa should cover it.
    const policies = [
      createPolicy({
        id: 'auth-strength',
        displayName: 'Auth Strength Policy',
        grantControls: {
          operator: 'OR',
          builtInControls: [],
          authenticationStrength: { id: 's1', displayName: 'Phishing-resistant' },
        },
      }),
      createPolicy({
        id: 'mfa-fallback',
        displayName: 'MFA Fallback',
        grantControls: { operator: 'OR', builtInControls: ['mfa'] },
      }),
    ];
    const context = createContext();

    const result = analyzeImpact(policies, context);

    const strengthImpact = result.policyImpacts.find((p) => p.policyId === 'auth-strength');
    expect(strengthImpact).toBeDefined();
    // Auth strength control should be lost
    expect(strengthImpact!.controlsLost.some(c => c.startsWith('authenticationStrength:'))).toBe(true);
    // MFA policy should be a fallback (mfa covers authenticationStrength)
    const fallback = strengthImpact!.stillProtectedBy.find((f) => f.policyId === 'mfa-fallback');
    expect(fallback).toBeDefined();
  });

  it('compliantDevice and domainJoinedDevice are cross-fallbacks', () => {
    const policies = [
      createPolicy({
        id: 'compliant-device',
        displayName: 'Compliant Device Policy',
        grantControls: { operator: 'OR', builtInControls: ['compliantDevice'] },
      }),
      createPolicy({
        id: 'domain-joined',
        displayName: 'Domain Joined Policy',
        grantControls: { operator: 'OR', builtInControls: ['domainJoinedDevice'] },
      }),
    ];
    const context = createContext();

    const result = analyzeImpact(policies, context);

    // Disabling compliant device → domain joined should be a fallback
    const compliantImpact = result.policyImpacts.find((p) => p.policyId === 'compliant-device');
    expect(compliantImpact).toBeDefined();
    expect(compliantImpact!.controlsLost).toContain('compliantDevice');
    expect(compliantImpact!.stillProtectedBy.find((f) => f.policyId === 'domain-joined')).toBeDefined();

    // Disabling domain joined → compliant device should be a fallback
    const domainImpact = result.policyImpacts.find((p) => p.policyId === 'domain-joined');
    expect(domainImpact).toBeDefined();
    expect(domainImpact!.controlsLost).toContain('domainJoinedDevice');
    expect(domainImpact!.stillProtectedBy.find((f) => f.policyId === 'compliant-device')).toBeDefined();
  });

  it('fallback description shows what remains and what is missing', () => {
    // Policy A: MFA + compliantDevice (AND), the ONLY source of both.
    // Policy B: auth strength only (covers mfa via controlCovers but not device).
    // Removing A: both mfa and compliantDevice are lost. B is fallback for mfa.
    // Description should mention auth strength retained + device compliance lost.
    const policies = [
      createPolicy({
        id: 'mfa-and-device',
        displayName: 'MFA + Device',
        grantControls: { operator: 'AND', builtInControls: ['mfa', 'compliantDevice'] },
      }),
      createPolicy({
        id: 'auth-strength',
        displayName: 'Auth Strength',
        grantControls: {
          operator: 'OR',
          builtInControls: [],
          authenticationStrength: { id: 's1', displayName: 'Phishing-resistant MFA' },
        },
      }),
    ];
    const context = createContext();

    const result = analyzeImpact(policies, context);

    const impact = result.policyImpacts.find((p) => p.policyId === 'mfa-and-device');
    expect(impact).toBeDefined();
    expect(impact!.controlsLost).toContain('compliantDevice');
    const fallback = impact!.stillProtectedBy.find((f) => f.policyId === 'auth-strength');
    expect(fallback).toBeDefined();
    // Auth strength covers mfa but not compliantDevice; scope included
    expect(fallback!.description).toContain('still enforced');
    expect(fallback!.description).toContain('for all users');
    expect(fallback!.description).toContain('device compliance no longer enforced');
  });

  it('fallback with full coverage omits "but" clause', () => {
    // Policy A: compliantDevice. Policy B: domainJoinedDevice.
    // controlCovers(domainJoinedDevice, compliantDevice) = true → full coverage.
    // Description should NOT contain "but".
    const policies = [
      createPolicy({
        id: 'compliant',
        displayName: 'Compliant Device',
        grantControls: { operator: 'OR', builtInControls: ['compliantDevice'] },
      }),
      createPolicy({
        id: 'domain-joined',
        displayName: 'Domain Joined',
        grantControls: { operator: 'OR', builtInControls: ['domainJoinedDevice'] },
      }),
    ];
    const context = createContext();

    const result = analyzeImpact(policies, context);

    const impact = result.policyImpacts.find((p) => p.policyId === 'compliant');
    expect(impact).toBeDefined();
    expect(impact!.controlsLost).toContain('compliantDevice');
    const fallback = impact!.stillProtectedBy.find((f) => f.policyId === 'domain-joined');
    expect(fallback).toBeDefined();
    expect(fallback!.description).toContain('still');
    expect(fallback!.description).toContain('for all users');
    expect(fallback!.description).not.toContain('but');
  });

  it('fallback description includes policy scope', () => {
    // Policy A: All users, All apps, MFA + compliantDevice (AND).
    // Policy B: All users, Office 365 only, auth strength.
    // Disabling A → B's description should contain "for Office 365".
    const policies = [
      createPolicy({
        id: 'mfa-device-all',
        displayName: 'MFA + Device for All',
        grantControls: { operator: 'AND', builtInControls: ['mfa', 'compliantDevice'] },
      }),
      createPolicy({
        id: 'auth-strength-o365',
        displayName: 'Auth Strength for O365',
        conditions: createBaseConditions({
          applications: {
            includeApplications: ['Office365'],
            excludeApplications: [],
          },
        }),
        grantControls: {
          operator: 'OR',
          builtInControls: [],
          authenticationStrength: { id: 's1', displayName: 'Phishing-resistant MFA' },
        },
      }),
    ];
    const context = createContext();

    const result = analyzeImpact(policies, context);

    const impact = result.policyImpacts.find((p) => p.policyId === 'mfa-device-all');
    expect(impact).toBeDefined();
    const fallback = impact!.stillProtectedBy.find((f) => f.policyId === 'auth-strength-o365');
    expect(fallback).toBeDefined();
    expect(fallback!.description).toContain('for all users, Office 365');
  });
});

describe('other protection active', () => {
  it('lists policies not in fallbacks', () => {
    // Policy A: compliantDevice for All. Policy B: MFA for All.
    // Disabling A → MFA doesn't cover device compliance, so B is NOT a fallback.
    // But B still applies and enforces MFA → should be in otherProtectionActive.
    const policies = [
      createPolicy({
        id: 'device-policy',
        displayName: 'Device Policy',
        grantControls: { operator: 'OR', builtInControls: ['compliantDevice'] },
      }),
      createPolicy({
        id: 'mfa-policy',
        displayName: 'MFA Policy',
        grantControls: { operator: 'OR', builtInControls: ['mfa'] },
      }),
    ];
    const context = createContext();

    const result = analyzeImpact(policies, context);

    const impact = result.policyImpacts.find((p) => p.policyId === 'device-policy');
    expect(impact).toBeDefined();
    expect(impact!.stillProtectedBy).toHaveLength(0);
    expect(impact!.otherProtectionActive.length).toBeGreaterThan(0);
    const other = impact!.otherProtectionActive.find((o) => o.policyId === 'mfa-policy');
    expect(other).toBeDefined();
    expect(other!.description).toContain('MFA');
    expect(other!.description).toContain('enforced');
  });

  it('excludes policies already in fallbacks', () => {
    // Policy A: MFA. Policy B: auth strength (fallback via equivalence). Policy C: compliantDevice.
    // Disabling A → B is in stillProtectedBy, C is in otherProtectionActive.
    // B should NOT appear in both.
    const policies = [
      createPolicy({
        id: 'mfa-policy',
        displayName: 'MFA Policy',
        grantControls: { operator: 'OR', builtInControls: ['mfa'] },
      }),
      createPolicy({
        id: 'auth-strength',
        displayName: 'Auth Strength',
        grantControls: {
          operator: 'OR',
          builtInControls: [],
          authenticationStrength: { id: 's1', displayName: 'Phishing-resistant' },
        },
      }),
      createPolicy({
        id: 'device-policy',
        displayName: 'Device Policy',
        grantControls: { operator: 'OR', builtInControls: ['compliantDevice'] },
      }),
    ];
    const context = createContext();

    const result = analyzeImpact(policies, context);

    const impact = result.policyImpacts.find((p) => p.policyId === 'mfa-policy');
    expect(impact).toBeDefined();
    // Auth strength should be a fallback
    expect(impact!.stillProtectedBy.find((f) => f.policyId === 'auth-strength')).toBeDefined();
    // Auth strength should NOT be in otherProtectionActive
    expect(impact!.otherProtectionActive.find((o) => o.policyId === 'auth-strength')).toBeUndefined();
    // Device policy should be in otherProtectionActive
    expect(impact!.otherProtectionActive.find((o) => o.policyId === 'device-policy')).toBeDefined();
  });

  it('excludes policies with no controls', () => {
    // Policy A: MFA. Policy B: no grant controls, no session controls.
    // Disabling A → B should NOT appear in otherProtectionActive.
    const policies = [
      createPolicy({
        id: 'mfa-policy',
        displayName: 'MFA Policy',
        grantControls: { operator: 'OR', builtInControls: ['mfa'] },
      }),
      createPolicy({
        id: 'no-controls',
        displayName: 'No Controls Policy',
        grantControls: null,
        sessionControls: null,
      }),
    ];
    const context = createContext();

    const result = analyzeImpact(policies, context);

    const impact = result.policyImpacts.find((p) => p.policyId === 'mfa-policy');
    expect(impact).toBeDefined();
    expect(impact!.otherProtectionActive.find((o) => o.policyId === 'no-controls')).toBeUndefined();
  });
});

// 3 users × 3 apps × 5 platforms × 4 clients × 2 locations × 4 signInRisk × 4 userRisk
const EXPECTED_TOTAL_SCENARIOS = 3 * 3 * 5 * 4 * 2 * 4 * 4;

describe('analyzeImpactSweep', () => {
  it('produces valid structure with correct totalScenarios', () => {
    const policies = [
      createPolicy({
        id: 'mfa-all',
        displayName: 'MFA for All',
        grantControls: { operator: 'OR', builtInControls: ['mfa'] },
      }),
      createPolicy({
        id: 'device-all',
        displayName: 'Device for All',
        grantControls: { operator: 'OR', builtInControls: ['compliantDevice'] },
      }),
    ];

    const result = analyzeImpactSweep(policies);

    expect(result.totalScenarios).toBe(EXPECTED_TOTAL_SCENARIOS);
    expect(result.baselineCoverage).toBeGreaterThan(0);
    expect(result.policyImpacts).toHaveLength(2);

    for (const impact of result.policyImpacts) {
      expect(impact.totalScenarios).toBe(EXPECTED_TOTAL_SCENARIOS);
      expect(impact.affectedScenarios).toBeGreaterThanOrEqual(0);
      expect(impact.coverageBefore).toBeGreaterThanOrEqual(0);
      expect(impact.coverageAfter).toBeGreaterThanOrEqual(0);
      expect(impact.coverageAfter).toBeLessThanOrEqual(impact.coverageBefore);
    }
  });

  it('universal policy affects more scenarios than narrow policy', () => {
    const policies = [
      createPolicy({
        id: 'universal-mfa',
        displayName: 'Universal MFA',
        grantControls: { operator: 'OR', builtInControls: ['mfa'] },
      }),
      createPolicy({
        id: 'admin-only-mfa',
        displayName: 'Admin MFA',
        conditions: createBaseConditions({
          users: {
            includeUsers: [],
            excludeUsers: [],
            includeGroups: [],
            excludeGroups: [],
            includeRoles: ['62e90394-69f5-4237-9190-012177145e10'],
            excludeRoles: [],
          },
        }),
        grantControls: { operator: 'OR', builtInControls: ['mfa'] },
      }),
    ];

    const result = analyzeImpactSweep(policies);

    const universal = result.policyImpacts.find((p) => p.policyId === 'universal-mfa');
    const adminOnly = result.policyImpacts.find((p) => p.policyId === 'admin-only-mfa');
    expect(universal).toBeDefined();
    expect(adminOnly).toBeDefined();
    // The universal policy provides MFA for all — disabling it won't change
    // admin scenarios (admin-only policy still covers those), but WILL affect
    // member + guest scenarios. Admin-only policy only covers admin scenarios,
    // so disabling it changes nothing (universal still covers).
    expect(universal!.affectedScenarios).toBeGreaterThan(adminOnly!.affectedScenarios);
  });

  it('coverageBefore >= coverageAfter — removing a policy cannot increase coverage', () => {
    const policies = [
      createPolicy({
        id: 'p1',
        displayName: 'Policy 1',
        grantControls: { operator: 'OR', builtInControls: ['mfa'] },
      }),
      createPolicy({
        id: 'p2',
        displayName: 'Policy 2',
        grantControls: { operator: 'OR', builtInControls: ['block'] },
        conditions: createBaseConditions({
          clientAppTypes: ['exchangeActiveSync', 'other'],
        }),
      }),
    ];

    const result = analyzeImpactSweep(policies);

    for (const impact of result.policyImpacts) {
      expect(impact.coverageBefore).toBeGreaterThanOrEqual(impact.coverageAfter);
    }
  });

  it('non-applying policy has affectedScenarios = 0', () => {
    // Policy targets a specific user ID that doesn't match any sweep persona
    const policies = [
      createPolicy({
        id: 'narrow',
        displayName: 'Narrow Policy',
        conditions: createBaseConditions({
          users: {
            includeUsers: ['specific-user-not-in-sweep'],
            excludeUsers: [],
            includeGroups: [],
            excludeGroups: [],
            includeRoles: [],
            excludeRoles: [],
          },
        }),
        grantControls: { operator: 'OR', builtInControls: ['mfa'] },
      }),
    ];

    const result = analyzeImpactSweep(policies);

    expect(result.policyImpacts).toHaveLength(1);
    expect(result.policyImpacts[0].affectedScenarios).toBe(0);
  });

  it('block-all policy has near-100% baseline coverage', () => {
    const policies = [
      createPolicy({
        id: 'block-all',
        displayName: 'Block All',
        grantControls: { operator: 'OR', builtInControls: ['block'] },
      }),
    ];

    const result = analyzeImpactSweep(policies);

    expect(result.baselineCoverage).toBe(100);
    expect(result.policyImpacts[0].affectedScenarios).toBe(EXPECTED_TOTAL_SCENARIOS);
  });

  it('empty policies → correct totalScenarios, no impacts', () => {
    const result = analyzeImpactSweep([]);

    expect(result.totalScenarios).toBe(EXPECTED_TOTAL_SCENARIOS);
    expect(result.policyImpacts).toHaveLength(0);
    expect(result.baselineCoverage).toBe(0);
  });

  it('affected user breakdown tracks which user types have changed scenarios', () => {
    // Policy targets admin role only. Disabling it should only affect admin user type.
    const policies = [
      createPolicy({
        id: 'admin-mfa',
        displayName: 'Admin MFA',
        conditions: createBaseConditions({
          users: {
            includeUsers: [],
            excludeUsers: [],
            includeGroups: [],
            excludeGroups: [],
            includeRoles: ['62e90394-69f5-4237-9190-012177145e10'],
            excludeRoles: [],
          },
        }),
        grantControls: { operator: 'OR', builtInControls: ['mfa'] },
      }),
    ];

    const result = analyzeImpactSweep(policies);

    const impact = result.policyImpacts.find((p) => p.policyId === 'admin-mfa');
    expect(impact).toBeDefined();
    // Admin (Global Administrator) should be affected
    const adminEntry = impact!.affectedUserTypes.affected.find((e) => e.label === 'Global Administrator');
    expect(adminEntry).toBeDefined();
    expect(adminEntry!.scenariosAffected).toBeGreaterThan(0);
    // Standard Member and Guest User should NOT be affected
    expect(impact!.affectedUserTypes.notAffected.find((e) => e.label === 'Standard Member')).toBeDefined();
    expect(impact!.affectedUserTypes.notAffected.find((e) => e.label === 'Guest User')).toBeDefined();
  });

  it('all user types affected when broad policy disabled', () => {
    // Policy targets All users, no exclusions
    const policies = [
      createPolicy({
        id: 'mfa-all',
        displayName: 'MFA for All',
        grantControls: { operator: 'OR', builtInControls: ['mfa'] },
      }),
    ];

    const result = analyzeImpactSweep(policies);

    const impact = result.policyImpacts.find((p) => p.policyId === 'mfa-all');
    expect(impact).toBeDefined();
    // All user types should be affected
    expect(impact!.affectedUserTypes.affected).toHaveLength(3);
    expect(impact!.affectedUserTypes.notAffected).toHaveLength(0);
  });

  it('no user types affected for no-impact policy', () => {
    // Policy targets a specific user ID that doesn't match any sweep persona
    const policies = [
      createPolicy({
        id: 'narrow',
        displayName: 'Narrow Policy',
        conditions: createBaseConditions({
          users: {
            includeUsers: ['specific-user-not-in-sweep'],
            excludeUsers: [],
            includeGroups: [],
            excludeGroups: [],
            includeRoles: [],
            excludeRoles: [],
          },
        }),
        grantControls: { operator: 'OR', builtInControls: ['mfa'] },
      }),
    ];

    const result = analyzeImpactSweep(policies);

    const impact = result.policyImpacts[0];
    expect(impact.affectedUserTypes.affected).toHaveLength(0);
    expect(impact.affectedUserTypes.notAffected).toHaveLength(3);
  });
});

describe('affectedScenarios broadened counting', () => {
  it('counts control changes, not just verdict changes', () => {
    // Policy A: MFA + auth strength. Policy B: MFA only.
    // Disabling A: verdict stays controlsRequired but auth strength control is lost.
    const policies = [
      createPolicy({
        id: 'mfa-plus-strength',
        displayName: 'MFA + Auth Strength',
        grantControls: {
          operator: 'OR',
          builtInControls: ['mfa'],
          authenticationStrength: {
            id: 'strength-1',
            displayName: 'Phishing-resistant MFA',
          },
        },
      }),
      createPolicy({
        id: 'mfa-only',
        displayName: 'MFA Only',
        grantControls: { operator: 'OR', builtInControls: ['mfa'] },
      }),
    ];

    const result = analyzeImpactSweep(policies);

    const strengthImpact = result.policyImpacts.find((p) => p.policyId === 'mfa-plus-strength');
    expect(strengthImpact).toBeDefined();
    // Auth strength control is lost even though verdict stays controlsRequired
    expect(strengthImpact!.affectedScenarios).toBeGreaterThan(0);
  });
});

describe('describeVerdict', () => {
  it('returns Block for block decision', () => {
    expect(describeVerdict('block', [])).toBe('Block');
  });

  it('returns Allow for allow decision', () => {
    expect(describeVerdict('allow', [])).toBe('Allow');
  });

  it('formats single control', () => {
    expect(describeVerdict('controlsRequired', ['mfa'])).toBe('Controls Required (MFA)');
  });

  it('formats multiple controls', () => {
    expect(describeVerdict('controlsRequired', ['mfa', 'compliantDevice']))
      .toBe('Controls Required (MFA + Compliant Device)');
  });

  it('formats authenticationStrength prefix cleanly', () => {
    const label = describeVerdict('controlsRequired', ['authenticationStrength:Phishing-resistant (Keys only)']);
    expect(label).toBe('Controls Required (Phishing-resistant (Keys only) authentication strength)');
    expect(label).not.toContain('authenticationStrength:');
  });
});

// ── Posture scoring ──

function createEngineResult(overrides?: Partial<CAEngineResult>): CAEngineResult {
  // Posture scoring derives from per-policy operator info, so synthesize one
  // applied AND policy that guarantees all of requiredControls.
  const required = overrides?.requiredControls ?? ['mfa'];
  const builtIn = required.filter((c) => !c.startsWith('authenticationStrength:'));
  const strengthLabel = required.find((c) => c.startsWith('authenticationStrength:'));
  const appliedPolicies: PolicyEvaluationResult[] = required.length > 0 ? [{
    policyId: 'test-policy',
    policyName: 'Test Policy',
    state: 'enabled',
    applies: true,
    conditionResults: [],
    grantControls: {
      operator: 'AND',
      controls: builtIn,
      satisfied: false,
      satisfiedControls: [],
      unsatisfiedControls: builtIn,
      authenticationStrength: strengthLabel
        ? {
            displayName: strengthLabel.substring('authenticationStrength:'.length),
            policyStrengthId: 'strength-1',
            satisfied: false,
          }
        : undefined,
    },
  }] : [];

  return {
    finalDecision: 'controlsRequired',
    requiredControls: required,
    satisfiedControls: [],
    appliedPolicies,
    skippedPolicies: [],
    reportOnlyPolicies: [],
    sessionControls: {},
    trace: [],
    ...overrides,
  };
}

describe('computePostureScore', () => {
  it('allow with no controls = 0', () => {
    const result = createEngineResult({ finalDecision: 'allow', requiredControls: [] });
    expect(computePostureScore(result)).toBe(0);
  });

  it('block = 10 regardless of other controls', () => {
    const result = createEngineResult({ finalDecision: 'block', requiredControls: ['mfa'] });
    expect(computePostureScore(result)).toBe(MAX_POSTURE_SCORE);
  });

  it('mfa alone = 3', () => {
    const result = createEngineResult({ requiredControls: ['mfa'] });
    expect(computePostureScore(result)).toBe(3);
  });

  it('authenticationStrength alone = 5', () => {
    const result = createEngineResult({ requiredControls: ['authenticationStrength:Phishing-resistant'] });
    expect(computePostureScore(result)).toBe(5);
  });

  it('authenticationStrength + mfa = 5 (don\'t stack, auth strength wins)', () => {
    const result = createEngineResult({
      requiredControls: ['mfa', 'authenticationStrength:Phishing-resistant'],
    });
    expect(computePostureScore(result)).toBe(5);
  });

  it('compliantDevice + domainJoinedDevice = 3 (don\'t stack)', () => {
    const result = createEngineResult({
      requiredControls: ['compliantDevice', 'domainJoinedDevice'],
    });
    expect(computePostureScore(result)).toBe(3);
  });

  it('mfa + compliantDevice = 6 (they do stack)', () => {
    const result = createEngineResult({
      requiredControls: ['mfa', 'compliantDevice'],
    });
    expect(computePostureScore(result)).toBe(6);
  });

  it('mfa + compliantDevice + approvedApplication + compliantApplication = 10 (capped)', () => {
    const result = createEngineResult({
      requiredControls: ['mfa', 'compliantDevice', 'approvedApplication', 'compliantApplication'],
    });
    // 3 + 3 + 2 + 2 = 10, exactly at cap
    expect(computePostureScore(result)).toBe(10);
  });

  it('mfa + compliantDevice + approvedApplication + compliantApplication + passwordChange = 10 (capped, not 11)', () => {
    const result = createEngineResult({
      requiredControls: ['mfa', 'compliantDevice', 'approvedApplication', 'compliantApplication', 'passwordChange'],
    });
    // 3 + 3 + 2 + 2 + 1 = 11, but capped at 10
    expect(computePostureScore(result)).toBe(MAX_POSTURE_SCORE);
  });

  it('sweep coverage uses weighted scores — removing auth strength shows coverage decrease', () => {
    // Policy A: auth strength only (5pts, guaranteed). Policy B: MFA only (3pts).
    // With both: auth strength wins → 5pts per scenario.
    // Without A: MFA only → 3pts per scenario. Coverage should decrease.
    const policies = [
      createPolicy({
        id: 'auth-strength',
        displayName: 'Auth Strength Policy',
        grantControls: {
          operator: 'OR',
          builtInControls: [],
          authenticationStrength: {
            id: 'strength-1',
            displayName: 'Phishing-resistant MFA',
          },
        },
      }),
      createPolicy({
        id: 'mfa-fallback',
        displayName: 'MFA Fallback',
        grantControls: { operator: 'OR', builtInControls: ['mfa'] },
      }),
    ];

    const result = analyzeImpactSweep(policies);

    const strengthImpact = result.policyImpacts.find((p) => p.policyId === 'auth-strength');
    expect(strengthImpact).toBeDefined();
    // Coverage should drop because weighted score drops from 5 to 3 per scenario
    expect(strengthImpact!.coverageBefore).toBeGreaterThan(strengthImpact!.coverageAfter);
  });

  it('an OR grant with multiple alternatives scores at its weakest alternative', () => {
    // "mfa OR compliantDevice" — a sign-in can complete with either alone, so
    // the guaranteed posture is min(mfa, compliantDevice) = 3, not 3 + 3.
    const policies = [
      createPolicy({
        id: 'or-policy',
        displayName: 'MFA or Compliant Device',
        grantControls: { operator: 'OR', builtInControls: ['mfa', 'compliantDevice'] },
      }),
    ];
    const engineResult = new CAEngine().evaluate(policies, createContext());

    expect(computePostureScore(engineResult)).toBe(3);
  });
});

// ── Agent impact (v0.6.8) ──

describe('agent policy impact', () => {
  const agentBlock: ConditionalAccessPolicy = {
    id: 'agents-high-risk',
    displayName: 'Block high-risk agents',
    state: 'enabled',
    conditions: {
      users: { includeUsers: ['None'], excludeUsers: [], includeGroups: [], excludeGroups: [], includeRoles: [], excludeRoles: [] },
      applications: { includeApplications: ['All'], excludeApplications: [] },
      clientAppTypes: [],
      signInRiskLevels: [],
      userRiskLevels: [],
      clientApplications: { includeServicePrincipals: [], excludeServicePrincipals: [], includeAgentIdServicePrincipals: ['All'] },
      agentIdRiskLevels: ['high'],
    },
    grantControls: { operator: 'OR', builtInControls: ['block'] },
    sessionControls: null,
  };

  it('removing an agent block policy reports agent impact and critical severity', () => {
    const result = analyzeImpactSweep([agentBlock]);
    const impact = result.policyImpacts.find((p) => p.policyId === 'agents-high-risk')!;

    expect(impact.agentImpact).toBeDefined();
    expect(impact.agentImpact!.totalScenarios).toBe(48);
    // High-risk agent-identity scenarios open up: 3 apps x 2 locations x 1 risk level
    expect(impact.agentImpact!.affectedScenarios).toBe(6);
    expect(impact.agentImpact!.newlyAllowed).toBe(6);
    expect(impact.severity).toBe('critical');
    // User sweep remains untouched
    expect(impact.affectedScenarios).toBe(0);
  });

  it('a redundant agent policy stays low severity (remaining policy covers)', () => {
    const blockAllAgents: ConditionalAccessPolicy = {
      ...agentBlock,
      id: 'block-all-agents',
      displayName: 'Block all agents',
      conditions: { ...agentBlock.conditions, agentIdRiskLevels: undefined },
    };
    const result = analyzeImpactSweep([agentBlock, blockAllAgents]);
    const impact = result.policyImpacts.find((p) => p.policyId === 'agents-high-risk')!;

    // The block-everything policy still covers the high-risk scenarios
    expect(impact.agentImpact!.newlyAllowed).toBe(0);
    expect(impact.agentImpact!.affectedScenarios).toBe(0);
    expect(impact.severity).toBe('low');
  });

  it('report-only agent policies report zero agent impact', () => {
    const reportOnly = { ...agentBlock, state: 'enabledForReportingButNotEnforced' as const };
    const result = analyzeImpactSweep([reportOnly]);
    const impact = result.policyImpacts.find((p) => p.policyId === 'agents-high-risk')!;

    expect(impact.agentImpact).toEqual({ totalScenarios: 0, affectedScenarios: 0, newlyAllowed: 0 });
    expect(impact.severity).toBe('low');
  });

  it('user policies carry no agentImpact', () => {
    const mfa: ConditionalAccessPolicy = {
      id: 'mfa-all',
      displayName: 'MFA all',
      state: 'enabled',
      conditions: {
        users: { includeUsers: ['All'], excludeUsers: [], includeGroups: [], excludeGroups: [], includeRoles: [], excludeRoles: [] },
        applications: { includeApplications: ['All'], excludeApplications: [] },
        clientAppTypes: [],
        signInRiskLevels: [],
        userRiskLevels: [],
      },
      grantControls: { operator: 'OR', builtInControls: ['mfa'] },
      sessionControls: null,
    };
    const result = analyzeImpactSweep([mfa]);
    expect(result.policyImpacts.find((p) => p.policyId === 'mfa-all')!.agentImpact).toBeUndefined();
  });
});
