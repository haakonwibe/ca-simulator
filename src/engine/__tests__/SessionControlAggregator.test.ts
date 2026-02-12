// SessionControlAggregator tests

import { describe, it, expect } from 'vitest';
import { SessionControlAggregator } from '../SessionControlAggregator';
import type { PolicyEvaluationResult } from '../models/EvaluationResult';

const aggregator = new SessionControlAggregator();

function policyWithSession(
  id: string,
  name: string,
  sessionControls?: Record<string, unknown>,
): PolicyEvaluationResult {
  return {
    policyId: id,
    policyName: name,
    state: 'enabled',
    applies: true,
    conditionResults: [],
    sessionControls,
  };
}

describe('SessionControlAggregator', () => {
  // ──────────────────────────────────────────────
  // Sign-in frequency — shortest wins
  // ──────────────────────────────────────────────
  describe('sign-in frequency', () => {
    it('single policy → preserved as-is', () => {
      const policies = [
        policyWithSession('p1', 'Policy 1', {
          signInFrequency: { value: 8, type: 'hours' },
        }),
      ];

      const { sessionControls } = aggregator.aggregate(policies);

      expect(sessionControls.signInFrequency).toBeDefined();
      expect(sessionControls.signInFrequency?.value).toBe(8);
      expect(sessionControls.signInFrequency?.type).toBe('hours');
      expect(sessionControls.signInFrequency?.source).toBe('p1');
    });

    it('4 hours vs 1 day → 4 hours wins (shorter)', () => {
      const policies = [
        policyWithSession('p1', 'P1', { signInFrequency: { value: 1, type: 'days' } }),
        policyWithSession('p2', 'P2', { signInFrequency: { value: 4, type: 'hours' } }),
      ];

      const { sessionControls } = aggregator.aggregate(policies);

      expect(sessionControls.signInFrequency?.value).toBe(4);
      expect(sessionControls.signInFrequency?.type).toBe('hours');
      expect(sessionControls.signInFrequency?.source).toBe('p2');
    });

    it('8 hours vs 12 hours → 8 hours wins', () => {
      const policies = [
        policyWithSession('p1', 'P1', { signInFrequency: { value: 12, type: 'hours' } }),
        policyWithSession('p2', 'P2', { signInFrequency: { value: 8, type: 'hours' } }),
      ];

      const { sessionControls } = aggregator.aggregate(policies);

      expect(sessionControls.signInFrequency?.value).toBe(8);
      expect(sessionControls.signInFrequency?.type).toBe('hours');
      expect(sessionControls.signInFrequency?.source).toBe('p2');
    });

    it('1 day (24h) vs 12 hours → 12 hours wins', () => {
      const policies = [
        policyWithSession('p1', 'P1', { signInFrequency: { value: 1, type: 'days' } }),
        policyWithSession('p2', 'P2', { signInFrequency: { value: 12, type: 'hours' } }),
      ];

      const { sessionControls } = aggregator.aggregate(policies);

      expect(sessionControls.signInFrequency?.value).toBe(12);
      expect(sessionControls.signInFrequency?.type).toBe('hours');
    });
  });

  // ──────────────────────────────────────────────
  // Persistent browser — 'never' wins
  // ──────────────────────────────────────────────
  describe('persistent browser', () => {
    it('one says "always", another says "never" → "never" wins', () => {
      const policies = [
        policyWithSession('p1', 'P1', { persistentBrowser: 'always' }),
        policyWithSession('p2', 'P2', { persistentBrowser: 'never' }),
      ];

      const { sessionControls } = aggregator.aggregate(policies);

      expect(sessionControls.persistentBrowser?.mode).toBe('never');
      expect(sessionControls.persistentBrowser?.source).toBe('p2');
    });

    it('"never" first, "always" second → "never" preserved', () => {
      const policies = [
        policyWithSession('p1', 'P1', { persistentBrowser: 'never' }),
        policyWithSession('p2', 'P2', { persistentBrowser: 'always' }),
      ];

      const { sessionControls } = aggregator.aggregate(policies);

      expect(sessionControls.persistentBrowser?.mode).toBe('never');
      expect(sessionControls.persistentBrowser?.source).toBe('p1');
    });

    it('single "always" → preserved', () => {
      const policies = [
        policyWithSession('p1', 'P1', { persistentBrowser: 'always' }),
      ];

      const { sessionControls } = aggregator.aggregate(policies);

      expect(sessionControls.persistentBrowser?.mode).toBe('always');
    });
  });

  // ──────────────────────────────────────────────
  // No session controls
  // ──────────────────────────────────────────────
  describe('no session controls', () => {
    it('returns empty result when no policies have session controls', () => {
      const policies = [
        policyWithSession('p1', 'P1', undefined),
        policyWithSession('p2', 'P2', {}),
      ];

      const { sessionControls } = aggregator.aggregate(policies);

      expect(sessionControls.signInFrequency).toBeUndefined();
      expect(sessionControls.persistentBrowser).toBeUndefined();
      expect(sessionControls.cloudAppSecurity).toBeUndefined();
    });

    it('returns empty result for empty policy array', () => {
      const { sessionControls } = aggregator.aggregate([]);

      expect(Object.keys(sessionControls)).toHaveLength(0);
    });
  });

  // ──────────────────────────────────────────────
  // Mixed controls from different policies
  // ──────────────────────────────────────────────
  describe('mixed controls', () => {
    it('one policy has frequency, another has persistent browser → both preserved', () => {
      const policies = [
        policyWithSession('p1', 'P1', { signInFrequency: { value: 4, type: 'hours' } }),
        policyWithSession('p2', 'P2', { persistentBrowser: 'never' }),
      ];

      const { sessionControls } = aggregator.aggregate(policies);

      expect(sessionControls.signInFrequency?.value).toBe(4);
      expect(sessionControls.signInFrequency?.source).toBe('p1');
      expect(sessionControls.persistentBrowser?.mode).toBe('never');
      expect(sessionControls.persistentBrowser?.source).toBe('p2');
    });
  });

  // ──────────────────────────────────────────────
  // Cloud app security
  // ──────────────────────────────────────────────
  describe('cloud app security', () => {
    it('enables when any policy sets it', () => {
      const policies = [
        policyWithSession('p1', 'P1', { cloudAppSecurity: 'mcasConfigured' }),
      ];

      const { sessionControls } = aggregator.aggregate(policies);

      expect(sessionControls.cloudAppSecurity?.isEnabled).toBe(true);
      expect(sessionControls.cloudAppSecurity?.cloudAppSecurityType).toBe('mcasConfigured');
      expect(sessionControls.cloudAppSecurity?.source).toBe('p1');
    });
  });

  // ──────────────────────────────────────────────
  // Application enforced restrictions
  // ──────────────────────────────────────────────
  describe('application enforced restrictions', () => {
    it('enables when any policy sets it', () => {
      const policies = [
        policyWithSession('p1', 'P1', { applicationEnforcedRestrictions: true }),
      ];

      const { sessionControls } = aggregator.aggregate(policies);

      expect(sessionControls.applicationEnforcedRestrictions?.isEnabled).toBe(true);
      expect(sessionControls.applicationEnforcedRestrictions?.source).toBe('p1');
    });
  });

  // ──────────────────────────────────────────────
  // Source tracking
  // ──────────────────────────────────────────────
  describe('source tracking', () => {
    it('winning control records the correct source policy ID', () => {
      const policies = [
        policyWithSession('freq-long', 'Long Frequency', { signInFrequency: { value: 24, type: 'hours' } }),
        policyWithSession('freq-short', 'Short Frequency', { signInFrequency: { value: 1, type: 'hours' } }),
      ];

      const { sessionControls } = aggregator.aggregate(policies);

      expect(sessionControls.signInFrequency?.source).toBe('freq-short');
    });
  });

  // ──────────────────────────────────────────────
  // Trace quality
  // ──────────────────────────────────────────────
  describe('trace quality', () => {
    it('produces trace entries for session aggregation phase', () => {
      const policies = [
        policyWithSession('p1', 'P1', { signInFrequency: { value: 4, type: 'hours' } }),
      ];

      const { trace } = aggregator.aggregate(policies);

      expect(trace.length).toBeGreaterThan(0);
      for (const entry of trace) {
        expect(entry.phase).toBe('sessionAggregation');
      }
    });
  });
});
