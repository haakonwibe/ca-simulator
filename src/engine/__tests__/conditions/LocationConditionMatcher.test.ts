// LocationConditionMatcher tests

import { describe, it, expect } from 'vitest';
import { LocationConditionMatcher } from '../../conditions/LocationConditionMatcher';
import { createTestContext } from '../fixtures/testScenarios';
import type { LocationCondition } from '../../models/Policy';

const matcher = new LocationConditionMatcher();

function createLocationCondition(overrides?: Partial<LocationCondition>): LocationCondition {
  return {
    includeLocations: [],
    excludeLocations: [],
    ...overrides,
  };
}

const TRUSTED_LOCATION_CONTEXT = createTestContext({
  location: { namedLocationId: 'loc-office', isTrustedLocation: true },
});
const UNTRUSTED_LOCATION_CONTEXT = createTestContext({
  location: { namedLocationId: 'loc-coffee-shop', isTrustedLocation: false },
});
const NAMED_ONLY_CONTEXT = createTestContext({
  location: { namedLocationId: 'loc-vpn' },
});
const EMPTY_LOCATION_CONTEXT = createTestContext({
  location: {},
});

describe('LocationConditionMatcher', () => {
  // ──────────────────────────────────────────────
  // 'All' inclusion
  // ──────────────────────────────────────────────
  describe('includeLocations: ["All"]', () => {
    const condition = createLocationCondition({ includeLocations: ['All'] });

    it('matches trusted locations', () => {
      expect(matcher.evaluate(TRUSTED_LOCATION_CONTEXT, condition).matches).toBe(true);
    });

    it('matches untrusted locations', () => {
      expect(matcher.evaluate(UNTRUSTED_LOCATION_CONTEXT, condition).matches).toBe(true);
    });

    it('matches when location context is empty', () => {
      expect(matcher.evaluate(EMPTY_LOCATION_CONTEXT, condition).matches).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // 'AllTrusted' inclusion
  // ──────────────────────────────────────────────
  describe('includeLocations: ["AllTrusted"]', () => {
    const condition = createLocationCondition({ includeLocations: ['AllTrusted'] });

    it('matches trusted locations', () => {
      const result = matcher.evaluate(TRUSTED_LOCATION_CONTEXT, condition);
      expect(result.matches).toBe(true);
      expect(result.reason).toContain('AllTrusted');
    });

    it('does not match untrusted locations', () => {
      expect(matcher.evaluate(UNTRUSTED_LOCATION_CONTEXT, condition).matches).toBe(false);
    });

    it('does not match when isTrustedLocation is undefined', () => {
      expect(matcher.evaluate(NAMED_ONLY_CONTEXT, condition).matches).toBe(false);
    });

    it('does not match empty location context', () => {
      expect(matcher.evaluate(EMPTY_LOCATION_CONTEXT, condition).matches).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // 'AllTrusted' exclusion (the common pattern)
  // ──────────────────────────────────────────────
  describe('include: ["All"], exclude: ["AllTrusted"] — untrusted only pattern', () => {
    const condition = createLocationCondition({
      includeLocations: ['All'],
      excludeLocations: ['AllTrusted'],
    });

    it('excludes trusted locations', () => {
      const result = matcher.evaluate(TRUSTED_LOCATION_CONTEXT, condition);
      expect(result.matches).toBe(false);
      expect(result.phase).toBe('exclusion');
    });

    it('matches untrusted locations', () => {
      const result = matcher.evaluate(UNTRUSTED_LOCATION_CONTEXT, condition);
      expect(result.matches).toBe(true);
    });

    it('matches when trust status is unknown (not explicitly trusted)', () => {
      const result = matcher.evaluate(NAMED_ONLY_CONTEXT, condition);
      expect(result.matches).toBe(true);
    });

    it('matches empty location context (not trusted)', () => {
      const result = matcher.evaluate(EMPTY_LOCATION_CONTEXT, condition);
      expect(result.matches).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // Specific named location ID
  // ──────────────────────────────────────────────
  describe('specific named location IDs', () => {
    it('matches when namedLocationId is in includeLocations', () => {
      const condition = createLocationCondition({
        includeLocations: ['loc-office', 'loc-vpn'],
      });
      const result = matcher.evaluate(TRUSTED_LOCATION_CONTEXT, condition);

      expect(result.matches).toBe(true);
      expect(result.details?.matchedLocationId).toBe('loc-office');
    });

    it('does not match when namedLocationId is not in includeLocations', () => {
      const condition = createLocationCondition({
        includeLocations: ['loc-headquarters'],
      });
      const result = matcher.evaluate(TRUSTED_LOCATION_CONTEXT, condition);

      expect(result.matches).toBe(false);
    });

    it('does not match empty location context against specific IDs', () => {
      const condition = createLocationCondition({
        includeLocations: ['loc-office'],
      });
      const result = matcher.evaluate(EMPTY_LOCATION_CONTEXT, condition);

      expect(result.matches).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // Specific named location exclusion
  // ──────────────────────────────────────────────
  describe('specific named location exclusion', () => {
    it('excludes when namedLocationId is in excludeLocations', () => {
      const condition = createLocationCondition({
        includeLocations: ['All'],
        excludeLocations: ['loc-office'],
      });
      const result = matcher.evaluate(TRUSTED_LOCATION_CONTEXT, condition);

      expect(result.matches).toBe(false);
      expect(result.phase).toBe('exclusion');
      expect(result.details?.excludedLocationId).toBe('loc-office');
    });
  });

  // ──────────────────────────────────────────────
  // Unconfigured (empty)
  // ──────────────────────────────────────────────
  describe('unconfigured condition', () => {
    it('matches all locations when includeLocations is empty', () => {
      const condition = createLocationCondition();
      const result = matcher.evaluate(TRUSTED_LOCATION_CONTEXT, condition);

      expect(result.matches).toBe(true);
      expect(result.phase).toBe('notConfigured');
    });

    it('matches empty location context when unconfigured', () => {
      const condition = createLocationCondition();
      const result = matcher.evaluate(EMPTY_LOCATION_CONTEXT, condition);

      expect(result.matches).toBe(true);
      expect(result.phase).toBe('notConfigured');
    });
  });

  // ──────────────────────────────────────────────
  // Trace quality
  // ──────────────────────────────────────────────
  describe('trace quality', () => {
    it('always returns conditionType "locations"', () => {
      const condition = createLocationCondition({ includeLocations: ['All'] });
      const result = matcher.evaluate(TRUSTED_LOCATION_CONTEXT, condition);

      expect(result.conditionType).toBe('locations');
    });

    it('always returns a non-empty reason', () => {
      const condition = createLocationCondition({ includeLocations: ['loc-unknown'] });
      const result = matcher.evaluate(EMPTY_LOCATION_CONTEXT, condition);

      expect(result.reason).toBeTruthy();
    });
  });
});
