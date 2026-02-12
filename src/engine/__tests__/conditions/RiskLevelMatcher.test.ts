// RiskLevelMatcher tests

import { describe, it, expect } from 'vitest';
import { RiskLevelMatcher } from '../../conditions/RiskLevelMatcher';
import type { RiskCondition } from '../../conditions/RiskLevelMatcher';
import { createTestContext } from '../fixtures/testScenarios';
import type { RiskLevel } from '../../models/Policy';

const matcher = new RiskLevelMatcher();

function createRiskCondition(overrides?: Partial<RiskCondition>): RiskCondition {
  return {
    signInRiskLevels: [],
    userRiskLevels: [],
    ...overrides,
  };
}

function riskContext(signInRisk: RiskLevel | 'none', userRisk: RiskLevel | 'none') {
  return createTestContext({
    risk: { signInRiskLevel: signInRisk, userRiskLevel: userRisk },
  });
}

describe('RiskLevelMatcher', () => {
  // ──────────────────────────────────────────────
  // Sign-in risk matching
  // ──────────────────────────────────────────────
  describe('sign-in risk matching', () => {
    it('matches when sign-in risk level is in policy list', () => {
      const condition = createRiskCondition({ signInRiskLevels: ['medium', 'high'] });
      const result = matcher.evaluate(riskContext('medium', 'none'), condition);

      expect(result.matches).toBe(true);
    });

    it('does not match when sign-in risk level is not in policy list', () => {
      const condition = createRiskCondition({ signInRiskLevels: ['medium', 'high'] });
      const result = matcher.evaluate(riskContext('low', 'none'), condition);

      expect(result.matches).toBe(false);
    });

    it('matches "none" when "none" is explicitly in the list', () => {
      const condition = createRiskCondition({ signInRiskLevels: ['none', 'low'] });
      const result = matcher.evaluate(riskContext('none', 'none'), condition);

      expect(result.matches).toBe(true);
    });

    it('does not match "none" when only elevated levels are specified', () => {
      const condition = createRiskCondition({ signInRiskLevels: ['low', 'medium', 'high'] });
      const result = matcher.evaluate(riskContext('none', 'none'), condition);

      expect(result.matches).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // Ordinal behavior clarification
  // ──────────────────────────────────────────────
  describe('ordinal behavior — Graph API stores explicit levels', () => {
    it('["medium"] does NOT auto-include "high"', () => {
      const condition = createRiskCondition({ signInRiskLevels: ['medium'] });
      const result = matcher.evaluate(riskContext('high', 'none'), condition);

      // 'high' is NOT in ['medium'] — no auto-escalation
      expect(result.matches).toBe(false);
    });

    it('["medium"] matches only "medium"', () => {
      const condition = createRiskCondition({ signInRiskLevels: ['medium'] });

      expect(matcher.evaluate(riskContext('medium', 'none'), condition).matches).toBe(true);
      expect(matcher.evaluate(riskContext('low', 'none'), condition).matches).toBe(false);
      expect(matcher.evaluate(riskContext('high', 'none'), condition).matches).toBe(false);
      expect(matcher.evaluate(riskContext('none', 'none'), condition).matches).toBe(false);
    });

    it('["medium", "high"] matches medium and high but not low', () => {
      const condition = createRiskCondition({ signInRiskLevels: ['medium', 'high'] });

      expect(matcher.evaluate(riskContext('medium', 'none'), condition).matches).toBe(true);
      expect(matcher.evaluate(riskContext('high', 'none'), condition).matches).toBe(true);
      expect(matcher.evaluate(riskContext('low', 'none'), condition).matches).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // User risk matching
  // ──────────────────────────────────────────────
  describe('user risk matching', () => {
    it('matches when user risk level is in policy list', () => {
      const condition = createRiskCondition({ userRiskLevels: ['high'] });
      const result = matcher.evaluate(riskContext('none', 'high'), condition);

      expect(result.matches).toBe(true);
    });

    it('does not match when user risk level is not in policy list', () => {
      const condition = createRiskCondition({ userRiskLevels: ['high'] });
      const result = matcher.evaluate(riskContext('none', 'medium'), condition);

      expect(result.matches).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // Both risk types configured — AND logic
  // ──────────────────────────────────────────────
  describe('both signIn and user risk configured', () => {
    it('matches when BOTH risk types match', () => {
      const condition = createRiskCondition({
        signInRiskLevels: ['medium', 'high'],
        userRiskLevels: ['high'],
      });
      const result = matcher.evaluate(riskContext('high', 'high'), condition);

      expect(result.matches).toBe(true);
    });

    it('does not match when only signIn risk matches', () => {
      const condition = createRiskCondition({
        signInRiskLevels: ['high'],
        userRiskLevels: ['high'],
      });
      const result = matcher.evaluate(riskContext('high', 'low'), condition);

      expect(result.matches).toBe(false);
    });

    it('does not match when only user risk matches', () => {
      const condition = createRiskCondition({
        signInRiskLevels: ['high'],
        userRiskLevels: ['high'],
      });
      const result = matcher.evaluate(riskContext('low', 'high'), condition);

      expect(result.matches).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // Empty = unconfigured = matches all
  // ──────────────────────────────────────────────
  describe('unconfigured (empty arrays)', () => {
    it('matches all when both arrays are empty', () => {
      const condition = createRiskCondition();
      const result = matcher.evaluate(riskContext('high', 'high'), condition);

      expect(result.matches).toBe(true);
      expect(result.phase).toBe('unconfigured');
    });

    it('matches "none" risk when unconfigured', () => {
      const condition = createRiskCondition();
      const result = matcher.evaluate(riskContext('none', 'none'), condition);

      expect(result.matches).toBe(true);
    });

    it('unconfigured signIn risk + configured user risk → user risk must still match', () => {
      const condition = createRiskCondition({
        signInRiskLevels: [], // unconfigured
        userRiskLevels: ['high'],
      });

      expect(matcher.evaluate(riskContext('none', 'high'), condition).matches).toBe(true);
      expect(matcher.evaluate(riskContext('none', 'low'), condition).matches).toBe(false);
    });

    it('configured signIn risk + unconfigured user risk → signIn risk must still match', () => {
      const condition = createRiskCondition({
        signInRiskLevels: ['medium'],
        userRiskLevels: [], // unconfigured
      });

      expect(matcher.evaluate(riskContext('medium', 'none'), condition).matches).toBe(true);
      expect(matcher.evaluate(riskContext('low', 'none'), condition).matches).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // Trace quality
  // ──────────────────────────────────────────────
  describe('trace quality', () => {
    it('returns conditionType "risk" for combined results', () => {
      const condition = createRiskCondition();
      const result = matcher.evaluate(riskContext('none', 'none'), condition);

      expect(result.conditionType).toBe('risk');
    });

    it('returns conditionType "signInRisk" when signIn risk fails', () => {
      const condition = createRiskCondition({ signInRiskLevels: ['high'] });
      const result = matcher.evaluate(riskContext('low', 'none'), condition);

      expect(result.conditionType).toBe('signInRisk');
    });

    it('returns conditionType "userRisk" when user risk fails', () => {
      const condition = createRiskCondition({ userRiskLevels: ['high'] });
      const result = matcher.evaluate(riskContext('none', 'low'), condition);

      expect(result.conditionType).toBe('userRisk');
    });

    it('always returns a non-empty reason', () => {
      const condition = createRiskCondition({ signInRiskLevels: ['high'] });
      const result = matcher.evaluate(riskContext('low', 'none'), condition);

      expect(result.reason).toBeTruthy();
    });
  });
});
