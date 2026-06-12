// data/__tests__/templatePolicies.test.ts — Template catalog self-test.
//
// The core invariant: every template, drafted into an otherwise empty tenant,
// must satisfy its own baseline check. If a template drifts from its check
// (or vice versa), this loop catches it.

import { describe, it, expect } from 'vitest';
import { TEMPLATE_POLICIES, templateDraftId, TEMPLATE_ADMIN_ROLE_IDS } from '../templatePolicies';
import { BASELINE_CHECKS } from '../baselineChecks';
import { assessBaseline } from '@/lib/baselineAssessment';
import type { ConditionalAccessPolicy, PolicyState } from '@/engine/models/Policy';

function draftFor(checkId: string): ConditionalAccessPolicy {
  const template = TEMPLATE_POLICIES.get(checkId);
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
    for (const [, template] of TEMPLATE_POLICIES) {
      expect(template.displayName.startsWith('[Draft] ')).toBe(true);
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
        const result = assessBaseline([draftFor(check.id)]);
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
});
