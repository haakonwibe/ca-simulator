// engine/conditions/ClientAppMatcher.ts

import type { ConditionMatcher } from './ConditionMatcher';
import type { ClientAppType } from '../models/Policy';
import type { ConditionMatchResult } from '../models/EvaluationResult';
import type { SimulationContext } from '../models/SimulationContext';

/**
 * Evaluates the client application type condition of a Conditional Access policy.
 *
 * This is the simplest matcher — no exclusion logic, just list membership.
 *
 * Critical behavior (Hard-Won Lesson #7):
 * - Empty clientAppTypes array → matches ALL client app types
 * - This is the most common mistake: missing this default causes policies to silently not match.
 */
export class ClientAppMatcher implements ConditionMatcher<ClientAppType[]> {
  evaluate(context: SimulationContext, condition: ClientAppType[]): ConditionMatchResult {
    // Empty array = unconfigured = matches all client app types
    if (condition.length === 0) {
      return {
        conditionType: 'clientAppTypes',
        matches: true,
        reason: 'Client app type condition is unconfigured (empty) — matches all client app types',
        phase: 'unconfigured',
      };
    }

    // Check for 'all' keyword (treated same as empty: matches everything)
    // Graph API may use 'all' as an explicit value
    if ((condition as string[]).includes('all')) {
      return {
        conditionType: 'clientAppTypes',
        matches: true,
        reason: 'Client app type condition includes "all" — matches all client app types',
        phase: 'inclusion',
      };
    }

    // Direct membership check
    if (condition.includes(context.clientAppType)) {
      return {
        conditionType: 'clientAppTypes',
        matches: true,
        reason: `Client app type "${context.clientAppType}" is in the policy's client app types list`,
        phase: 'inclusion',
        details: { matchedClientAppType: context.clientAppType },
      };
    }

    return {
      conditionType: 'clientAppTypes',
      matches: false,
      reason: `Client app type "${context.clientAppType}" is not in the policy's client app types list`,
      phase: 'inclusion',
      details: {
        contextClientAppType: context.clientAppType,
        policyClientAppTypes: condition,
      },
    };
  }
}
