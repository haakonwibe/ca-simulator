// DevicePlatformMatcher tests

import { describe, it, expect } from 'vitest';
import { DevicePlatformMatcher } from '../../conditions/DevicePlatformMatcher';
import { createTestContext } from '../fixtures/testScenarios';
import type { PlatformCondition } from '../../models/Policy';

const matcher = new DevicePlatformMatcher();

function createPlatformCondition(overrides?: Partial<PlatformCondition>): PlatformCondition {
  return {
    includePlatforms: [],
    ...overrides,
  };
}

const WINDOWS_CONTEXT = createTestContext({ device: { platform: 'windows' } });
const IOS_CONTEXT = createTestContext({ device: { platform: 'iOS' } });
const ANDROID_CONTEXT = createTestContext({ device: { platform: 'android' } });
const MACOS_CONTEXT = createTestContext({ device: { platform: 'macOS' } });
const NO_PLATFORM_CONTEXT = createTestContext({ device: {} });

describe('DevicePlatformMatcher', () => {
  // ──────────────────────────────────────────────
  // 'all' inclusion
  // ──────────────────────────────────────────────
  describe('includePlatforms: ["all"]', () => {
    const condition = createPlatformCondition({ includePlatforms: ['all'] });

    it('matches windows', () => {
      expect(matcher.evaluate(WINDOWS_CONTEXT, condition).matches).toBe(true);
    });

    it('matches iOS', () => {
      expect(matcher.evaluate(IOS_CONTEXT, condition).matches).toBe(true);
    });

    it('matches undefined platform', () => {
      const result = matcher.evaluate(NO_PLATFORM_CONTEXT, condition);
      expect(result.matches).toBe(true);
      expect(result.reason).toContain('Undefined platform');
    });
  });

  // ──────────────────────────────────────────────
  // Specific platform inclusion
  // ──────────────────────────────────────────────
  describe('specific platform inclusion', () => {
    it('matches when platform is in includePlatforms', () => {
      const condition = createPlatformCondition({ includePlatforms: ['windows', 'macOS'] });
      const result = matcher.evaluate(WINDOWS_CONTEXT, condition);

      expect(result.matches).toBe(true);
      expect(result.details?.matchedPlatform).toBe('windows');
    });

    it('does not match when platform is not in includePlatforms', () => {
      const condition = createPlatformCondition({ includePlatforms: ['iOS', 'android'] });
      const result = matcher.evaluate(WINDOWS_CONTEXT, condition);

      expect(result.matches).toBe(false);
    });

    it('is case-insensitive (Hard-Won Lesson #14)', () => {
      // Graph returns lowercase, but we should handle mixed case defensively
      const condition = createPlatformCondition({ includePlatforms: ['Windows'] });
      const result = matcher.evaluate(WINDOWS_CONTEXT, condition);

      expect(result.matches).toBe(true);
    });

    it('handles iOS casing correctly', () => {
      const condition = createPlatformCondition({ includePlatforms: ['ios'] });
      const result = matcher.evaluate(IOS_CONTEXT, condition);

      expect(result.matches).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // Undefined platform
  // ──────────────────────────────────────────────
  describe('undefined platform in context', () => {
    it('does NOT match policies targeting specific platforms', () => {
      const condition = createPlatformCondition({ includePlatforms: ['windows', 'iOS'] });
      const result = matcher.evaluate(NO_PLATFORM_CONTEXT, condition);

      expect(result.matches).toBe(false);
      expect(result.reason).toContain('not specified');
    });

    it('matches policies with includePlatforms: ["all"]', () => {
      const condition = createPlatformCondition({ includePlatforms: ['all'] });
      const result = matcher.evaluate(NO_PLATFORM_CONTEXT, condition);

      expect(result.matches).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // Exclusion wins
  // ──────────────────────────────────────────────
  describe('exclusion overrides inclusion', () => {
    it('excludes platform even when in includePlatforms', () => {
      const condition = createPlatformCondition({
        includePlatforms: ['all'],
        excludePlatforms: ['android'],
      });
      const result = matcher.evaluate(ANDROID_CONTEXT, condition);

      expect(result.matches).toBe(false);
      expect(result.phase).toBe('exclusion');
      expect(result.details?.excludedPlatform).toBe('android');
    });

    it('does not exclude platforms not in excludePlatforms', () => {
      const condition = createPlatformCondition({
        includePlatforms: ['all'],
        excludePlatforms: ['android'],
      });
      const result = matcher.evaluate(WINDOWS_CONTEXT, condition);

      expect(result.matches).toBe(true);
    });

    it('exclusion is case-insensitive', () => {
      const condition = createPlatformCondition({
        includePlatforms: ['all'],
        excludePlatforms: ['MacOS'], // mixed case
      });
      const result = matcher.evaluate(MACOS_CONTEXT, condition);

      expect(result.matches).toBe(false);
      expect(result.phase).toBe('exclusion');
    });

    it('undefined platform is not affected by specific exclusions', () => {
      const condition = createPlatformCondition({
        includePlatforms: ['all'],
        excludePlatforms: ['windows'],
      });
      const result = matcher.evaluate(NO_PLATFORM_CONTEXT, condition);

      expect(result.matches).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // Empty includePlatforms (edge case)
  // ──────────────────────────────────────────────
  describe('empty includePlatforms', () => {
    it('does not match any platform (empty array is not the same as unconfigured condition)', () => {
      // Note: unconfigured means conditions.platforms is undefined on the policy,
      // which means the PolicyEvaluator skips this matcher. If the matcher IS called
      // with an empty includePlatforms, that's an unusual state — treat as no match.
      const condition = createPlatformCondition({ includePlatforms: [] });
      const result = matcher.evaluate(WINDOWS_CONTEXT, condition);

      expect(result.matches).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // Trace quality
  // ──────────────────────────────────────────────
  describe('trace quality', () => {
    it('always returns conditionType "platforms"', () => {
      const condition = createPlatformCondition({ includePlatforms: ['all'] });
      const result = matcher.evaluate(WINDOWS_CONTEXT, condition);

      expect(result.conditionType).toBe('platforms');
    });
  });
});
