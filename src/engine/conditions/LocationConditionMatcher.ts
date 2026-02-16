// engine/conditions/LocationConditionMatcher.ts

import type { ConditionMatcher } from './ConditionMatcher';
import type { LocationCondition } from '../models/Policy';
import type { ConditionMatchResult } from '../models/EvaluationResult';
import type { SimulationContext } from '../models/SimulationContext';

/**
 * Evaluates the location condition of a Conditional Access policy.
 *
 * Special location values:
 * - 'All' in includeLocations → matches all locations
 * - 'AllTrusted' in includeLocations → matches only if isTrustedLocation === true
 * - 'AllTrusted' in excludeLocations → excludes trusted locations
 *
 * Common pattern: include: ['All'], exclude: ['AllTrusted'] = "untrusted locations only"
 *
 * When context.location has no namedLocationId and isTrustedLocation is undefined:
 * - Matches 'All'
 * - Does NOT match 'AllTrusted' or specific named location IDs
 */
export class LocationConditionMatcher implements ConditionMatcher<LocationCondition> {
  evaluate(context: SimulationContext, condition: LocationCondition): ConditionMatchResult {
    // Step 1: Check exclusions first (exclusion always wins)
    const exclusionResult = this.checkExclusions(context, condition);
    if (exclusionResult) {
      return exclusionResult;
    }

    // Step 2: Check inclusions
    return this.checkInclusions(context, condition);
  }

  private checkExclusions(context: SimulationContext, condition: LocationCondition): ConditionMatchResult | null {
    if (condition.excludeLocations.length === 0) {
      return null;
    }

    // 'AllTrusted' exclusion: exclude if the location is trusted
    if (condition.excludeLocations.includes('AllTrusted')) {
      if (context.location.isTrustedLocation === true) {
        return {
          conditionType: 'locations',
          matches: false,
          reason: 'Trusted location is excluded via "AllTrusted" exclusion',
          phase: 'exclusion',
          details: { excludedByTrusted: true },
        };
      }
    }

    // Specific named location ID exclusion
    if (context.location.namedLocationId) {
      if (condition.excludeLocations.includes(context.location.namedLocationId)) {
        return {
          conditionType: 'locations',
          matches: false,
          reason: `Named location "${context.location.namedLocationId}" is excluded`,
          phase: 'exclusion',
          details: { excludedLocationId: context.location.namedLocationId },
        };
      }
    }

    return null;
  }

  private checkInclusions(context: SimulationContext, condition: LocationCondition): ConditionMatchResult {
    // Unconfigured: empty includeLocations → matches all locations (Golden Rule #5)
    if (condition.includeLocations.length === 0) {
      return {
        conditionType: 'locations',
        matches: true,
        reason: 'Location condition is unconfigured — matches all locations by default',
        phase: 'notConfigured',
      };
    }

    // 'All' → matches all locations regardless of context
    if (condition.includeLocations.includes('All')) {
      return {
        conditionType: 'locations',
        matches: true,
        reason: 'Policy targets "All" locations',
        phase: 'inclusion',
      };
    }

    // 'AllTrusted' → matches only if trusted
    if (condition.includeLocations.includes('AllTrusted')) {
      if (context.location.isTrustedLocation === true) {
        return {
          conditionType: 'locations',
          matches: true,
          reason: 'Location matches "AllTrusted" inclusion (trusted location)',
          phase: 'inclusion',
        };
      }
    }

    // Specific named location ID
    if (context.location.namedLocationId) {
      if (condition.includeLocations.includes(context.location.namedLocationId)) {
        return {
          conditionType: 'locations',
          matches: true,
          reason: `Named location "${context.location.namedLocationId}" is in the included locations list`,
          phase: 'inclusion',
          details: { matchedLocationId: context.location.namedLocationId },
        };
      }
    }

    return {
      conditionType: 'locations',
      matches: false,
      reason: 'Location does not match any inclusion criteria',
      phase: 'inclusion',
      details: {
        contextLocation: {
          namedLocationId: context.location.namedLocationId,
          isTrusted: context.location.isTrustedLocation,
        },
        targetedLocations: condition.includeLocations,
      },
    };
  }
}
