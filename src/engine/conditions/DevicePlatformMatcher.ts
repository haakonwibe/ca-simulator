// engine/conditions/DevicePlatformMatcher.ts

import type { ConditionMatcher } from './ConditionMatcher';
import type { PlatformCondition } from '../models/Policy';
import type { ConditionMatchResult } from '../models/EvaluationResult';
import type { SimulationContext } from '../models/SimulationContext';

/**
 * Evaluates the device platform condition of a Conditional Access policy.
 *
 * Platform matching rules:
 * - includePlatforms: ['all'] → matches any platform, including undefined
 * - Specific platforms → case-insensitive match against context.device.platform
 * - Undefined platform in context → matches 'all' only, NOT specific platforms
 * - Exclusion always wins over inclusion
 *
 * Note: When conditions.platforms is undefined on the policy, the PolicyEvaluator
 * should skip this matcher entirely (unconfigured = matches all per Golden Rule #5).
 * But if called with an undefined platform, this matcher handles it gracefully.
 */
export class DevicePlatformMatcher implements ConditionMatcher<PlatformCondition> {
  evaluate(context: SimulationContext, condition: PlatformCondition): ConditionMatchResult {
    const contextPlatform = context.device.platform?.toLowerCase();

    // Step 1: Check exclusions first (exclusion always wins)
    const exclusionResult = this.checkExclusions(contextPlatform, condition);
    if (exclusionResult) {
      return exclusionResult;
    }

    // Step 2: Check inclusions
    return this.checkInclusions(contextPlatform, condition);
  }

  private checkExclusions(
    contextPlatform: string | undefined,
    condition: PlatformCondition,
  ): ConditionMatchResult | null {
    if (!condition.excludePlatforms || condition.excludePlatforms.length === 0) {
      return null;
    }

    // If platform is undefined, it can't be in an exclusion list of specific platforms
    if (!contextPlatform) {
      return null;
    }

    const excludeNormalized = condition.excludePlatforms.map((p) => p.toLowerCase());

    if (excludeNormalized.includes(contextPlatform)) {
      return {
        conditionType: 'platforms',
        matches: false,
        reason: `Platform "${contextPlatform}" is excluded`,
        phase: 'exclusion',
        details: { excludedPlatform: contextPlatform },
      };
    }

    return null;
  }

  private checkInclusions(
    contextPlatform: string | undefined,
    condition: PlatformCondition,
  ): ConditionMatchResult {
    const includeNormalized = condition.includePlatforms.map((p) => p.toLowerCase());

    // 'all' matches any platform, including undefined
    if (includeNormalized.includes('all')) {
      return {
        conditionType: 'platforms',
        matches: true,
        reason: contextPlatform
          ? `Platform "${contextPlatform}" matches "all" platforms inclusion`
          : 'Undefined platform matches "all" platforms inclusion',
        phase: 'inclusion',
      };
    }

    // If platform is undefined, it does NOT match specific platform targets
    if (!contextPlatform) {
      return {
        conditionType: 'platforms',
        matches: false,
        reason: 'Platform is not specified and policy targets specific platforms',
        phase: 'inclusion',
        details: { targetedPlatforms: condition.includePlatforms },
      };
    }

    // Check specific platform match
    if (includeNormalized.includes(contextPlatform)) {
      return {
        conditionType: 'platforms',
        matches: true,
        reason: `Platform "${contextPlatform}" is in the included platforms list`,
        phase: 'inclusion',
        details: { matchedPlatform: contextPlatform },
      };
    }

    return {
      conditionType: 'platforms',
      matches: false,
      reason: `Platform "${contextPlatform}" is not in the included platforms list`,
      phase: 'inclusion',
      details: { targetedPlatforms: condition.includePlatforms },
    };
  }
}
