// data/__tests__/templatePolicies.test.ts — Template catalog self-test.
//
// The core invariant: every template, drafted into an otherwise empty tenant,
// must satisfy its own baseline check. If a template drifts from its check
// (or vice versa), this loop catches it. Factory templates are resolved with a
// fixture operator, and that operator is mapped for the assessment, so the
// slot-scoped check is exercised rather than reported unmapped.

import { describe, it, expect } from 'vitest';
import { TEMPLATE_POLICIES, resolveTemplate, templateDraftId, TEMPLATE_ADMIN_ROLE_IDS } from '../templatePolicies';
import { BASELINE_CHECKS, REMOTE_HELP_APP_ID, REMOTE_HELP_OPERATOR_SLOT } from '../baselineChecks';
import { assessBaseline, type BaselinePersonaInput } from '@/lib/baselineAssessment';
import type { ConditionalAccessPolicy, PolicyState } from '@/engine/models/Policy';
import type { UserContext } from '@/engine/models/SimulationContext';

const OPERATOR_CHECK = 'require-device-trust-phishing-resistant-remote-help-operators';

const operator: UserContext = {
  id: 'aaaaaaaa-1111-2222-3333-444444444444',
  displayName: 'helpdesk@contoso.com',
  userType: 'member',
  memberOfGroupIds: ['group-helpdesk'],
  directoryRoleIds: [],
};

const operatorPersona: BaselinePersonaInput = {
  user: operator,
  label: 'helpdesk@contoso.com (Remote Help Operator)',
  slotKey: REMOTE_HELP_OPERATOR_SLOT,
  isException: false,
};

function draftFor(checkId: string): ConditionalAccessPolicy {
  const template = resolveTemplate(checkId, { operator });
  if (!template) throw new Error(`no template for ${checkId}`);
  return { ...template, id: templateDraftId(checkId), state: 'enabled' as PolicyState };
}

describe('template catalog', () => {
  it('covers every baseline check', () => {
    for (const check of BASELINE_CHECKS) {
      expect(TEMPLATE_POLICIES.has(check.id), `missing template for ${check.id}`).toBe(true);
    }
    expect(TEMPLATE_POLICIES.size).toBe(BASELINE_CHECKS.length);
  });

  it('every template name carries the [Draft] prefix', () => {
    for (const [checkId] of TEMPLATE_POLICIES) {
      expect(draftFor(checkId).displayName.startsWith('[Draft] ')).toBe(true);
    }
  });

  it('admin role list has 14 unique well-formed GUIDs', () => {
    expect(TEMPLATE_ADMIN_ROLE_IDS).toHaveLength(14);
    expect(new Set(TEMPLATE_ADMIN_ROLE_IDS).size).toBe(14);
    const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    for (const id of TEMPLATE_ADMIN_ROLE_IDS) {
      expect(id).toMatch(guid);
    }
  });

  // ── The self-test loop ──

  describe('every template satisfies its own baseline check', () => {
    for (const check of BASELINE_CHECKS) {
      it(`${check.id}`, () => {
        const result = assessBaseline([draftFor(check.id)], undefined, [operatorPersona]);
        const checkResult = result.checks.find((c) => c.check.id === check.id);
        expect(checkResult?.status, `${check.id} → ${checkResult?.status}; failing: ${checkResult?.failingExamples.join(' | ')}`).toBe('pass');
      });
    }
  });

  it('a report-only draft reads as reportOnly for its check', () => {
    const draft = { ...draftFor('block-legacy-auth'), state: 'enabledForReportingButNotEnforced' as PolicyState };
    const result = assessBaseline([draft]);
    expect(result.checks.find((c) => c.check.id === 'block-legacy-auth')?.status).toBe('reportOnly');
  });

  // ── Factory templates ──

  describe('operator template', () => {
    it('resolves to null without a mapped operator — there is nothing to scope it to', () => {
      expect(resolveTemplate(OPERATOR_CHECK)).toBeNull();
      expect(resolveTemplate(OPERATOR_CHECK, {})).toBeNull();
    });

    it('scopes itself to the mapped account and Remote Assistance Service, never All users', () => {
      const body = resolveTemplate(OPERATOR_CHECK, { operator })!;
      expect(body.conditions.users.includeUsers).toEqual([operator.id]);
      expect(body.conditions.users.includeGroups).toEqual([]);
      expect(body.conditions.applications.includeApplications).toEqual([REMOTE_HELP_APP_ID]);
      expect(body.grantControls?.operator).toBe('AND');
      expect(body.grantControls?.builtInControls).toEqual(['compliantDevice']);
      expect(body.grantControls?.authenticationStrength?.id).toBe('00000000-0000-0000-0000-000000000004');
    });

    it('static templates ignore the context', () => {
      expect(resolveTemplate('block-legacy-auth', { operator })).toEqual(resolveTemplate('block-legacy-auth'));
    });

    it('an unknown check id resolves to null', () => {
      expect(resolveTemplate('no-such-check', { operator })).toBeNull();
    });
  });
});
