// lib/__tests__/baselineAssessment.test.ts — Outcome-based baseline assessment tests.

import { describe, it, expect } from 'vitest';
import { assessBaseline, type BaselineCheckResult, type BaselinePersonaInput } from '../baselineAssessment';
import { BASELINE_CHECKS, AZURE_MANAGEMENT_APP_ID, REMOTE_HELP_APP_ID, REMOTE_HELP_OPERATOR_SLOT } from '@/data/baselineChecks';
import type { ConditionalAccessPolicy, PolicyConditions } from '@/engine/models/Policy';
import type { UserContext } from '@/engine/models/SimulationContext';
import { classifyPersona } from '../gapPersonas';

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

/** The shape Microsoft's Remote Help deploy doc tells admins to create. */
const mfaForAllUsersExceptRemoteHelp = () =>
  createPolicy({
    id: 'mfa-all-except-remote-help',
    displayName: 'Require MFA for All Users',
    conditions: createBaseConditions({
      applications: { includeApplications: ['All'], excludeApplications: [REMOTE_HELP_APP_ID] },
    }),
    grantControls: { operator: 'OR', builtInControls: ['mfa'] },
  });

// ── Catalog sanity ──

describe('baseline catalog', () => {
  it('has 23 checks with unique ids', () => {
    expect(BASELINE_CHECKS).toHaveLength(23);
    const ids = new Set(BASELINE_CHECKS.map((c) => c.id));
    expect(ids.size).toBe(23);
  });

  it('every check produces at least one scenario and a result — slot-scoped ones only once mapped', () => {
    const result = assessBaseline([]);
    expect(result.checks).toHaveLength(23);
    for (const check of result.checks) {
      if (check.check.assessment.slot) {
        expect(check.status).toBe('unmapped');
        expect(check.scenariosTotal).toBe(0);
      } else {
        expect(check.scenariosTotal).toBeGreaterThan(0);
      }
    }
  });
});

// ── Empty tenant ──

describe('empty policy set', () => {
  it('fails every check with zero coverage', () => {
    const result = assessBaseline([]);
    // 23 checks: 22 fail, and the slot-scoped operator check has no account to run
    expect(result.counts.fail).toBe(22);
    expect(result.counts.unmapped).toBe(1);
    expect(result.counts.pass).toBe(0);
    for (const check of result.checks.filter((c) => !c.check.assessment.slot)) {
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

// ── Remote Help ──

describe('Remote Help exclusion', () => {
  it('passes when an All-apps MFA policy covers Remote Help', () => {
    const result = assessBaseline([mfaForAllUsers()]);
    expect(getCheck(result, 'require-mfa-remote-help').status).toBe('pass');
  });

  it('fails when Remote Assistance Service is excluded, while the all-users check still passes', () => {
    const result = assessBaseline([mfaForAllUsersExceptRemoteHelp()]);

    // The tenant looks fully covered by name — this is the silent hole.
    expect(getCheck(result, 'require-mfa-all-users').status).toBe('pass');
    expect(getCheck(result, 'require-mfa-remote-help').status).toBe('fail');
    expect(getCheck(result, 'require-mfa-remote-help').scenariosPassed).toBe(0);
  });
});

// ── Remote Help operators (slot-scoped) ──
//
// Helper status is an Intune RBAC assignment nothing in Entra exposes, so the
// check sweeps only the account mapped into the Remote Help Operator slot and no
// synthetic persona. Expecting device trust + phishing-resistant MFA from every
// member on Remote Assistance Service would lock non-compliant sharers out.

const OPERATOR_CHECK = 'require-device-trust-phishing-resistant-remote-help-operators';
const PHISHING_RESISTANT = { id: '00000000-0000-0000-0000-000000000004', displayName: 'Phishing-resistant MFA' };

const operator: UserContext = {
  id: 'aaaaaaaa-1111-2222-3333-444444444444',
  displayName: 'helpdesk@contoso.com',
  userType: 'member',
  memberOfGroupIds: ['group-helpdesk'],
  directoryRoleIds: [],
};

const operatorPersona = (over?: Partial<BaselinePersonaInput>): BaselinePersonaInput => ({
  user: operator,
  label: 'helpdesk@contoso.com (Remote Help Operator)',
  slotKey: REMOTE_HELP_OPERATOR_SLOT,
  isException: false,
  ...over,
});

/** A helpdesk-group policy on Remote Assistance Service with the given grant. */
const helpdeskOnRemoteHelp = (grantControls: ConditionalAccessPolicy['grantControls'], id = 'helper-policy') =>
  createPolicy({
    id,
    displayName: `Remote Help operators (${id})`,
    conditions: createBaseConditions({
      users: {
        includeUsers: [],
        excludeUsers: [],
        includeGroups: ['group-helpdesk'],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [],
      },
      applications: { includeApplications: [REMOTE_HELP_APP_ID], excludeApplications: [] },
    }),
    grantControls,
  });

const compliantAndPhishingResistant = () =>
  helpdeskOnRemoteHelp({ operator: 'AND', builtInControls: ['compliantDevice'], authenticationStrength: PHISHING_RESISTANT });

describe('Remote Help operators', () => {
  it('is unmapped, not failed, when no operator is mapped', () => {
    const result = assessBaseline([compliantAndPhishingResistant()]);
    const check = getCheck(result, OPERATOR_CHECK);
    expect(check.status).toBe('unmapped');
    expect(check.scenariosTotal).toBe(0);
    expect(check.personaResults).toEqual([]);

    // In the status tally, in no category pair
    expect(result.counts.unmapped).toBe(1);
    const remoteWorkRun = BASELINE_CHECKS.filter((c) => c.categories.includes('remoteWork') && !c.assessment.slot).length;
    expect(result.categoryCounts.remoteWork.total).toBe(remoteWorkRun);
  });

  it('passes when one policy requires compliant device AND phishing-resistant MFA', () => {
    const check = getCheck(
      assessBaseline([compliantAndPhishingResistant()], undefined, [operatorPersona()]),
      OPERATOR_CHECK,
    );
    expect(check.status).toBe('pass');
    expect(check.satisfyingPolicies).toEqual(['Remote Help operators (helper-policy)']);
    // No synthetic stand-in — only the mapped account is swept
    expect(check.personaResults).toHaveLength(1);
    expect(check.personaResults[0].kind).toBe('real');
  });

  it('sweeps only shapes a Remote Help sign-in can actually take', () => {
    const check = getCheck(
      assessBaseline([compliantAndPhishingResistant()], undefined, [operatorPersona()]),
      OPERATOR_CHECK,
    );
    // 1 app x 2 platforms (Windows, macOS — Microsoft documents CA for Remote
    // Help on those two) x 2 client types (browser + modern; legacy is
    // impossible for an OAuth app) x 2 locations
    expect(check.scenariosTotal).toBe(8);
    expect(check.failingExamples).toEqual([]);
  });

  it('fails when the operator policy requires MFA only', () => {
    const check = getCheck(
      assessBaseline([helpdeskOnRemoteHelp({ operator: 'OR', builtInControls: ['mfa'] })], undefined, [operatorPersona()]),
      OPERATOR_CHECK,
    );
    expect(check.status).toBe('fail');
    expect(check.scenariosPassed).toBe(0);
    expect(check.failingExamples.some((e) => e.includes('helpdesk@contoso.com'))).toBe(true);
  });

  it('honours cross-policy AND: compliant device from one policy, phishing-resistant from another', () => {
    const compliantEverywhere = createPolicy({
      id: 'compliant-all',
      displayName: 'Require compliant device for all users',
      grantControls: { operator: 'OR', builtInControls: ['compliantDevice'] },
    });
    const phishingResistantForHelpers = helpdeskOnRemoteHelp(
      { operator: 'OR', builtInControls: [], authenticationStrength: PHISHING_RESISTANT },
      'helper-pr',
    );
    const check = getCheck(
      assessBaseline([compliantEverywhere, phishingResistantForHelpers], undefined, [operatorPersona()]),
      OPERATOR_CHECK,
    );
    expect(check.status).toBe('pass');
    expect(check.satisfyingPolicies).toEqual([
      'Require compliant device for all users',
      'Remote Help operators (helper-pr)',
    ]);
  });

  it('does not credit an OR grant — either alternative alone guarantees neither half', () => {
    const check = getCheck(
      assessBaseline(
        [helpdeskOnRemoteHelp({ operator: 'OR', builtInControls: ['compliantDevice'], authenticationStrength: PHISHING_RESISTANT })],
        undefined,
        [operatorPersona()],
      ),
      OPERATOR_CHECK,
    );
    expect(check.status).toBe('fail');
  });

  it('a block satisfies both halves', () => {
    const check = getCheck(
      assessBaseline([helpdeskOnRemoteHelp({ operator: 'OR', builtInControls: ['block'] })], undefined, [operatorPersona()]),
      OPERATOR_CHECK,
    );
    expect(check.status).toBe('pass');
  });

  it('the operator account still sweeps as a member in class-scoped checks', () => {
    const allUsers = getCheck(assessBaseline([mfaForAllUsers()], undefined, [operatorPersona()]), 'require-mfa-all-users');
    expect(allUsers.status).toBe('pass');
    expect(allUsers.personaResults.some((p) => p.kind === 'real' && p.label.includes('helpdesk@contoso.com'))).toBe(true);
  });

  it('ignores an operator filed as an exception — never counted, so never mapped', () => {
    const check = getCheck(
      assessBaseline([compliantAndPhishingResistant()], undefined, [operatorPersona({ isException: true })]),
      OPERATOR_CHECK,
    );
    expect(check.status).toBe('unmapped');
  });

  it('detects a report-only operator policy through the composite expectation', () => {
    const reportOnly = { ...compliantAndPhishingResistant(), state: 'enabledForReportingButNotEnforced' as const };
    const check = getCheck(assessBaseline([reportOnly], undefined, [operatorPersona()]), OPERATOR_CHECK);
    expect(check.status).toBe('reportOnly');
    expect(check.promotablePolicies).toEqual(['Remote Help operators (helper-policy)']);
  });
});

describe('summaries', () => {
  it('counts add up to the catalog size', () => {
    const result = assessBaseline([mfaForAllUsers(), blockLegacyAuth()]);
    const { counts } = result;
    const total = counts.pass + counts.reportOnly + counts.partial + counts.fail + counts.unmapped;
    expect(total).toBe(23);
  });

  it('category counts cover all checks in that category', () => {
    const result = assessBaseline([]);
    expect(result.categoryCounts.secureFoundation.total).toBeGreaterThanOrEqual(7);
    expect(result.categoryCounts.secureFoundation.passed).toBe(0);
  });
});

// ── Real personas (v0.6.13) ──
//
// The synthetic admin carries the GA role template id, no group memberships and
// no real object id, so a policy that guarantees the control but EXCLUDES real
// admins passed every scenario. These cover the live-tenant case that exposed it.

const GA_ROLE = '62e90394-69f5-4237-9190-012177145e10';

const realAdmin: UserContext = {
  id: '11111111-2222-3333-4444-555555555555',
  displayName: 'admin@contoso.com',
  userType: 'member',
  memberOfGroupIds: ['group-admins'],
  directoryRoleIds: [GA_ROLE],
};

/** Compliant device for everyone — the shape that produced the false pass. */
const compliantForAll = (excludeUsers: string[] = []) =>
  createPolicy({
    id: 'mdm-compliant',
    displayName: 'Require MDM-enrolled and compliant device for all users',
    conditions: createBaseConditions({
      users: {
        includeUsers: ['All'],
        excludeUsers,
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [],
      },
    }),
    grantControls: { operator: 'OR', builtInControls: ['compliantDevice'] },
  });

describe('classifyPersona', () => {
  it('classifies by what the account is, not the slot it was dropped into', () => {
    expect(classifyPersona(realAdmin)).toBe('admin');
    expect(classifyPersona({ ...realAdmin, directoryRoleIds: [] })).toBe('member');
    expect(classifyPersona({ ...realAdmin, userType: 'guest' })).toBe('guest');
    // guest wins over a directory role — a guest is assessed as a guest
    expect(classifyPersona({ ...realAdmin, userType: 'guest', directoryRoleIds: [GA_ROLE] })).toBe('guest');
  });
});

describe('assessBaseline with real personas', () => {
  const persona = (over?: Partial<BaselinePersonaInput>): BaselinePersonaInput => ({
    user: realAdmin,
    label: realAdmin.displayName,
    slotKey: 'administrator',
    isException: false,
    ...over,
  });

  it('passes 120/120 for the synthetic admin even when the real admin is excluded', () => {
    // The bug, pinned: without personas the exclusion is invisible.
    const check = getCheck(assessBaseline([compliantForAll([realAdmin.id])]), 'compliant-or-hybrid-admins');
    expect(check.status).toBe('pass');
    expect(check.scenariosPassed).toBe(check.scenariosTotal);
  });

  it('drops to partial when the real admin is excluded by object id', () => {
    const check = getCheck(
      assessBaseline([compliantForAll([realAdmin.id])], undefined, [persona()]),
      'compliant-or-hybrid-admins',
    );

    expect(check.status).toBe('partial');

    const synthetic = check.personaResults.find((p) => p.kind === 'synthetic')!;
    const real = check.personaResults.find((p) => p.kind === 'real')!;
    expect(synthetic.passed).toBe(synthetic.total);
    expect(real.label).toBe('admin@contoso.com');
    expect(real.passed).toBe(0);
    expect(check.scenariosTotal).toBe(synthetic.total + real.total);
    // The failing examples name the real account, not a synthetic stand-in
    expect(check.failingExamples.some((e) => e.includes('admin@contoso.com'))).toBe(true);
  });

  it('stays pass when the real admin is genuinely covered', () => {
    const check = getCheck(
      assessBaseline([compliantForAll()], undefined, [persona()]),
      'compliant-or-hybrid-admins',
    );

    expect(check.status).toBe('pass');
    expect(check.personaResults).toHaveLength(2);
    expect(check.personaResults.every((p) => p.passed === p.total)).toBe(true);
  });

  it('sorts the synthetic persona first so a real failure reads against a baseline', () => {
    const check = getCheck(
      assessBaseline([compliantForAll([realAdmin.id])], undefined, [persona()]),
      'compliant-or-hybrid-admins',
    );
    expect(check.personaResults[0].kind).toBe('synthetic');
  });

  it('routes exception accounts out of the arithmetic entirely', () => {
    const breakGlass: UserContext = { ...realAdmin, id: 'bg-0000', displayName: 'Break Glass Admin' };
    const check = getCheck(
      assessBaseline([compliantForAll([breakGlass.id])], undefined, [
        persona({ user: breakGlass, label: 'Break Glass Admin', isException: true }),
      ]),
      'compliant-or-hybrid-admins',
    );

    // Excluded from everything, yet the check is unaffected
    expect(check.status).toBe('pass');
    expect(check.personaResults.every((p) => p.kind === 'synthetic')).toBe(true);
    expect(check.exceptionResults).toHaveLength(1);
    expect(check.exceptionResults[0].label).toBe('Break Glass Admin');
    expect(check.exceptionResults[0].passed).toBe(0);
    expect(check.exceptionResults[0].total).toBeGreaterThan(0);
    expect(check.exceptionResults[0].failingExamples.length).toBeGreaterThan(0);
  });

  it('routes a real account only to checks targeting its own persona class', () => {
    const guest: UserContext = {
      id: '99999999-2222-3333-4444-555555555555',
      displayName: 'guest@partner.com',
      userType: 'guest',
      memberOfGroupIds: [],
      directoryRoleIds: [],
    };
    const result = assessBaseline([compliantForAll()], undefined, [
      persona({ user: guest, label: 'guest@partner.com' }),
    ]);

    // admin-only check never sees the guest
    const adminCheck = getCheck(result, 'compliant-or-hybrid-admins');
    expect(adminCheck.personaResults.some((p) => p.label === 'guest@partner.com')).toBe(false);
    // a guest-targeting check does
    const guestCheck = getCheck(result, 'require-mfa-guests');
    expect(guestCheck.personaResults.some((p) => p.label === 'guest@partner.com')).toBe(true);
  });

  it('leaves agent checks identical whether or not personas are supplied', () => {
    const policies = [compliantForAll()];
    const without = assessBaseline(policies);
    const with_ = assessBaseline(policies, undefined, [persona()]);

    for (const id of ['block-high-risk-agents', 'approved-agents-only']) {
      const a = getCheck(without, id);
      const b = getCheck(with_, id);
      expect(b.status).toBe(a.status);
      expect(b.scenariosTotal).toBe(a.scenariosTotal);
      expect(b.exceptionResults).toHaveLength(0);
    }
  });
});
