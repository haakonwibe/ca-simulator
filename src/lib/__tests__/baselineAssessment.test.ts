// lib/__tests__/baselineAssessment.test.ts — Outcome-based baseline assessment tests.

import { describe, it, expect } from 'vitest';
import { assessBaseline, type BaselineCheckResult } from '../baselineAssessment';
import { BASELINE_CHECKS, AZURE_MANAGEMENT_APP_ID } from '@/data/baselineChecks';
import type { ConditionalAccessPolicy, PolicyConditions } from '@/engine/models/Policy';

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

function getCheck(result: ReturnType<typeof assessBaseline>, id: string): BaselineCheckResult {
  const check = result.checks.find((c) => c.check.id === id);
  if (!check) throw new Error(`check ${id} not found`);
  return check;
}

const mfaForAllUsers = (state: ConditionalAccessPolicy['state'] = 'enabled') =>
  createPolicy({
    id: 'mfa-all',
    displayName: 'Require MFA for All Users',
    state,
    grantControls: { operator: 'OR', builtInControls: ['mfa'] },
  });

const blockLegacyAuth = () =>
  createPolicy({
    id: 'block-legacy',
    displayName: 'Block Legacy Authentication',
    conditions: createBaseConditions({ clientAppTypes: ['exchangeActiveSync', 'other'] }),
    grantControls: { operator: 'OR', builtInControls: ['block'] },
  });

// ── Catalog sanity ──

describe('baseline catalog', () => {
  it('has 21 checks with unique ids', () => {
    expect(BASELINE_CHECKS).toHaveLength(21);
    const ids = new Set(BASELINE_CHECKS.map((c) => c.id));
    expect(ids.size).toBe(21);
  });

  it('every check produces at least one scenario and a result', () => {
    const result = assessBaseline([]);
    expect(result.checks).toHaveLength(21);
    for (const check of result.checks) {
      expect(check.scenariosTotal).toBeGreaterThan(0);
    }
  });
});

// ── Empty tenant ──

describe('empty policy set', () => {
  it('fails every check with zero coverage', () => {
    const result = assessBaseline([]);
    expect(result.counts.fail).toBe(21);
    expect(result.counts.pass).toBe(0);
    for (const check of result.checks) {
      expect(check.status).toBe('fail');
      expect(check.scenariosPassed).toBe(0);
      expect(check.failingExamples.length).toBeGreaterThan(0);
    }
  });
});

// ── Pass detection ──

describe('pass detection', () => {
  it('MFA for all users passes the MFA-flavored checks', () => {
    const result = assessBaseline([mfaForAllUsers()]);

    expect(getCheck(result, 'require-mfa-all-users').status).toBe('pass');
    expect(getCheck(result, 'require-mfa-admins').status).toBe('pass');
    expect(getCheck(result, 'require-mfa-guests').status).toBe('pass');
    expect(getCheck(result, 'require-mfa-azure-mgmt').status).toBe('pass');
    expect(getCheck(result, 'require-mfa-admin-portals').status).toBe('pass');
    expect(getCheck(result, 'require-mfa-risky-signins').status).toBe('pass');
    expect(getCheck(result, 'compliant-hybrid-or-mfa-all-users').status).toBe('pass');
    // But not the unrelated ones
    expect(getCheck(result, 'block-legacy-auth').status).toBe('fail');
    expect(getCheck(result, 'require-compliant-device').status).toBe('fail');
    expect(getCheck(result, 'phishing-resistant-mfa-admins').status).toBe('fail');
  });

  it('records the satisfying policy name', () => {
    const result = assessBaseline([mfaForAllUsers()]);
    expect(getCheck(result, 'require-mfa-all-users').satisfyingPolicies).toContain('Require MFA for All Users');
  });

  it('block legacy auth passes via block verdict', () => {
    const result = assessBaseline([blockLegacyAuth()]);
    const check = getCheck(result, 'block-legacy-auth');
    expect(check.status).toBe('pass');
    expect(check.satisfyingPolicies).toContain('Block Legacy Authentication');
  });

  it('block satisfies non-block expectations too', () => {
    // Blocking ALL access trivially guarantees MFA-or-stronger everywhere
    const blockAll = createPolicy({
      id: 'block-all',
      displayName: 'Block Everything',
      grantControls: { operator: 'OR', builtInControls: ['block'] },
    });
    const result = assessBaseline([blockAll]);
    expect(getCheck(result, 'require-mfa-all-users').status).toBe('pass');
    expect(getCheck(result, 'require-compliant-device').status).toBe('pass');
  });
});

// ── Partial detection (scope holes) ──

describe('partial detection', () => {
  it('an exclusion hole produces partial with failing examples', () => {
    // MFA for all but guests excluded → guest scenarios fail
    const policy = createPolicy({
      id: 'mfa-members',
      displayName: 'MFA except guests',
      conditions: createBaseConditions({
        users: {
          includeUsers: ['All'],
          excludeUsers: [],
          includeGroups: [],
          excludeGroups: [],
          includeRoles: [],
          excludeRoles: [],
          excludeGuestsOrExternalUsers: {
            guestOrExternalUserTypes: 'b2bCollaborationGuest',
          },
        },
      }),
      grantControls: { operator: 'OR', builtInControls: ['mfa'] },
    });
    const result = assessBaseline([policy]);
    const check = getCheck(result, 'require-mfa-all-users');

    expect(check.status).toBe('partial');
    expect(check.scenariosPassed).toBeGreaterThan(0);
    expect(check.scenariosPassed).toBeLessThan(check.scenariosTotal);
    expect(check.failingExamples.some((e) => e.includes('Guest User'))).toBe(true);
    // The guest-specific check fails outright
    expect(getCheck(result, 'require-mfa-guests').status).toBe('fail');
  });

  it('a multi-option OR grant is not treated as guaranteed MFA', () => {
    // "MFA or compliant device" — sign-in can complete without MFA
    const policy = createPolicy({
      id: 'or-policy',
      displayName: 'MFA or Compliant Device',
      grantControls: { operator: 'OR', builtInControls: ['mfa', 'compliantDevice'] },
    });
    const result = assessBaseline([policy]);

    expect(getCheck(result, 'require-mfa-all-users').status).toBe('fail');
    // ...but it exactly satisfies the compliant-or-MFA template
    expect(getCheck(result, 'compliant-hybrid-or-mfa-all-users').status).toBe('pass');
  });
});

// ── Report-only detection ──

describe('report-only detection', () => {
  it('a report-only policy that would pass yields reportOnly status', () => {
    const result = assessBaseline([mfaForAllUsers('enabledForReportingButNotEnforced')]);
    const check = getCheck(result, 'require-mfa-all-users');

    expect(check.status).toBe('reportOnly');
    expect(check.promotablePolicies).toContain('Require MFA for All Users');
  });

  it('enforced pass is not downgraded by report-only twins', () => {
    const result = assessBaseline([
      mfaForAllUsers('enabled'),
      mfaForAllUsers('enabledForReportingButNotEnforced'),
    ]);
    expect(getCheck(result, 'require-mfa-all-users').status).toBe('pass');
  });

  it('irrelevant report-only policies do not produce reportOnly status', () => {
    const result = assessBaseline([blockLegacyAuth(), mfaForAllUsers('enabledForReportingButNotEnforced')]);
    // Compliant-device check: promoting the MFA policy doesn't provide device
    // trust, so this must not read as reportOnly. (It is partial, not fail:
    // block-legacy-auth blocks the legacy-client scenarios, and block
    // satisfies every expectation.)
    const check = getCheck(result, 'require-compliant-device');
    expect(check.status).toBe('partial');
    expect(check.promotablePolicies).toEqual([]);
  });
});

// ── Authentication strength ──

describe('authentication strength expectations', () => {
  const strengthPolicy = (strengthId: string, displayName: string) =>
    createPolicy({
      id: 'auth-strength',
      displayName: `Require ${displayName}`,
      grantControls: {
        operator: 'OR',
        builtInControls: [],
        authenticationStrength: { id: strengthId, displayName },
      },
    });

  it('phishing-resistant strength passes both MFA and phishing-resistant checks', () => {
    const result = assessBaseline([strengthPolicy('00000000-0000-0000-0000-000000000004', 'Phishing-resistant MFA')]);
    expect(getCheck(result, 'require-mfa-admins').status).toBe('pass');
    expect(getCheck(result, 'phishing-resistant-mfa-admins').status).toBe('pass');
  });

  it('plain MFA strength passes MFA checks but not phishing-resistant', () => {
    const result = assessBaseline([strengthPolicy('00000000-0000-0000-0000-000000000002', 'Multifactor authentication')]);
    expect(getCheck(result, 'require-mfa-admins').status).toBe('pass');
    expect(getCheck(result, 'phishing-resistant-mfa-admins').status).toBe('fail');
  });

  it('custom strengths resolve through the custom tier map', () => {
    const customId = '11111111-2222-3333-4444-555555555555';
    const customMap = new Map([[customId, 3]]);
    const result = assessBaseline([strengthPolicy(customId, 'FIDO2 Only')], customMap);
    expect(getCheck(result, 'phishing-resistant-mfa-admins').status).toBe('pass');
  });

  it('unknown custom strengths count as MFA, never phishing-resistant', () => {
    const result = assessBaseline([strengthPolicy('99999999-9999-9999-9999-999999999999', 'Mystery Strength')]);
    expect(getCheck(result, 'require-mfa-admins').status).toBe('pass');
    expect(getCheck(result, 'phishing-resistant-mfa-admins').status).toBe('fail');
  });
});

// ── Specialized checks ──

describe('specialized checks', () => {
  it('block-unknown-platforms passes with an all-platforms-except-known block', () => {
    const policy = createPolicy({
      id: 'block-unknown',
      displayName: 'Block Unknown Platforms',
      conditions: createBaseConditions({
        platforms: {
          includePlatforms: ['all'],
          excludePlatforms: ['android', 'iOS', 'windows', 'macOS', 'linux'],
        },
      }),
      grantControls: { operator: 'OR', builtInControls: ['block'] },
    });
    const result = assessBaseline([policy]);
    expect(getCheck(result, 'block-unknown-platforms').status).toBe('pass');
  });

  it('platform-scoped MFA does not pass the unknown-platform check', () => {
    // Unknown platform slips past specific-platform targeting
    const policy = createPolicy({
      id: 'windows-mfa',
      displayName: 'MFA on Windows',
      conditions: createBaseConditions({
        platforms: { includePlatforms: ['windows'] },
      }),
      grantControls: { operator: 'OR', builtInControls: ['mfa'] },
    });
    const result = assessBaseline([policy]);
    expect(getCheck(result, 'block-unknown-platforms').status).toBe('fail');
  });

  it('no-persistent-browser passes via session control', () => {
    const policy = createPolicy({
      id: 'npb',
      displayName: 'Never Persist Browser',
      sessionControls: { persistentBrowser: { isEnabled: true, mode: 'never' } },
    });
    const result = assessBaseline([policy]);
    const check = getCheck(result, 'no-persistent-browser');
    expect(check.status).toBe('pass');
    expect(check.satisfyingPolicies.length).toBeGreaterThan(0);
  });

  it('persistent browser mode "always" does not pass', () => {
    const policy = createPolicy({
      id: 'pb-always',
      displayName: 'Always Persist',
      sessionControls: { persistentBrowser: { isEnabled: true, mode: 'always' } },
    });
    const result = assessBaseline([policy]);
    expect(getCheck(result, 'no-persistent-browser').status).toBe('fail');
  });

  it('app-enforced-restrictions passes via session control on Office 365', () => {
    const policy = createPolicy({
      id: 'aer',
      displayName: 'App Enforced Restrictions',
      conditions: createBaseConditions({
        applications: { includeApplications: ['Office365'], excludeApplications: [] },
      }),
      sessionControls: { applicationEnforcedRestrictions: { isEnabled: true } },
    });
    const result = assessBaseline([policy]);
    expect(getCheck(result, 'app-enforced-restrictions').status).toBe('pass');
  });

  it('password change for high-risk users passes with a user-risk policy', () => {
    const policy = createPolicy({
      id: 'risky-user-pwd',
      displayName: 'Password Change for Risky Users',
      conditions: createBaseConditions({ userRiskLevels: ['high'] }),
      grantControls: { operator: 'AND', builtInControls: ['mfa', 'passwordChange'] },
    });
    const result = assessBaseline([policy]);
    expect(getCheck(result, 'require-password-change-high-risk-users').status).toBe('pass');
  });

  it('insider risk block passes with an elevated-insider-risk policy', () => {
    const policy = createPolicy({
      id: 'insider-block',
      displayName: 'Block Elevated Insider Risk',
      conditions: createBaseConditions({ insiderRiskLevels: ['elevated'] }),
      grantControls: { operator: 'OR', builtInControls: ['block'] },
    });
    const result = assessBaseline([policy]);
    expect(getCheck(result, 'block-insider-risk').status).toBe('pass');
  });

  it('app protection check passes with approved-app-or-protection on mobile', () => {
    const policy = createPolicy({
      id: 'app-protect',
      displayName: 'Approved Apps on Mobile',
      conditions: createBaseConditions({
        platforms: { includePlatforms: ['iOS', 'android'] },
      }),
      grantControls: { operator: 'OR', builtInControls: ['approvedApplication', 'compliantApplication'] },
    });
    const result = assessBaseline([policy]);
    expect(getCheck(result, 'approved-apps-or-app-protection').status).toBe('pass');
  });

  it('azure management check only credits policies covering the Azure app', () => {
    const policy = createPolicy({
      id: 'azure-mfa',
      displayName: 'MFA for Azure Management',
      conditions: createBaseConditions({
        applications: { includeApplications: [AZURE_MANAGEMENT_APP_ID], excludeApplications: [] },
      }),
      grantControls: { operator: 'OR', builtInControls: ['mfa'] },
    });
    const result = assessBaseline([policy]);
    expect(getCheck(result, 'require-mfa-azure-mgmt').status).toBe('pass');
    // Scoped to one app the general sweep doesn't include — no credit there
    expect(getCheck(result, 'require-mfa-all-users').status).toBe('fail');
  });
});

// ── Summaries ──

// ── AI Agents checks ──

describe('AI Agents checks', () => {
  const blockHighRiskAgents = (state: ConditionalAccessPolicy['state'] = 'enabled') =>
    createPolicy({
      id: 'agents-high-risk',
      displayName: 'Block high-risk agents',
      state,
      conditions: createBaseConditions({
        users: { includeUsers: ['None'], excludeUsers: [], includeGroups: [], excludeGroups: [], includeRoles: [], excludeRoles: [] },
        clientApplications: { includeServicePrincipals: [], excludeServicePrincipals: [], includeAgentIdServicePrincipals: ['All'] },
        agentIdRiskLevels: ['high'],
      }),
      grantControls: { operator: 'OR', builtInControls: ['block'] },
    });

  it('block-high-risk-agents passes with the matching policy, reportOnly when not enforced', () => {
    expect(getCheck(assessBaseline([blockHighRiskAgents()]), 'block-high-risk-agents').status).toBe('pass');

    const ro = assessBaseline([blockHighRiskAgents('enabledForReportingButNotEnforced')]);
    const check = getCheck(ro, 'block-high-risk-agents');
    expect(check.status).toBe('reportOnly');
    expect(check.promotablePolicies).toContain('Block high-risk agents');
  });

  it('approved-agents-only requires deny-by-default, not just risk-gating', () => {
    // Risk-gated block alone leaves no-risk agents through → fail
    const riskOnly = assessBaseline([blockHighRiskAgents()]);
    expect(getCheck(riskOnly, 'approved-agents-only').status).toBe('fail');

    // Deny-by-default with approved exclusions passes (generic agent not excluded)
    const denyByDefault = createPolicy({
      id: 'approved-only',
      displayName: 'Allow only approved agents',
      conditions: createBaseConditions({
        users: { includeUsers: ['None'], excludeUsers: [], includeGroups: [], excludeGroups: [], includeRoles: [], excludeRoles: [] },
        clientApplications: {
          includeServicePrincipals: [],
          excludeServicePrincipals: [],
          includeAgentIdServicePrincipals: ['All'],
          excludeAgentIdServicePrincipals: ['approved-agent-sp-1'],
        },
      }),
      grantControls: { operator: 'OR', builtInControls: ['block'] },
    });
    expect(getCheck(assessBaseline([denyByDefault]), 'approved-agents-only').status).toBe('pass');
  });

  it('block-risky-agent-users passes only with agent-user targeting (All users does not count)', () => {
    // A normal block-all-users policy never matches agent users → fail
    const blockAllUsers = createPolicy({
      id: 'block-everyone',
      displayName: 'Block all users',
      conditions: createBaseConditions({ userRiskLevels: [] }),
      grantControls: { operator: 'OR', builtInControls: ['block'] },
    });
    expect(getCheck(assessBaseline([blockAllUsers]), 'block-risky-agent-users').status).toBe('fail');

    const agentUserBlock = createPolicy({
      id: 'risky-agent-users',
      displayName: 'Block risky agent users',
      conditions: createBaseConditions({
        users: { includeUsers: ['AllAgentIdUsers'], excludeUsers: [], includeGroups: [], excludeGroups: [], includeRoles: [], excludeRoles: [] },
        agentIdRiskLevels: ['medium', 'high'],
      }),
      grantControls: { operator: 'OR', builtInControls: ['block'] },
    });
    expect(getCheck(assessBaseline([agentUserBlock]), 'block-risky-agent-users').status).toBe('pass');
  });

  it('agent checks are not satisfied by human-targeting policies', () => {
    // Even a block-everything user policy does nothing for agent identities
    const result = assessBaseline([
      createPolicy({ id: 'block-all', displayName: 'Block all', grantControls: { operator: 'OR', builtInControls: ['block'] } }),
    ]);
    expect(getCheck(result, 'block-high-risk-agents').status).toBe('fail');
    expect(getCheck(result, 'approved-agents-only').status).toBe('fail');
  });
});

describe('summaries', () => {
  it('counts add up to the catalog size', () => {
    const result = assessBaseline([mfaForAllUsers(), blockLegacyAuth()]);
    const total = result.counts.pass + result.counts.reportOnly + result.counts.partial + result.counts.fail;
    expect(total).toBe(21);
  });

  it('category counts cover all checks in that category', () => {
    const result = assessBaseline([]);
    expect(result.categoryCounts.secureFoundation.total).toBeGreaterThanOrEqual(7);
    expect(result.categoryCounts.secureFoundation.passed).toBe(0);
  });
});
