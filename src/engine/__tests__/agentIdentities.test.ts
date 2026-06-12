// engine/__tests__/agentIdentities.test.ts — Agent identity isolation rules.
//
// The three documented Entra Agent ID semantics, each as its own suite:
// 1. Agent-identity sign-ins match ONLY via agent targeting (users skipped).
// 2. 'All' and groups never match agent user accounts; 'AllAgentIdUsers' does.
// 3. Agent-targeting policies never apply to user or agent-user sign-ins.

import { describe, it, expect } from 'vitest';
import { CAEngine } from '../CAEngine';
import type { ConditionalAccessPolicy, PolicyConditions } from '../models/Policy';
import type { SimulationContext } from '../models/SimulationContext';

const engine = new CAEngine();

// ── Fixtures ──

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
    grantControls: { operator: 'OR', builtInControls: ['block'] },
    sessionControls: null,
    ...overrides,
  };
}

/** Mirrors the live-tenant "Block high risk agent identities" template shape */
const blockHighRiskAgents = createPolicy({
  id: 'block-risky-agents',
  displayName: 'Block high risk agent identities',
  conditions: createBaseConditions({
    users: {
      includeUsers: ['None'],
      excludeUsers: [],
      includeGroups: [],
      excludeGroups: [],
      includeRoles: [],
      excludeRoles: [],
    },
    clientApplications: {
      includeServicePrincipals: [],
      excludeServicePrincipals: [],
      includeAgentIdServicePrincipals: ['All'],
    },
    agentIdRiskLevels: ['high'],
  }),
});

const blockAllAgents = createPolicy({
  id: 'block-all-agents',
  displayName: 'Block all agent identities',
  conditions: createBaseConditions({
    users: { includeUsers: ['None'], excludeUsers: [], includeGroups: [], excludeGroups: [], includeRoles: [], excludeRoles: [] },
    clientApplications: {
      includeServicePrincipals: [],
      excludeServicePrincipals: [],
      includeAgentIdServicePrincipals: ['All'],
    },
  }),
});

const mfaForAllUsers = createPolicy({
  id: 'mfa-all',
  displayName: 'Require MFA for All Users',
  grantControls: { operator: 'OR', builtInControls: ['mfa'] },
});

const mfaWithGroup = createPolicy({
  id: 'mfa-group',
  displayName: 'MFA for Finance Group',
  conditions: createBaseConditions({
    users: { includeUsers: [], excludeUsers: [], includeGroups: ['finance-group'], excludeGroups: [], includeRoles: [], excludeRoles: [] },
  }),
  grantControls: { operator: 'OR', builtInControls: ['mfa'] },
});

const blockAgentUsers = createPolicy({
  id: 'block-agent-users',
  displayName: 'Block all agent users',
  conditions: createBaseConditions({
    users: { includeUsers: ['AllAgentIdUsers'], excludeUsers: [], includeGroups: [], excludeGroups: [], includeRoles: [], excludeRoles: [] },
  }),
});

// ── Contexts ──

function baseContext(overrides?: Partial<SimulationContext>): SimulationContext {
  return {
    user: {
      id: 'human-user-1',
      displayName: 'Human User',
      userType: 'member',
      memberOfGroupIds: ['finance-group'],
      directoryRoleIds: [],
    },
    application: { appId: 'All', displayName: 'All Cloud Apps' },
    device: {},
    location: {},
    risk: { signInRiskLevel: 'none', userRiskLevel: 'none', insiderRiskLevel: 'none' },
    clientAppType: 'browser',
    satisfiedControls: [],
    ...overrides,
  };
}

const agentIdentityContext = (agentRisk: 'none' | 'high' = 'none', spId = 'agent-sp-1'): SimulationContext =>
  baseContext({
    identityType: 'agentIdentity',
    agent: { servicePrincipalId: spId, displayName: 'Invoice Bot' },
    user: { id: 'unused', displayName: 'unused', userType: 'member', memberOfGroupIds: [], directoryRoleIds: [] },
    risk: { signInRiskLevel: 'none', userRiskLevel: 'none', insiderRiskLevel: 'none', agentRiskLevel: agentRisk },
  });

const agentUserContext = (id = 'agent-user-1'): SimulationContext =>
  baseContext({
    identityType: 'agentUser',
    user: {
      id,
      displayName: 'Invoice Bot (user account)',
      userType: 'member',
      memberOfGroupIds: ['finance-group'], // groups must NOT scope agent users
      directoryRoleIds: [],
    },
  });

// ── Rule 1: agent-identity sign-ins ──

describe('agent identity sign-ins', () => {
  it('only agent-targeting policies apply; user policies are skipped', () => {
    const result = engine.evaluate([mfaForAllUsers, blockAllAgents], agentIdentityContext());

    expect(result.finalDecision).toBe('block');
    expect(result.appliedPolicies.map((p) => p.policyId)).toEqual(['block-all-agents']);
    const skipped = result.skippedPolicies.find((p) => p.policyId === 'mfa-all');
    expect(skipped?.conditionResults[0].reason).toContain('does not target agent identities');
  });

  it('agent risk condition uses direct list membership', () => {
    const noRisk = engine.evaluate([blockHighRiskAgents], agentIdentityContext('none'));
    expect(noRisk.finalDecision).toBe('allow'); // report... state is enabled here; no match → allow
    expect(noRisk.appliedPolicies).toHaveLength(0);

    const highRisk = engine.evaluate([blockHighRiskAgents], agentIdentityContext('high'));
    expect(highRisk.finalDecision).toBe('block');
  });

  it('specific agent targeting and exclusion-wins', () => {
    const scoped = createPolicy({
      id: 'scoped-agents',
      conditions: createBaseConditions({
        clientApplications: {
          includeServicePrincipals: [],
          excludeServicePrincipals: [],
          includeAgentIdServicePrincipals: ['All'],
          excludeAgentIdServicePrincipals: ['agent-sp-1'],
        },
      }),
    });
    const excluded = engine.evaluate([scoped], agentIdentityContext('none', 'agent-sp-1'));
    expect(excluded.appliedPolicies).toHaveLength(0);

    const other = engine.evaluate([scoped], agentIdentityContext('none', 'agent-sp-2'));
    expect(other.finalDecision).toBe('block');
  });

  it('a configured attribute filter is flagged as not evaluated, never guessed', () => {
    const filtered = createPolicy({
      id: 'filtered-agents',
      conditions: createBaseConditions({
        clientApplications: {
          includeServicePrincipals: [],
          excludeServicePrincipals: [],
          includeAgentIdServicePrincipals: ['All'],
          agentIdServicePrincipalFilter: { mode: 'include', rule: 'tier -eq "trusted"' },
        },
      }),
    });
    const result = engine.evaluate([filtered], agentIdentityContext());
    const applied = result.appliedPolicies[0];
    expect(applied).toBeDefined();
    expect(applied.conditionResults[0].details?.filterNotEvaluated).toBe(true);
    expect(applied.conditionResults[0].reason).toContain('not evaluated');
  });
});

// ── Rule 2: agent user accounts ──

describe('agent user sign-ins', () => {
  it("'All' does not match agent users (documented limitation)", () => {
    const result = engine.evaluate([mfaForAllUsers], agentUserContext());
    expect(result.appliedPolicies).toHaveLength(0);
    expect(result.finalDecision).toBe('allow');
  });

  it('group scoping does not match agent users', () => {
    const result = engine.evaluate([mfaWithGroup], agentUserContext());
    expect(result.appliedPolicies).toHaveLength(0);
  });

  it("'AllAgentIdUsers' matches agent users", () => {
    const result = engine.evaluate([blockAgentUsers], agentUserContext());
    expect(result.finalDecision).toBe('block');
  });

  it('direct id inclusion and exclusion work', () => {
    const direct = createPolicy({
      id: 'direct-agent-user',
      conditions: createBaseConditions({
        users: { includeUsers: ['agent-user-1'], excludeUsers: [], includeGroups: [], excludeGroups: [], includeRoles: [], excludeRoles: [] },
      }),
    });
    expect(engine.evaluate([direct], agentUserContext('agent-user-1')).finalDecision).toBe('block');
    expect(engine.evaluate([direct], agentUserContext('agent-user-2')).appliedPolicies).toHaveLength(0);

    const excluded = createPolicy({
      id: 'excluded-agent-user',
      conditions: createBaseConditions({
        users: { includeUsers: ['AllAgentIdUsers'], excludeUsers: ['agent-user-1'], includeGroups: [], excludeGroups: [], includeRoles: [], excludeRoles: [] },
      }),
    });
    expect(engine.evaluate([excluded], agentUserContext('agent-user-1')).appliedPolicies).toHaveLength(0);
  });
});

// ── Rule 3: human sign-ins are unaffected ──

describe('human sign-ins', () => {
  it('agent-targeting policies never apply to users', () => {
    const result = engine.evaluate([blockAllAgents, blockHighRiskAgents, mfaForAllUsers], baseContext());

    expect(result.finalDecision).toBe('controlsRequired'); // MFA, not blocked
    expect(result.appliedPolicies.map((p) => p.policyId)).toEqual(['mfa-all']);
    const skipped = result.skippedPolicies.find((p) => p.policyId === 'block-all-agents');
    expect(skipped?.conditionResults[0].reason).toContain('does not apply to user sign-ins');
  });

  it("'AllAgentIdUsers' never matches a human user", () => {
    const result = engine.evaluate([blockAgentUsers], baseContext());
    expect(result.appliedPolicies).toHaveLength(0);
  });

  it("'AllAgentIdResources' matches only when targeting an agent resource", () => {
    const blockUsersIntoAgents = createPolicy({
      id: 'block-users-into-agents',
      conditions: createBaseConditions({
        applications: { includeApplications: ['AllAgentIdResources'], excludeApplications: [] },
      }),
    });

    // Concrete app target (the interactive 'All' context deliberately matches
    // every application condition, so it can't serve as the negative case)
    const normalApp = engine.evaluate([blockUsersIntoAgents], baseContext({
      application: { appId: 'Office365', displayName: 'Office 365' },
    }));
    expect(normalApp.appliedPolicies).toHaveLength(0);

    const agentResource = engine.evaluate([blockUsersIntoAgents], baseContext({
      application: { appId: 'AllAgentIdResources', displayName: 'All Agent Resources', isAgentResource: true },
    }));
    expect(agentResource.finalDecision).toBe('block');
  });
});
