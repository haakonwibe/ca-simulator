// ClientAppMatcher tests

import { describe, it, expect } from 'vitest';
import { ClientAppMatcher } from '../../conditions/ClientAppMatcher';
import { createTestContext } from '../fixtures/testScenarios';
import type { ClientAppType } from '../../models/Policy';

const matcher = new ClientAppMatcher();

const BROWSER_CONTEXT = createTestContext({ clientAppType: 'browser' });
const MOBILE_CONTEXT = createTestContext({ clientAppType: 'mobileAppsAndDesktopClients' });
const EAS_CONTEXT = createTestContext({ clientAppType: 'exchangeActiveSync' });
const OTHER_CONTEXT = createTestContext({ clientAppType: 'other' });

describe('ClientAppMatcher', () => {
  // ──────────────────────────────────────────────
  // Specific type matching
  // ──────────────────────────────────────────────
  describe('specific client app type matching', () => {
    it('matches when context type is in the list', () => {
      const condition: ClientAppType[] = ['browser', 'mobileAppsAndDesktopClients'];
      const result = matcher.evaluate(BROWSER_CONTEXT, condition);

      expect(result.matches).toBe(true);
      expect(result.details?.matchedClientAppType).toBe('browser');
    });

    it('does not match when context type is not in the list', () => {
      const condition: ClientAppType[] = ['browser', 'mobileAppsAndDesktopClients'];
      const result = matcher.evaluate(EAS_CONTEXT, condition);

      expect(result.matches).toBe(false);
    });

    it('matches exchangeActiveSync specifically', () => {
      const condition: ClientAppType[] = ['exchangeActiveSync'];
      const result = matcher.evaluate(EAS_CONTEXT, condition);

      expect(result.matches).toBe(true);
    });

    it('matches "other" client app type', () => {
      const condition: ClientAppType[] = ['other'];
      const result = matcher.evaluate(OTHER_CONTEXT, condition);

      expect(result.matches).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // Empty array — matches everything (Hard-Won Lesson #7)
  // ──────────────────────────────────────────────
  describe('empty array (unconfigured)', () => {
    const condition: ClientAppType[] = [];

    it('matches browser', () => {
      const result = matcher.evaluate(BROWSER_CONTEXT, condition);
      expect(result.matches).toBe(true);
      expect(result.phase).toBe('unconfigured');
    });

    it('matches mobile apps', () => {
      expect(matcher.evaluate(MOBILE_CONTEXT, condition).matches).toBe(true);
    });

    it('matches exchange active sync', () => {
      expect(matcher.evaluate(EAS_CONTEXT, condition).matches).toBe(true);
    });

    it('matches other', () => {
      expect(matcher.evaluate(OTHER_CONTEXT, condition).matches).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // 'all' keyword — matches everything
  // ──────────────────────────────────────────────
  describe('"all" keyword', () => {
    // Graph API may use 'all' as an explicit value
    const condition = ['all'] as unknown as ClientAppType[];

    it('matches browser', () => {
      const result = matcher.evaluate(BROWSER_CONTEXT, condition);
      expect(result.matches).toBe(true);
      expect(result.phase).toBe('inclusion');
    });

    it('matches mobile apps', () => {
      expect(matcher.evaluate(MOBILE_CONTEXT, condition).matches).toBe(true);
    });

    it('matches exchange active sync', () => {
      expect(matcher.evaluate(EAS_CONTEXT, condition).matches).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // Multiple types in array
  // ──────────────────────────────────────────────
  describe('multiple types', () => {
    it('matches any type in a multi-type list', () => {
      const condition: ClientAppType[] = ['browser', 'exchangeActiveSync', 'other'];

      expect(matcher.evaluate(BROWSER_CONTEXT, condition).matches).toBe(true);
      expect(matcher.evaluate(EAS_CONTEXT, condition).matches).toBe(true);
      expect(matcher.evaluate(OTHER_CONTEXT, condition).matches).toBe(true);
      expect(matcher.evaluate(MOBILE_CONTEXT, condition).matches).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // Trace quality
  // ──────────────────────────────────────────────
  describe('trace quality', () => {
    it('always returns conditionType "clientAppTypes"', () => {
      const result = matcher.evaluate(BROWSER_CONTEXT, ['browser']);
      expect(result.conditionType).toBe('clientAppTypes');
    });

    it('always returns a non-empty reason', () => {
      const result = matcher.evaluate(BROWSER_CONTEXT, ['exchangeActiveSync']);
      expect(result.reason).toBeTruthy();
    });
  });
});
