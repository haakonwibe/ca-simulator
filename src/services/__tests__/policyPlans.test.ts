// services/__tests__/policyPlans.test.ts — Policy plan rules as policies.
//
// LIVE_PLANS is the shape of a real beta /identity/conditionalAccess/plans
// response from a live tenant, 2026-10-27 (plan, rule and owner ids replaced;
// role template ids are public). If Microsoft reshapes the preview schema,
// these tests localize the breakage.
//
// How plans and rules combine for identities was settled in the portal: it
// refuses to save shared users on a plan whose rule includes All users, so
// the two include lists are concatenated (a union). The other conditions'
// rule is provisional until checked the same way.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flattenPlans, flattenPlanRule, planRuleName } from '../policyPlans';
import { normalizePolicies, fetchPlanRules } from '../graphService';
import type { NamedLocationInfo } from '../graphService';
import { CAEngine } from '../../engine/CAEngine';
import { createTestContext } from '../../engine/__tests__/fixtures/testScenarios';

const GLOBAL_ADMIN = '62e90394-69f5-4237-9190-012177145e10';
const SECURITY_ADMIN = '194ae4cb-b126-40b2-bd5b-6091b380977d';
const AZURE_MANAGEMENT = '797f4846-ba00-4fd7-ba43-dac1f8f63013';

function emptyUsers() {
  return {
    includeUsers: [],
    excludeUsers: [],
    includeGroups: [],
    excludeGroups: [],
    includeRoles: [],
    excludeRoles: [],
    includeGuestsOrExternalUsers: null,
    excludeGuestsOrExternalUsers: null,
  };
}

function ruleConditions(overrides: Record<string, unknown> = {}) {
  return {
    userRiskLevels: [],
    signInRiskLevels: [],
    clientAppTypes: ['all'],
    platforms: null,
    locations: null,
    times: null,
    deviceStates: null,
    devices: null,
    clientApplications: null,
    agents: null,
    applications: {
      includeApplications: ['All'],
      excludeApplications: [],
      includeUserActions: [],
      includeAgentActions: [],
      includeAuthenticationContextClassReferences: [],
      applicationFilter: null,
    },
    users: { ...emptyUsers(), includeUsers: ['All'] },
    ...overrides,
  };
}

function grant(builtInControls: string[], authenticationStrength: unknown = null) {
  return {
    sessionControls: null,
    grantControls: {
      operator: 'OR',
      builtInControls,
      customAuthenticationFactors: [],
      termsOfUse: [],
      authenticationStrength,
    },
  };
}

const LIVE_PLANS = [
  {
    id: 'plan-template',
    displayName: 'New policy plan from templates',
    description: 'Block legacy authentication endpoints that can be used to bypass multifactor authentication.',
    owners: ['owner-1'],
    tags: [],
    templateId: null,
    createdDateTime: '2026-10-27T06:55:05.2259416Z',
    modifiedDateTime: '2026-10-27T06:55:05.2259416Z',
    deletedDateTime: null,
    sharedConditions: null,
    rules: [
      {
        id: 'rule-legacy',
        displayName: 'Block legacy authentication clients',
        description: null,
        state: 'disabled',
        conditions: ruleConditions({ clientAppTypes: ['exchangeActiveSync', 'other'] }),
        controls: grant(['block']),
      },
    ],
  },
  {
    id: 'plan-admin',
    displayName: 'Admin plan',
    description: null,
    owners: ['owner-1'],
    tags: [],
    templateId: null,
    createdDateTime: '2026-10-27T06:56:10.7449778Z',
    modifiedDateTime: '2026-10-27T06:56:10.7449778Z',
    deletedDateTime: null,
    // What the portal writes for a plan whose shared conditions were never set
    sharedConditions: {
      userRiskLevels: [],
      signInRiskLevels: [],
      clientAppTypes: ['all'],
      applications: null,
      users: null,
      platforms: null,
      locations: null,
      times: null,
      deviceStates: null,
      devices: null,
      clientApplications: null,
      agents: null,
    },
    rules: [
      {
        id: 'rule-admins',
        displayName: 'Require MFA for admins',
        description: null,
        state: 'disabled',
        conditions: ruleConditions({ users: { ...emptyUsers(), includeRoles: [GLOBAL_ADMIN, SECURITY_ADMIN] } }),
        controls: grant(['mfa']),
      },
      {
        id: 'rule-azure',
        displayName: 'Require MFA for Azure management',
        description: null,
        state: 'disabled',
        conditions: ruleConditions({
          applications: { includeApplications: [AZURE_MANAGEMENT], excludeApplications: [], includeUserActions: [], includeAgentActions: [], includeAuthenticationContextClassReferences: [], applicationFilter: null },
        }),
        controls: grant(['mfa']),
      },
      {
        id: 'rule-portals',
        displayName: 'Require MFA for Microsoft admin portals',
        description: null,
        state: 'disabled',
        conditions: ruleConditions({
          applications: { includeApplications: ['MicrosoftAdminPortals'], excludeApplications: [], includeUserActions: [], includeAgentActions: [], includeAuthenticationContextClassReferences: [], applicationFilter: null },
          users: { ...emptyUsers(), includeRoles: [GLOBAL_ADMIN, SECURITY_ADMIN] },
        }),
        controls: grant([], {
          id: '00000000-0000-0000-0000-000000000002',
          displayName: 'Multifactor authentication',
          policyType: 'builtIn',
          requirementsSatisfied: 'mfa',
        }),
      },
    ],
  },
];

function normalize(raw: Record<string, unknown>[]) {
  return normalizePolicies(raw, new Map(), new Map(), new Map<string, NamedLocationInfo>());
}

/** A plan with the given shared conditions and one enabled MFA rule. */
function planWith(sharedConditions: Record<string, unknown> | null, rule: Record<string, unknown>) {
  return {
    id: 'plan-x',
    displayName: 'Plan X',
    deletedDateTime: null,
    sharedConditions,
    rules: [{ id: 'rule-x', displayName: 'Rule X', state: 'enabled', conditions: ruleConditions(rule), controls: grant(['mfa']) }],
  };
}

function flattenOne(plan: ReturnType<typeof planWith>) {
  return normalize(flattenPlans([plan]))[0];
}

describe('policy plans — live response shape', () => {
  const policies = normalize(flattenPlans(LIVE_PLANS));
  const byId = new Map(policies.map((p) => [p.id, p]));

  it('flattens every rule into a policy named "Plan › Rule"', () => {
    expect(policies.map((p) => p.displayName)).toEqual([
      'New policy plan from templates › Block legacy authentication clients',
      'Admin plan › Require MFA for admins',
      'Admin plan › Require MFA for Azure management',
      'Admin plan › Require MFA for Microsoft admin portals',
    ]);
    expect(policies.every((p) => p.state === 'disabled')).toBe(true);
  });

  it('lifts the rule\'s nested controls to the top level', () => {
    expect(byId.get('rule-legacy')!.grantControls!.builtInControls).toEqual(['block']);
    expect(byId.get('rule-portals')!.grantControls!.authenticationStrength?.id).toBe('00000000-0000-0000-0000-000000000002');
  });

  it('keeps a rule as it is when its plan has no shared conditions', () => {
    const legacy = byId.get('rule-legacy')!;
    expect(legacy.conditions.clientAppTypes).toEqual(['exchangeActiveSync', 'other']);
    expect(legacy.conditions.users.includeUsers).toEqual(['All']);
  });

  it('records the plan on each rule', () => {
    expect(byId.get('rule-admins')!.plan).toEqual({ id: 'plan-admin', displayName: 'Admin plan' });
  });

  it('leaves ordinary policies without a plan', () => {
    const [ordinary] = normalize([{ id: 'p1', displayName: 'Ordinary', state: 'enabled', conditions: ruleConditions() }]);
    expect(ordinary.plan).toBeUndefined();
  });

  it('gives back a rule\'s own name for display under its plan heading', () => {
    expect(planRuleName(byId.get('rule-admins')!)).toBe('Require MFA for admins');
    expect(planRuleName({ displayName: 'Block legacy authentication' })).toBe('Block legacy authentication');
  });

  it('skips a deleted plan', () => {
    const deleted = { ...LIVE_PLANS[1], deletedDateTime: '2026-10-28T08:00:00Z' };
    expect(flattenPlans([LIVE_PLANS[0], deleted]).map((p) => p.id)).toEqual(['rule-legacy']);
  });
});

describe('combining a plan with a rule', () => {
  it('adds the plan\'s identities to the rule\'s own (union, no duplicates)', () => {
    const policy = flattenOne(planWith(
      { users: { ...emptyUsers(), includeUsers: ['user-lars'], includeRoles: [GLOBAL_ADMIN] } },
      { users: { ...emptyUsers(), includeRoles: [GLOBAL_ADMIN, SECURITY_ADMIN] } },
    ));
    expect(policy.conditions.users.includeUsers).toEqual(['user-lars']);
    expect(policy.conditions.users.includeRoles).toEqual([GLOBAL_ADMIN, SECURITY_ADMIN]);
  });

  it('accumulates exclusions from both', () => {
    const policy = flattenOne(planWith(
      { users: { ...emptyUsers(), excludeGroups: ['group-breakglass'] } },
      { users: { ...emptyUsers(), includeUsers: ['All'], excludeGroups: ['group-service'] } },
    ));
    expect(policy.conditions.users.excludeGroups).toEqual(['group-breakglass', 'group-service']);
  });

  it('adds the plan\'s resources to the rule\'s own', () => {
    const policy = flattenOne(planWith(
      { applications: { includeApplications: ['Office365'], excludeApplications: [] } },
      { applications: { includeApplications: [AZURE_MANAGEMENT], excludeApplications: [] } },
    ));
    expect(policy.conditions.applications.includeApplications).toEqual(['Office365', AZURE_MANAGEMENT]);
  });

  it('gives a rule the plan\'s condition when the rule sets none', () => {
    const policy = flattenOne(planWith(
      { platforms: { includePlatforms: ['android'], excludePlatforms: [] } },
      {},
    ));
    expect(policy.conditions.platforms?.includePlatforms).toEqual(['android']);
  });

  it('does not widen a rule\'s client apps with the plan\'s default "all"', () => {
    const policy = flattenOne(planWith({ clientAppTypes: ['all'] }, { clientAppTypes: ['exchangeActiveSync', 'other'] }));
    expect(policy.conditions.clientAppTypes).toEqual(['exchangeActiveSync', 'other']);
  });

  it('combines a condition set on both as a union (provisional until checked in the portal)', () => {
    const policy = flattenOne(planWith({ signInRiskLevels: ['high'] }, { signInRiskLevels: ['medium'] }));
    expect(policy.conditions.signInRiskLevels).toEqual(['high', 'medium']);
  });

  it('targets no users, not every user, when neither side names any', () => {
    const raw = flattenPlanRule(
      { id: 'plan-agents', displayName: 'Agents', sharedConditions: null },
      { id: 'rule-agents', displayName: 'Block risky agents', state: 'enabled', conditions: { ...ruleConditions(), users: null } },
    );
    expect(raw.conditions.users.includeUsers).toEqual(['None']);
  });
});

describe('plan rules through the engine', () => {
  const engine = new CAEngine();

  it('applies a rule to a user reached only through the plan\'s shared identities', () => {
    const policies = normalize(flattenPlans([planWith(
      { users: { ...emptyUsers(), includeUsers: ['user-lars'] } },
      { users: { ...emptyUsers(), includeRoles: [GLOBAL_ADMIN] } },
    )]));
    const lars = createTestContext({
      user: { id: 'user-lars', displayName: 'Lars', userType: 'member', memberOfGroupIds: [], directoryRoleIds: [] },
    });
    const someoneElse = createTestContext();

    expect(engine.evaluate(policies, lars).appliedPolicies.map((p) => p.policyId)).toEqual(['rule-x']);
    expect(engine.evaluate(policies, someoneElse).appliedPolicies).toEqual([]);
  });

  it('keeps a plan-level exclusion when the rule includes All users', () => {
    const policies = normalize(flattenPlans([planWith(
      { users: { ...emptyUsers(), excludeGroups: ['group-breakglass'] } },
      {},
    )]));
    const breakGlass = createTestContext({
      user: { id: 'bg-1', displayName: 'Break glass', userType: 'member', memberOfGroupIds: ['group-breakglass'], directoryRoleIds: [] },
    });
    expect(engine.evaluate(policies, breakGlass).appliedPolicies).toEqual([]);
    expect(engine.evaluate(policies, createTestContext()).appliedPolicies.map((p) => p.policyId)).toEqual(['rule-x']);
  });
});

describe('fetchPlanRules', () => {
  const PLANS_URL = 'https://graph.microsoft.com/beta/identity/conditionalAccess/plans';
  const MORE_RULES_URL = 'https://graph.microsoft.com/beta/identity/conditionalAccess/plans/plan-admin/rules?$skiptoken=2';

  function respond(status: number, body: unknown = {}): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }

  // The network boundary is mocked; our own logic never is.
  const mockFetch = vi.fn();
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('follows a paged rule list', async () => {
    const [firstRule, ...moreRules] = LIVE_PLANS[1].rules;
    mockFetch.mockImplementation(async (url: string) =>
      url === PLANS_URL
        ? respond(200, { value: [{ ...LIVE_PLANS[1], rules: [firstRule], 'rules@odata.nextLink': MORE_RULES_URL }] })
        : respond(200, { value: moreRules }),
    );
    const { raw, plansUnavailable } = await fetchPlanRules('token');
    expect(plansUnavailable).toBe(false);
    expect(raw.map((p) => p.id)).toEqual(['rule-admins', 'rule-azure', 'rule-portals']);
    expect(mockFetch.mock.calls.map((call) => call[0])).toEqual([PLANS_URL, MORE_RULES_URL]);
  });

  it.each([
    ['403', 403],
    ['404', 404],
    ['500', 500],
  ])('reports plans as unavailable on %s instead of failing the load', async (_label, status) => {
    mockFetch.mockResolvedValue(respond(status));
    await expect(fetchPlanRules('token')).resolves.toEqual({ raw: [], plansUnavailable: true });
  });
});
