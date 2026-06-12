// services/__tests__/agentPolicyNormalization.test.ts — Beta-schema normalization.
//
// The fixture is the REAL beta response for an agent policy from a live
// tenant (the portal's "Block high risk agent identities" template),
// 2026-06-12. If Microsoft reshapes the beta schema, this test localizes
// the breakage.

import { describe, it, expect } from 'vitest';
import { normalizePolicies } from '../graphService';
import type { NamedLocationInfo } from '../graphService';

// Verbatim from a live tenant (ids redacted-stable). Beta endpoint.
const BETA_AGENT_POLICY = {
  id: '7a691c43-fb55-4206-b163-1b516b5b6cd8',
  templateId: '6bdcbbb7-ebd1-4f8f-a02f-652db0e3665d',
  displayName: 'Block high risk agent identities from accessing resources',
  state: 'enabledForReportingButNotEnforced',
  sessionControls: null,
  conditions: {
    userRiskLevels: [],
    signInRiskLevels: [],
    clientAppTypes: ['all'],
    agentIdRiskLevels: 'high',
    platforms: null,
    locations: null,
    times: null, // beta-only extras must be ignored
    deviceStates: null,
    devices: null,
    agents: null,
    applications: {
      includeApplications: ['All'],
      excludeApplications: [],
      includeUserActions: [],
      includeAuthenticationContextClassReferences: [],
      applicationFilter: null,
    },
    users: {
      includeUsers: ['None'],
      excludeUsers: [],
      includeGroups: [],
      excludeGroups: [],
      includeRoles: [],
      excludeRoles: [],
      includeGuestsOrExternalUsers: null,
      excludeGuestsOrExternalUsers: null,
    },
    clientApplications: {
      includeServicePrincipals: [],
      includeAgentIdServicePrincipals: ['All'],
      excludeServicePrincipals: [],
    },
  },
  grantControls: {
    operator: 'OR',
    builtInControls: ['block'],
    customAuthenticationFactors: [],
    termsOfUse: [],
    authenticationStrength: null,
  },
};

function normalize(raw: Record<string, unknown>) {
  return normalizePolicies(
    [raw],
    new Map(),
    new Map(),
    new Map<string, NamedLocationInfo>(),
  )[0];
}

describe('agent policy normalization (beta schema)', () => {
  const policy = normalize(BETA_AGENT_POLICY);

  it('parses agent identity targeting from clientApplications', () => {
    expect(policy.conditions.clientApplications).toBeDefined();
    expect(policy.conditions.clientApplications!.includeAgentIdServicePrincipals).toEqual(['All']);
    expect(policy.conditions.clientApplications!.excludeAgentIdServicePrincipals).toBeUndefined();
  });

  it('parses agentIdRiskLevels from the comma-flagged string', () => {
    expect(policy.conditions.agentIdRiskLevels).toEqual(['high']);
  });

  it('keeps the rest of the policy intact', () => {
    expect(policy.state).toBe('enabledForReportingButNotEnforced');
    expect(policy.conditions.users.includeUsers).toEqual(['None']);
    expect(policy.conditions.applications.includeApplications).toEqual(['All']);
    expect(policy.grantControls?.builtInControls).toEqual(['block']);
  });

  it('drops an empty clientApplications block (the common non-agent case)', () => {
    const plain = normalize({
      ...BETA_AGENT_POLICY,
      conditions: {
        ...BETA_AGENT_POLICY.conditions,
        agentIdRiskLevels: null,
        clientApplications: {
          includeServicePrincipals: [],
          excludeServicePrincipals: [],
          servicePrincipalFilter: null,
        },
      },
    });
    expect(plain.conditions.clientApplications).toBeUndefined();
    expect(plain.conditions.agentIdRiskLevels).toBeUndefined();
  });

  it('parses multi-level flagged strings and array forms alike', () => {
    const multi = normalize({
      ...BETA_AGENT_POLICY,
      conditions: { ...BETA_AGENT_POLICY.conditions, agentIdRiskLevels: 'medium,high' },
    });
    expect(multi.conditions.agentIdRiskLevels).toEqual(['medium', 'high']);

    const arrayForm = normalize({
      ...BETA_AGENT_POLICY,
      conditions: { ...BETA_AGENT_POLICY.conditions, agentIdRiskLevels: ['low'] },
    });
    expect(arrayForm.conditions.agentIdRiskLevels).toEqual(['low']);
  });

  it('parses insiderRiskLevels flagged strings too (same wire format)', () => {
    const insider = normalize({
      ...BETA_AGENT_POLICY,
      conditions: {
        ...BETA_AGENT_POLICY.conditions,
        agentIdRiskLevels: null,
        clientApplications: null,
        insiderRiskLevels: 'elevated',
      },
    });
    expect(insider.conditions.insiderRiskLevels).toEqual(['elevated']);
  });

  it('parses an agent filter rule when present', () => {
    const filtered = normalize({
      ...BETA_AGENT_POLICY,
      conditions: {
        ...BETA_AGENT_POLICY.conditions,
        clientApplications: {
          includeServicePrincipals: [],
          excludeServicePrincipals: [],
          includeAgentIdServicePrincipals: ['All'],
          agentIdServicePrincipalFilter: {
            mode: 'exclude',
            rule: 'CustomSecurityAttribute.AgentTier -eq "Trusted"',
          },
        },
      },
    });
    expect(filtered.conditions.clientApplications!.agentIdServicePrincipalFilter).toEqual({
      mode: 'exclude',
      rule: 'CustomSecurityAttribute.AgentTier -eq "Trusted"',
    });
  });
});
