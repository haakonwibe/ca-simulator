// data/__tests__/sampleData.test.ts — Sample tenant consistency.
//
// Every id a sample policy references must resolve to a display name, or the
// UI renders a truncated id — which is how CA002's Sam Chen exclusion read
// until the persona names were added to the map. Special values resolve
// before the name map and are exempt.

import { describe, it, expect } from 'vitest';
import { SAMPLE_POLICIES, SAMPLE_DISPLAY_NAMES } from '../samplePolicies';
import { SAMPLE_PERSONAS } from '../samplePersonas';
import { REMOTE_HELP_APP_ID } from '../baselineChecks';
import { assessBaseline } from '@/lib/baselineAssessment';

const SPECIAL_VALUES = new Set([
  'All',
  'None',
  'GuestsOrExternalUsers',
  'AllAgentIdUsers',
  'AllAgentIdResources',
  'Office365',
  'MicrosoftAdminPortals',
]);

describe('sample tenant', () => {
  it('every user, group, role and app id in a sample policy resolves to a display name', () => {
    const missing: string[] = [];
    for (const policy of SAMPLE_POLICIES) {
      const u = policy.conditions.users;
      const a = policy.conditions.applications;
      const refs = [
        ...u.includeUsers, ...u.excludeUsers,
        ...u.includeGroups, ...u.excludeGroups,
        ...u.includeRoles, ...u.excludeRoles,
        ...a.includeApplications, ...a.excludeApplications,
      ];
      for (const id of refs) {
        if (!SPECIAL_VALUES.has(id) && !(id in SAMPLE_DISPLAY_NAMES)) {
          missing.push(`${policy.displayName}: ${id}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('every sample persona and every group it belongs to resolves', () => {
    for (const persona of SAMPLE_PERSONAS) {
      expect(SAMPLE_DISPLAY_NAMES[persona.id], persona.id).toBe(persona.displayName);
      for (const group of persona.memberOfGroupIds) {
        expect(group in SAMPLE_DISPLAY_NAMES, group).toBe(true);
      }
    }
  });

  it('policy and persona ids are unique', () => {
    expect(new Set(SAMPLE_POLICIES.map((p) => p.id)).size).toBe(SAMPLE_POLICIES.length);
    expect(new Set(SAMPLE_PERSONAS.map((p) => p.id)).size).toBe(SAMPLE_PERSONAS.length);
  });

  // The Remote Help set: the baseline compliance policy excludes the service so
  // non-compliant sharers can be helped; the operator policy covers the helpers.
  it('models the two-policy Remote Help design', () => {
    const baseline = SAMPLE_POLICIES.find((p) => p.id === 'ca-policy-004-compliant-device')!;
    expect(baseline.conditions.applications.excludeApplications).toContain(REMOTE_HELP_APP_ID);

    const operators = SAMPLE_POLICIES.find((p) => p.id === 'ca-policy-023-remote-help-operators')!;
    expect(operators.conditions.applications.includeApplications).toEqual([REMOTE_HELP_APP_ID]);
    expect(operators.conditions.users.includeGroups).toEqual(['group-helpdesk']);
    expect(operators.grantControls?.operator).toBe('AND');

    // CA004's exclusion is about device compliance only — MFA still has to reach
    // the service, and CA019 alone leaves trusted locations uncovered.
    const mfaFloor = SAMPLE_POLICIES.find((p) => p.id === 'ca-policy-024-mfa-remote-help')!;
    expect(mfaFloor.conditions.applications.includeApplications).toEqual([REMOTE_HELP_APP_ID]);
    expect(mfaFloor.conditions.clientAppTypes).toEqual([]); // every client, not just browser
    expect(mfaFloor.grantControls?.builtInControls).toContain('mfa');

    const morgan = SAMPLE_PERSONAS.find((p) => p.id === 'sample-user-6')!;
    expect(morgan.memberOfGroupIds).toContain('group-helpdesk');
    expect(morgan.directoryRoleIds).toEqual([]);
  });

  // Pins the coverage the sample tenant is meant to demonstrate. Narrowing CA024,
  // or excluding Remote Help from CA019, drops this back to partial.
  it('gives Remote Help full MFA coverage, trusted locations included', () => {
    const authMap = new Map([['00000000-0000-0000-0000-000000000099', 3]]);
    const result = assessBaseline([...SAMPLE_POLICIES], authMap);
    const check = result.checks.find((c) => c.check.id === 'require-mfa-remote-help')!;
    expect(check.status, check.failingExamples.join(' | ')).toBe('pass');
    expect(check.scenariosPassed).toBe(check.scenariosTotal);
  });
});
