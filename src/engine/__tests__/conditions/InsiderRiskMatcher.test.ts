// InsiderRiskMatcher tests

import { describe, it, expect } from 'vitest';
import { InsiderRiskMatcher } from '../../conditions/InsiderRiskMatcher';
import { createTestContext } from '../fixtures/testScenarios';
import type { InsiderRiskLevel } from '../../models/Policy';

const matcher = new InsiderRiskMatcher();

function insiderRiskContext(level: InsiderRiskLevel | 'none') {
  return createTestContext({
    risk: { signInRiskLevel: 'none', userRiskLevel: 'none', insiderRiskLevel: level },
  });
}

describe('InsiderRiskMatcher', () => {
  describe('unconfigured (empty array)', () => {
    it('matches by default when condition is empty array', () => {
      const result = matcher.evaluate(insiderRiskContext('none'), []);
      expect(result.matches).toBe(true);
      expect(result.phase).toBe('notConfigured');
      expect(result.conditionType).toBe('insiderRisk');
    });

    it('matches elevated context when unconfigured', () => {
      const result = matcher.evaluate(insiderRiskContext('elevated'), []);
      expect(result.matches).toBe(true);
      expect(result.phase).toBe('notConfigured');
    });
  });

  describe('configured levels', () => {
    it('matches when context level is in the policy array', () => {
      const result = matcher.evaluate(insiderRiskContext('moderate'), ['moderate', 'elevated']);
      expect(result.matches).toBe(true);
      expect(result.phase).toBe('inclusion');
      expect(result.details?.matchedLevel).toBe('moderate');
    });

    it('matches elevated when policy targets elevated', () => {
      const result = matcher.evaluate(insiderRiskContext('elevated'), ['elevated']);
      expect(result.matches).toBe(true);
      expect(result.phase).toBe('inclusion');
    });

    it('does not match when context level is not in the policy array', () => {
      const result = matcher.evaluate(insiderRiskContext('minor'), ['moderate', 'elevated']);
      expect(result.matches).toBe(false);
      expect(result.phase).toBe('inclusion');
    });

    it('does not match "none" against configured levels', () => {
      const result = matcher.evaluate(insiderRiskContext('none'), ['minor', 'moderate', 'elevated']);
      expect(result.matches).toBe(false);
      expect(result.phase).toBe('inclusion');
    });
  });

  describe('direct list membership (no ordinal escalation)', () => {
    it('policy targeting moderate does NOT auto-match elevated', () => {
      const result = matcher.evaluate(insiderRiskContext('elevated'), ['moderate']);
      expect(result.matches).toBe(false);
    });

    it('policy targeting elevated does NOT auto-match moderate', () => {
      const result = matcher.evaluate(insiderRiskContext('moderate'), ['elevated']);
      expect(result.matches).toBe(false);
    });

    it('policy targeting minor does NOT auto-match moderate or elevated', () => {
      expect(matcher.evaluate(insiderRiskContext('moderate'), ['minor']).matches).toBe(false);
      expect(matcher.evaluate(insiderRiskContext('elevated'), ['minor']).matches).toBe(false);
    });
  });

  describe('reason quality', () => {
    it('includes context level and policy levels in non-match reason', () => {
      const result = matcher.evaluate(insiderRiskContext('minor'), ['elevated']);
      expect(result.reason).toContain('minor');
      expect(result.reason).toContain('elevated');
    });

    it('includes matched level in match reason', () => {
      const result = matcher.evaluate(insiderRiskContext('elevated'), ['elevated']);
      expect(result.reason).toContain('elevated');
    });
  });
});
