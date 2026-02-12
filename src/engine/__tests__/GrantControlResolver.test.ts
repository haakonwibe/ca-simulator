// GrantControlResolver tests — CRITICAL ACCURACY MODULE
// Every test here represents a real-world resolution scenario.

import { describe, it, expect } from 'vitest';
import { GrantControlResolver } from '../GrantControlResolver';
import type { PolicyEvaluationResult } from '../models/EvaluationResult';
import type { SatisfiedControl } from '../models/SimulationContext';

const resolver = new GrantControlResolver();

// ──────────────────────────────────────────────
// Helper to build PolicyEvaluationResult stubs
// ──────────────────────────────────────────────

function appliedPolicy(
  id: string,
  name: string,
  grantControls?: PolicyEvaluationResult['grantControls'],
): PolicyEvaluationResult {
  return {
    policyId: id,
    policyName: name,
    state: 'enabled',
    applies: true,
    conditionResults: [],
    grantControls,
  };
}

function andPolicy(id: string, name: string, controls: string[]): PolicyEvaluationResult {
  return appliedPolicy(id, name, {
    operator: 'AND',
    controls,
    satisfied: false, // resolver re-derives this
    satisfiedControls: [],
    unsatisfiedControls: controls,
  });
}

function orPolicy(id: string, name: string, controls: string[]): PolicyEvaluationResult {
  return appliedPolicy(id, name, {
    operator: 'OR',
    controls,
    satisfied: false,
    satisfiedControls: [],
    unsatisfiedControls: controls,
  });
}

function blockPolicy(id: string, name: string): PolicyEvaluationResult {
  return andPolicy(id, name, ['block']);
}

function sessionOnlyPolicy(id: string, name: string): PolicyEvaluationResult {
  return appliedPolicy(id, name, undefined);
}

describe('GrantControlResolver', () => {
  // ══════════════════════════════════════════════════════════════════
  //  ⚠️  THE CLASSIC TRAP — MANDATORY TEST (Section 1.5)
  //  This is the single most important test in the engine.
  // ══════════════════════════════════════════════════════════════════
  describe('THE CLASSIC TRAP — per-policy evaluation, not control merging', () => {
    it('Policy A (OR: mfa, compliantDevice) + Policy B (AND: mfa) — user has only compliantDevice', () => {
      const policyA = orPolicy('policy-a', 'Policy A', ['mfa', 'compliantDevice']);
      const policyB = andPolicy('policy-b', 'Policy B', ['mfa']);
      const satisfied: SatisfiedControl[] = ['compliantDevice'];

      const result = resolver.resolve([policyA, policyB], satisfied);

      // Policy A: OR(mfa, compliantDevice) → compliantDevice present → SATISFIED ✅
      // Policy B: AND(mfa) → mfa not present → NOT SATISFIED ❌
      // Cross-policy: A ✅ AND B ❌ → controlsRequired
      expect(result.decision).toBe('controlsRequired');
      expect(result.unsatisfiedControls).toContain('mfa');

      // Verify per-policy breakdown
      const breakdownA = result.policyBreakdown.find((b) => b.policyId === 'policy-a');
      const breakdownB = result.policyBreakdown.find((b) => b.policyId === 'policy-b');

      expect(breakdownA?.satisfied).toBe(true);
      expect(breakdownA?.operator).toBe('OR');

      expect(breakdownB?.satisfied).toBe(false);
      expect(breakdownB?.operator).toBe('AND');
      expect(breakdownB?.unsatisfiedControls).toContain('mfa');
    });
  });

  // ──────────────────────────────────────────────
  // Empty input → implicit allow
  // ──────────────────────────────────────────────
  describe('no applicable policies', () => {
    it('returns allow when no policies are provided (implicit allow)', () => {
      const result = resolver.resolve([], []);

      expect(result.decision).toBe('allow');
      expect(result.allRequiredControls).toEqual([]);
      expect(result.policyBreakdown).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────
  // Block policies
  // ──────────────────────────────────────────────
  describe('block policies', () => {
    it('single block policy → block regardless of satisfied controls', () => {
      const result = resolver.resolve(
        [blockPolicy('block-1', 'Block Policy')],
        ['mfa', 'compliantDevice'],
      );

      expect(result.decision).toBe('block');
    });

    it('block policy mixed with non-block policies → block wins', () => {
      const policies = [
        andPolicy('allow-1', 'Allow MFA', ['mfa']),
        blockPolicy('block-1', 'Block Policy'),
        orPolicy('allow-2', 'Allow Compliant', ['compliantDevice']),
      ];

      const result = resolver.resolve(policies, ['mfa', 'compliantDevice']);

      expect(result.decision).toBe('block');
    });

    it('block trace includes the blocking policy ID', () => {
      const result = resolver.resolve(
        [blockPolicy('block-abc', 'Critical Block')],
        [],
      );

      expect(result.decision).toBe('block');
      const blockTrace = result.trace.find((t) => t.message.includes('BLOCK'));
      expect(blockTrace?.policyId).toBe('block-abc');
    });
  });

  // ──────────────────────────────────────────────
  // Single AND policy
  // ──────────────────────────────────────────────
  describe('single AND policy', () => {
    it('all controls satisfied → allow', () => {
      const result = resolver.resolve(
        [andPolicy('p1', 'Require MFA + Compliant', ['mfa', 'compliantDevice'])],
        ['mfa', 'compliantDevice'],
      );

      expect(result.decision).toBe('allow');
      expect(result.policyBreakdown[0].satisfied).toBe(true);
    });

    it('one control missing → controlsRequired', () => {
      const result = resolver.resolve(
        [andPolicy('p1', 'Require MFA + Compliant', ['mfa', 'compliantDevice'])],
        ['mfa'],
      );

      expect(result.decision).toBe('controlsRequired');
      expect(result.unsatisfiedControls).toContain('compliantDevice');
      expect(result.policyBreakdown[0].satisfied).toBe(false);
      expect(result.policyBreakdown[0].satisfiedControls).toContain('mfa');
      expect(result.policyBreakdown[0].unsatisfiedControls).toContain('compliantDevice');
    });

    it('no controls satisfied → controlsRequired with all controls listed', () => {
      const result = resolver.resolve(
        [andPolicy('p1', 'Require MFA + Compliant', ['mfa', 'compliantDevice'])],
        [],
      );

      expect(result.decision).toBe('controlsRequired');
      expect(result.unsatisfiedControls).toContain('mfa');
      expect(result.unsatisfiedControls).toContain('compliantDevice');
    });
  });

  // ──────────────────────────────────────────────
  // Single OR policy
  // ──────────────────────────────────────────────
  describe('single OR policy', () => {
    it('one control satisfied → allow', () => {
      const result = resolver.resolve(
        [orPolicy('p1', 'MFA or Compliant', ['mfa', 'compliantDevice'])],
        ['compliantDevice'],
      );

      expect(result.decision).toBe('allow');
      expect(result.policyBreakdown[0].satisfied).toBe(true);
    });

    it('no controls satisfied → controlsRequired', () => {
      const result = resolver.resolve(
        [orPolicy('p1', 'MFA or Compliant', ['mfa', 'compliantDevice'])],
        [],
      );

      expect(result.decision).toBe('controlsRequired');
      expect(result.policyBreakdown[0].satisfied).toBe(false);
    });

    it('all controls satisfied → allow', () => {
      const result = resolver.resolve(
        [orPolicy('p1', 'MFA or Compliant', ['mfa', 'compliantDevice'])],
        ['mfa', 'compliantDevice'],
      );

      expect(result.decision).toBe('allow');
    });
  });

  // ──────────────────────────────────────────────
  // Multiple AND policies — cross-policy AND
  // ──────────────────────────────────────────────
  describe('multiple AND policies', () => {
    it('all independently satisfied → allow', () => {
      const policies = [
        andPolicy('p1', 'Require MFA', ['mfa']),
        andPolicy('p2', 'Require Compliant', ['compliantDevice']),
      ];

      const result = resolver.resolve(policies, ['mfa', 'compliantDevice']);

      expect(result.decision).toBe('allow');
      expect(result.policyBreakdown.every((b) => b.satisfied)).toBe(true);
    });

    it('one policy unsatisfied → controlsRequired', () => {
      const policies = [
        andPolicy('p1', 'Require MFA', ['mfa']),
        andPolicy('p2', 'Require Compliant', ['compliantDevice']),
      ];

      const result = resolver.resolve(policies, ['mfa']); // no compliantDevice

      expect(result.decision).toBe('controlsRequired');
      expect(result.unsatisfiedControls).toContain('compliantDevice');

      const p1Breakdown = result.policyBreakdown.find((b) => b.policyId === 'p1');
      const p2Breakdown = result.policyBreakdown.find((b) => b.policyId === 'p2');
      expect(p1Breakdown?.satisfied).toBe(true);
      expect(p2Breakdown?.satisfied).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // Session-only policy (grantControls: null)
  // ──────────────────────────────────────────────
  describe('session-only policy (no grant controls)', () => {
    it('treated as automatically satisfied', () => {
      const result = resolver.resolve(
        [sessionOnlyPolicy('session-1', 'Session Only')],
        [],
      );

      expect(result.decision).toBe('allow');
      expect(result.policyBreakdown[0].satisfied).toBe(true);
      expect(result.policyBreakdown[0].requiredControls).toEqual([]);
    });

    it('session-only mixed with grant policy — grant policy still evaluated', () => {
      const policies = [
        sessionOnlyPolicy('session-1', 'Session Only'),
        andPolicy('grant-1', 'Require MFA', ['mfa']),
      ];

      const result = resolver.resolve(policies, []);

      expect(result.decision).toBe('controlsRequired');
      expect(result.unsatisfiedControls).toContain('mfa');

      const sessionBreakdown = result.policyBreakdown.find((b) => b.policyId === 'session-1');
      expect(sessionBreakdown?.satisfied).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // Authentication strength
  // ──────────────────────────────────────────────
  describe('authentication strength', () => {
    it('unsatisfied authenticationStrength → controlsRequired', () => {
      const policy = appliedPolicy('auth-str-1', 'Require Phishing-Resistant', {
        operator: 'AND',
        controls: ['mfa'],
        satisfied: false,
        satisfiedControls: [],
        unsatisfiedControls: ['mfa'],
        authenticationStrength: 'Phishing-resistant MFA',
      });

      const result = resolver.resolve([policy], ['mfa']);

      // MFA is satisfied but authenticationStrength is not
      expect(result.decision).toBe('controlsRequired');
      expect(result.unsatisfiedControls).toContain('authenticationStrength:Phishing-resistant MFA');
    });

    it('satisfied via generic authenticationStrength control', () => {
      const policy = appliedPolicy('auth-str-1', 'Require Phishing-Resistant', {
        operator: 'AND',
        controls: ['mfa'],
        satisfied: false,
        satisfiedControls: [],
        unsatisfiedControls: ['mfa'],
        authenticationStrength: 'Phishing-resistant MFA',
      });

      // 'authenticationStrength' as a generic satisfied control
      const result = resolver.resolve(
        [policy],
        ['mfa', 'authenticationStrength' as SatisfiedControl],
      );

      expect(result.decision).toBe('allow');
    });

    it('satisfied via specific strength ID', () => {
      const policy = appliedPolicy('auth-str-1', 'Require Phishing-Resistant', {
        operator: 'AND',
        controls: [],
        satisfied: false,
        satisfiedControls: [],
        unsatisfiedControls: [],
        authenticationStrength: 'Phishing-resistant MFA',
      });

      const result = resolver.resolve(
        [policy],
        ['authenticationStrength:Phishing-resistant MFA' as SatisfiedControl],
      );

      expect(result.decision).toBe('allow');
    });
  });

  // ──────────────────────────────────────────────
  // Mixed scenarios
  // ──────────────────────────────────────────────
  describe('mixed scenarios', () => {
    it('OR + AND policies, all satisfied → allow', () => {
      const policies = [
        orPolicy('p1', 'MFA or Compliant', ['mfa', 'compliantDevice']),
        andPolicy('p2', 'Require MFA', ['mfa']),
      ];

      const result = resolver.resolve(policies, ['mfa']);

      expect(result.decision).toBe('allow');
    });

    it('three policies with different operators, partial satisfaction', () => {
      const policies = [
        orPolicy('p1', 'MFA or Compliant', ['mfa', 'compliantDevice']),
        andPolicy('p2', 'MFA + Domain Joined', ['mfa', 'domainJoinedDevice']),
        andPolicy('p3', 'Compliant Only', ['compliantDevice']),
      ];

      const result = resolver.resolve(policies, ['compliantDevice']);

      // P1: OR(mfa, compliantDevice) → compliantDevice → SATISFIED
      // P2: AND(mfa, domainJoinedDevice) → neither → NOT SATISFIED
      // P3: AND(compliantDevice) → compliantDevice → SATISFIED
      expect(result.decision).toBe('controlsRequired');
      expect(result.unsatisfiedControls).toContain('mfa');
      expect(result.unsatisfiedControls).toContain('domainJoinedDevice');

      const b1 = result.policyBreakdown.find((b) => b.policyId === 'p1');
      const b2 = result.policyBreakdown.find((b) => b.policyId === 'p2');
      const b3 = result.policyBreakdown.find((b) => b.policyId === 'p3');
      expect(b1?.satisfied).toBe(true);
      expect(b2?.satisfied).toBe(false);
      expect(b3?.satisfied).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // Trace quality
  // ──────────────────────────────────────────────
  describe('trace quality', () => {
    it('all trace entries have phase "grantResolution"', () => {
      const result = resolver.resolve(
        [andPolicy('p1', 'Test', ['mfa'])],
        ['mfa'],
      );

      expect(result.trace.length).toBeGreaterThan(0);
      for (const entry of result.trace) {
        expect(entry.phase).toBe('grantResolution');
      }
    });

    it('per-policy trace entries include policyId', () => {
      const result = resolver.resolve(
        [andPolicy('p1', 'Test Policy', ['mfa'])],
        [],
      );

      const policyTrace = result.trace.find((t) => t.policyId === 'p1');
      expect(policyTrace).toBeDefined();
      expect(policyTrace?.message).toContain('Test Policy');
    });

    it('implicit allow trace mentions no applicable policies', () => {
      const result = resolver.resolve([], []);

      expect(result.trace.some((t) => t.message.includes('implicit allow'))).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // Result shape validation
  // ──────────────────────────────────────────────
  describe('result shape', () => {
    it('allRequiredControls contains unique controls from all policies', () => {
      const policies = [
        andPolicy('p1', 'P1', ['mfa', 'compliantDevice']),
        andPolicy('p2', 'P2', ['mfa', 'domainJoinedDevice']),
      ];

      const result = resolver.resolve(policies, []);

      // 'mfa' appears in both but should only be listed once
      expect(result.allRequiredControls).toContain('mfa');
      expect(result.allRequiredControls).toContain('compliantDevice');
      expect(result.allRequiredControls).toContain('domainJoinedDevice');
      expect(result.allRequiredControls.filter((c) => c === 'mfa')).toHaveLength(1);
    });

    it('policyBreakdown has one entry per policy', () => {
      const policies = [
        andPolicy('p1', 'P1', ['mfa']),
        orPolicy('p2', 'P2', ['compliantDevice']),
        sessionOnlyPolicy('p3', 'P3'),
      ];

      const result = resolver.resolve(policies, []);

      expect(result.policyBreakdown).toHaveLength(3);
    });
  });
});
