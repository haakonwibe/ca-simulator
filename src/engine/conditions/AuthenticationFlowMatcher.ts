// engine/conditions/AuthenticationFlowMatcher.ts

import type { ConditionMatcher } from './ConditionMatcher';
import type { AuthenticationFlowCondition } from '../models/Policy';
import type { ConditionMatchResult } from '../models/EvaluationResult';
import type { SimulationContext } from '../models/SimulationContext';

/**
 * Evaluates the authentication flows condition of a Conditional Access policy.
 *
 * Authentication flows is inclusion-only (no exclusions). When configured,
 * it targets specific transfer methods like device code flow or authentication
 * transfer. Policies with this condition only apply when the sign-in uses
 * one of the targeted flows.
 */
export class AuthenticationFlowMatcher implements ConditionMatcher<AuthenticationFlowCondition> {
  evaluate(context: SimulationContext, condition: AuthenticationFlowCondition): ConditionMatchResult {
    // Defensive: if transferMethods is not an array, treat as not configured
    if (!condition.transferMethods || !Array.isArray(condition.transferMethods)) {
      return {
        conditionType: 'authenticationFlows',
        matches: true,
        reason: 'Authentication flows condition has invalid transferMethods — treating as not configured',
        phase: 'notConfigured',
      };
    }

    // Not configured or empty transferMethods → matches all flows
    if (condition.transferMethods.length === 0) {
      return {
        conditionType: 'authenticationFlows',
        matches: true,
        reason: 'Authentication flows condition is not configured — matches all flows',
        phase: 'notConfigured',
      };
    }

    const flow = context.authenticationFlow ?? 'none';

    // Normal sign-in does not match a policy targeting specific flows
    if (flow === 'none') {
      return {
        conditionType: 'authenticationFlows',
        matches: false,
        reason: `Authentication flow 'none' is not in the policy's targeted flows [${condition.transferMethods.join(', ')}]`,
        phase: 'inclusion',
        details: {
          contextFlow: flow,
          policyTransferMethods: condition.transferMethods,
        },
      };
    }

    // Check if the context's flow is in the targeted list
    if (condition.transferMethods.includes(flow)) {
      return {
        conditionType: 'authenticationFlows',
        matches: true,
        reason: `Authentication flow '${flow}' is targeted by this policy`,
        phase: 'inclusion',
        details: { matchedFlow: flow },
      };
    }

    return {
      conditionType: 'authenticationFlows',
      matches: false,
      reason: `Authentication flow '${flow}' is not in the policy's targeted flows [${condition.transferMethods.join(', ')}]`,
      phase: 'inclusion',
      details: {
        contextFlow: flow,
        policyTransferMethods: condition.transferMethods,
      },
    };
  }
}
