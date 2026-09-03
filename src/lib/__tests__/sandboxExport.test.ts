// lib/__tests__/sandboxExport.test.ts — Change plan generation tests.

import { describe, it, expect } from 'vitest';
import { buildChangePlan, toGraphPatchBody, stripDraftPrefix } from '../sandboxExport';
import { resolveTemplate, templateDraftId } from '@/data/templatePolicies';
import type { ConditionalAccessPolicy, PolicyConditions, PolicyState } from '@/engine/models/Policy';

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

function draftFor(checkId: string, state: PolicyState = 'enabled'): ConditionalAccessPolicy {
  const template = resolveTemplate(checkId)!;
  return { ...template, id: templateDraftId(checkId), state };
}

const NEW_STATE = 'enabledForReportingButNotEnforced' as const;

// ── Tests ──

describe('stripDraftPrefix', () => {
  it('removes only the [Draft] prefix', () => {
    expect(stripDraftPrefix('[Draft] Block legacy authentication')).toBe('Block legacy authentication');
    expect(stripDraftPrefix('Untouched Name')).toBe('Untouched Name');
  });
});

describe('buildChangePlan', () => {
  it('empty sandbox produces an empty plan', () => {
    const plan = buildChangePlan([createPolicy()], {}, {}, {}, undefined, 'disabled');
    expect(plan.modifications).toEqual([]);
    expect(plan.creations).toEqual([]);
  });

  it('state-only toggles produce minimal PATCH bodies', () => {
    const policy = createPolicy({ id: 'p1', state: 'enabled' });
    const plan = buildChangePlan([policy], { p1: 'disabled' }, {}, {}, undefined, 'disabled');

    expect(plan.modifications).toHaveLength(1);
    expect(plan.modifications[0].patchBody).toEqual({ state: 'disabled' });
  });

  it('assignment edits export the COMPLETE updated conditions object', () => {
    const policy = createPolicy({ id: 'p1' });
    const plan = buildChangePlan([policy], {}, { p1: { excludeUsers: ['u1'] } }, {}, undefined, 'disabled');

    const patch = plan.modifications[0].patchBody as { conditions: PolicyConditions; state?: string };
    expect(patch.state).toBeUndefined();
    expect(patch.conditions.users.excludeUsers).toEqual(['u1']);
    // Complete object — untouched parts present (Graph replaces nested objects wholesale)
    expect(patch.conditions.users.includeUsers).toEqual(['All']);
    expect(patch.conditions.applications.includeApplications).toEqual(['All']);
    // Internal [] means "matches all" but Graph requires the property — wire form is ['all']
    expect(patch.conditions.clientAppTypes).toEqual(['all']);
  });

  describe('Graph wire-format divergences', () => {
    it('empty clientAppTypes serializes as ["all"]; configured values pass through', () => {
      const drafts = { [templateDraftId('require-mfa-all-users')]: draftFor('require-mfa-all-users') };
      const plan = buildChangePlan([], {}, {}, drafts, undefined, 'disabled');
      const body = plan.creations[0].policyBody as { conditions: { clientAppTypes: string[] } };
      expect(body.conditions.clientAppTypes).toEqual(['all']);

      const legacyDrafts = { [templateDraftId('block-legacy-auth')]: draftFor('block-legacy-auth') };
      const legacyPlan = buildChangePlan([], {}, {}, legacyDrafts, undefined, 'disabled');
      const legacyBody = legacyPlan.creations[0].policyBody as { conditions: { clientAppTypes: string[] } };
      expect(legacyBody.conditions.clientAppTypes).toEqual(['exchangeActiveSync', 'other']);
    });

    it('insiderRiskLevels serializes as a comma-flagged string, omitted when unset', () => {
      const drafts = { [templateDraftId('block-insider-risk')]: draftFor('block-insider-risk') };
      const plan = buildChangePlan([], {}, {}, drafts, undefined, 'disabled');
      const body = plan.creations[0].policyBody as { conditions: Record<string, unknown> };
      expect(body.conditions.insiderRiskLevels).toBe('elevated');

      const mfaDrafts = { [templateDraftId('require-mfa-all-users')]: draftFor('require-mfa-all-users') };
      const mfaPlan = buildChangePlan([], {}, {}, mfaDrafts, undefined, 'disabled');
      const mfaBody = mfaPlan.creations[0].policyBody as { conditions: Record<string, unknown> };
      expect('insiderRiskLevels' in mfaBody.conditions).toBe(false);
    });

    it('guest conditions gain the @odata.type externalTenants discriminator', () => {
      const drafts = { [templateDraftId('require-mfa-guests')]: draftFor('require-mfa-guests') };
      const plan = buildChangePlan([], {}, {}, drafts, undefined, 'disabled');
      const body = plan.creations[0].policyBody as {
        conditions: { users: { includeGuestsOrExternalUsers: { externalTenants: Record<string, unknown> } } };
      };
      expect(body.conditions.users.includeGuestsOrExternalUsers.externalTenants).toEqual({
        '@odata.type': '#microsoft.graph.conditionalAccessAllExternalTenants',
        membershipKind: 'all',
      });
    });
  });

  it('creations export complete bodies with the selected state and stripped name', () => {
    const drafts = { [templateDraftId('block-legacy-auth')]: draftFor('block-legacy-auth') };
    const plan = buildChangePlan([], {}, {}, drafts, undefined, NEW_STATE);

    expect(plan.creations).toHaveLength(1);
    const body = plan.creations[0].policyBody as Record<string, unknown>;
    expect(body.displayName).toBe('Block legacy authentication');
    expect(body.state).toBe(NEW_STATE); // sandbox state (enabled) never exported for creations
    expect(body.grantControls).toEqual({ operator: 'OR', builtInControls: ['block'] });
    expect(body.conditions).toBeDefined();
    expect(body.sessionControls).toBeUndefined(); // null session controls omitted
  });

  it('auth strength exports as an id-only relationship', () => {
    const drafts = { [templateDraftId('require-mfa-all-users')]: draftFor('require-mfa-all-users') };
    const plan = buildChangePlan([], {}, {}, drafts, undefined, 'disabled');

    const grant = (plan.creations[0].policyBody as { grantControls: { authenticationStrength: unknown } }).grantControls;
    expect(grant.authenticationStrength).toEqual({ id: '00000000-0000-0000-0000-000000000002' });
  });

  it('session-only templates export sessionControls without grantControls', () => {
    const drafts = { [templateDraftId('no-persistent-browser')]: draftFor('no-persistent-browser') };
    const plan = buildChangePlan([], {}, {}, drafts, undefined, 'disabled');

    const body = plan.creations[0].policyBody as Record<string, unknown>;
    expect(body.grantControls).toBeUndefined();
    expect(body.sessionControls).toEqual({ persistentBrowser: { isEnabled: true, mode: 'never' } });
  });

  it('PowerShell script contains connect, PATCH, POST, and the safety header', () => {
    const policy = createPolicy({ id: 'p1', state: 'enabled' });
    const drafts = { [templateDraftId('block-legacy-auth')]: draftFor('block-legacy-auth') };
    const plan = buildChangePlan([policy], { p1: 'disabled' }, {}, drafts, undefined, NEW_STATE);

    expect(plan.powershellScript).toContain("Connect-MgGraph -Scopes 'Policy.ReadWrite.ConditionalAccess'");
    expect(plan.powershellScript).toContain('-Method PATCH');
    expect(plan.powershellScript).toContain('/identity/conditionalAccess/policies/p1');
    expect(plan.powershellScript).toContain('-Method POST');
    expect(plan.powershellScript).toContain('break-glass');
    expect(plan.powershellScript).toContain('REVIEW BEFORE RUNNING');
  });

  it('Markdown summary lists changes with display names and the checklist', () => {
    const userId = 'aaaaaaaa-1111-2222-3333-444444444444';
    const policy = createPolicy({
      id: 'p1',
      displayName: 'Block Risky Things',
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
    const plan = buildChangePlan(
      [policy],
      {},
      { p1: { excludeUsers: [] } },
      {},
      displayNames,
      NEW_STATE,
    );

    expect(plan.summaryMarkdown).toContain('### Block Risky Things');
    expect(plan.summaryMarkdown).toContain('removed Sam Chen');
    expect(plan.summaryMarkdown).toContain('## Deployment checklist');
    expect(plan.summaryMarkdown).toContain('- [ ]');
  });

  it('JSON document parses and contains both sections', () => {
    const policy = createPolicy({ id: 'p1', state: 'enabled' });
    const drafts = { [templateDraftId('block-legacy-auth')]: draftFor('block-legacy-auth') };
    const plan = buildChangePlan([policy], { p1: 'disabled' }, {}, drafts, undefined, 'disabled');

    const parsed = JSON.parse(plan.jsonDocument);
    expect(parsed.modifications).toHaveLength(1);
    expect(parsed.modifications[0].patch.state).toBe('disabled');
    expect(parsed.creations).toHaveLength(1);
    expect(parsed.creations[0].state).toBe('disabled');
  });
});

describe('toGraphPatchBody', () => {
  it('includes both state and conditions when both changed', () => {
    const effective = createPolicy({ id: 'p1', state: 'disabled' });
    const body = toGraphPatchBody(
      {
        policyId: 'p1',
        policyName: 'P1',
        stateChange: { from: 'enabled', to: 'disabled' },
        fieldChanges: [{ field: 'excludeUsers', fieldLabel: 'Excluded users', added: [], removed: ['x'] }],
      },
      effective,
    );
    expect(body.state).toBe('disabled');
    // Conditions pass through the Graph wire-format serializer (new object)
    expect((body.conditions as { users: unknown }).users).toEqual(effective.conditions.users);
    expect((body.conditions as { clientAppTypes: string[] }).clientAppTypes).toEqual(['all']);
  });
});

// -- Deploy notes for account-scoped drafts --
//
// The operator template scopes itself to the mapped account because the tool
// cannot know the operators group; the export has to say so where the admin
// will read it, in both artifacts.

describe('deployNote', () => {
  const operatorDraft = createPolicy({
    id: 'draft-operators',
    displayName: '[Draft] Require compliant device and phishing-resistant MFA for Remote Help operators',
    conditions: createBaseConditions({
      users: {
        includeUsers: ['u-helpdesk'],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [],
      },
    }),
    grantControls: { operator: 'AND', builtInControls: ['compliantDevice'] },
  });

  it('flags a draft scoped to individual accounts, naming them, in Markdown and PowerShell', () => {
    const names = new Map([['u-helpdesk', 'Morgan Helpdesk']]);
    const plan = buildChangePlan([], {}, {}, { 'draft-operators': operatorDraft }, names, 'disabled');
    expect(plan.creations[0].deployNote).toContain('Morgan Helpdesk');
    expect(plan.creations[0].deployNote).toContain('replace with the intended group');
    expect(plan.summaryMarkdown).toContain('Note: Scoped to individual account (Morgan Helpdesk)');
    expect(plan.powershellScript).toContain('#    Scoped to individual account (Morgan Helpdesk)');
  });

  it('falls back to the id when no display name is known', () => {
    const plan = buildChangePlan([], {}, {}, { 'draft-operators': operatorDraft }, undefined, 'disabled');
    expect(plan.creations[0].deployNote).toContain('(u-helpdesk)');
  });

  it('is absent for population-scoped drafts', () => {
    const plan = buildChangePlan([], {}, {}, { [templateDraftId('block-legacy-auth')]: draftFor('block-legacy-auth') }, undefined, 'disabled');
    expect(plan.creations[0].deployNote).toBeUndefined();
    expect(plan.summaryMarkdown).not.toContain('Note: Scoped');
  });
});
