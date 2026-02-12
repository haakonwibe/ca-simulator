// AuthenticationFlowMatcher tests

import { describe, it, expect } from 'vitest';
import { AuthenticationFlowMatcher } from '../../conditions/AuthenticationFlowMatcher';
import { createTestContext } from '../fixtures/testScenarios';
import type { AuthenticationFlowCondition } from '../../models/Policy';

const matcher = new AuthenticationFlowMatcher();

describe('AuthenticationFlowMatcher', () => {
  // ──────────────────────────────────────────────
  // Not configured (default match)
  // ──────────────────────────────────────────────
  describe('not configured', () => {
    it('matches when transferMethods is empty', () => {
      const condition: AuthenticationFlowCondition = { transferMethods: [] };
      const context = createTestContext();
      const result = matcher.evaluate(context, condition);

      expect(result.matches).toBe(true);
      expect(result.phase).toBe('notConfigured');
      expect(result.conditionType).toBe('authenticationFlows');
    });

    it('matches any auth flow when not configured', () => {
      const condition: AuthenticationFlowCondition = { transferMethods: [] };
      const context = createTestContext({ authenticationFlow: 'deviceCodeFlow' });
      const result = matcher.evaluate(context, condition);

      expect(result.matches).toBe(true);
      expect(result.phase).toBe('notConfigured');
    });
  });

  // ──────────────────────────────────────────────
  // Device code flow matching
  // ──────────────────────────────────────────────
  describe('device code flow', () => {
    const condition: AuthenticationFlowCondition = {
      transferMethods: ['deviceCodeFlow'],
    };

    it('matches when context is deviceCodeFlow', () => {
      const context = createTestContext({ authenticationFlow: 'deviceCodeFlow' });
      const result = matcher.evaluate(context, condition);

      expect(result.matches).toBe(true);
      expect(result.phase).toBe('inclusion');
      expect(result.details?.matchedFlow).toBe('deviceCodeFlow');
    });

    it('does not match when context is none (normal sign-in)', () => {
      const context = createTestContext({ authenticationFlow: 'none' });
      const result = matcher.evaluate(context, condition);

      expect(result.matches).toBe(false);
      expect(result.phase).toBe('inclusion');
    });

    it('does not match when context has no authenticationFlow (defaults to none)', () => {
      const context = createTestContext();
      const result = matcher.evaluate(context, condition);

      expect(result.matches).toBe(false);
      expect(result.phase).toBe('inclusion');
    });

    it('does not match when context is authenticationTransfer', () => {
      const context = createTestContext({ authenticationFlow: 'authenticationTransfer' });
      const result = matcher.evaluate(context, condition);

      expect(result.matches).toBe(false);
      expect(result.phase).toBe('inclusion');
    });
  });

  // ──────────────────────────────────────────────
  // Authentication transfer matching
  // ──────────────────────────────────────────────
  describe('authentication transfer', () => {
    const condition: AuthenticationFlowCondition = {
      transferMethods: ['authenticationTransfer'],
    };

    it('matches when context is authenticationTransfer', () => {
      const context = createTestContext({ authenticationFlow: 'authenticationTransfer' });
      const result = matcher.evaluate(context, condition);

      expect(result.matches).toBe(true);
      expect(result.phase).toBe('inclusion');
      expect(result.details?.matchedFlow).toBe('authenticationTransfer');
    });

    it('does not match when context is deviceCodeFlow', () => {
      const context = createTestContext({ authenticationFlow: 'deviceCodeFlow' });
      const result = matcher.evaluate(context, condition);

      expect(result.matches).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // Multiple transfer methods
  // ──────────────────────────────────────────────
  describe('multiple transfer methods', () => {
    const condition: AuthenticationFlowCondition = {
      transferMethods: ['deviceCodeFlow', 'authenticationTransfer'],
    };

    it('matches deviceCodeFlow when both are targeted', () => {
      const context = createTestContext({ authenticationFlow: 'deviceCodeFlow' });
      const result = matcher.evaluate(context, condition);

      expect(result.matches).toBe(true);
    });

    it('matches authenticationTransfer when both are targeted', () => {
      const context = createTestContext({ authenticationFlow: 'authenticationTransfer' });
      const result = matcher.evaluate(context, condition);

      expect(result.matches).toBe(true);
    });

    it('does not match normal sign-in when both are targeted', () => {
      const context = createTestContext({ authenticationFlow: 'none' });
      const result = matcher.evaluate(context, condition);

      expect(result.matches).toBe(false);
    });
  });
});
