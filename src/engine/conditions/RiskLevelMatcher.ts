// engine/conditions/RiskLevelMatcher.ts

import type { ConditionMatcher } from './ConditionMatcher';
import type { RiskLevel } from '../models/Policy';
import type { ConditionMatchResult } from '../models/EvaluationResult';
import type { SimulationContext } from '../models/SimulationContext';

export interface RiskCondition {
  signInRiskLevels: RiskLevel[];
  userRiskLevels: RiskLevel[];
}

/**
 * Evaluates sign-in risk and user risk conditions of a Conditional Access policy.
 *
 * Important clarification on ordinal behavior:
 * The Graph API stores risk levels as explicit lists (e.g., ['medium', 'high']).
 * Microsoft's UI auto-selects "medium and above" but the API stores the individual values.
 * Therefore, this matcher checks direct membership: is the context's risk level IN the
 * policy's risk levels array? It does NOT auto-escalate (e.g., ['medium'] does NOT
 * auto-include 'high').
 *
 * Both signInRiskLevels and userRiskLevels must independently match.
 * Empty arrays = unconfigured = matches all risk levels.
 */
export class RiskLevelMatcher implements ConditionMatcher<RiskCondition> {
  evaluate(context: SimulationContext, condition: RiskCondition): ConditionMatchResult {
    const signInResult = this.matchRiskLevel(
      context.risk.signInRiskLevel,
      condition.signInRiskLevels,
      'signInRisk',
    );

    const userResult = this.matchRiskLevel(
      context.risk.userRiskLevel,
      condition.userRiskLevels,
      'userRisk',
    );

    // Both must match (AND logic across risk types)
    if (!signInResult.matches) {
      return signInResult;
    }
    if (!userResult.matches) {
      return userResult;
    }

    // Both matched — build a combined result
    return this.buildCombinedResult(signInResult, userResult, condition);
  }

  private matchRiskLevel(
    contextLevel: RiskLevel | 'none',
    policyLevels: RiskLevel[],
    riskType: 'signInRisk' | 'userRisk',
  ): ConditionMatchResult {
    const label = riskType === 'signInRisk' ? 'Sign-in risk' : 'User risk';

    // Empty array = unconfigured = matches all
    if (policyLevels.length === 0) {
      return {
        conditionType: riskType,
        matches: true,
        reason: `${label} condition is unconfigured — matches all risk levels`,
        phase: 'notConfigured',
      };
    }

    // Direct membership check: is the context level in the policy's list?
    if (policyLevels.includes(contextLevel as RiskLevel)) {
      return {
        conditionType: riskType,
        matches: true,
        reason: `${label} level "${contextLevel}" is in the policy's targeted levels`,
        phase: 'inclusion',
        details: { matchedLevel: contextLevel, policyLevels },
      };
    }

    return {
      conditionType: riskType,
      matches: false,
      reason: `${label} level "${contextLevel}" is not in the policy's targeted levels [${policyLevels.join(', ')}]`,
      phase: 'inclusion',
      details: { contextLevel, policyLevels },
    };
  }

  private buildCombinedResult(
    signInResult: ConditionMatchResult,
    userResult: ConditionMatchResult,
    condition: RiskCondition,
  ): ConditionMatchResult {
    const signInConfigured = condition.signInRiskLevels.length > 0;
    const userConfigured = condition.userRiskLevels.length > 0;

    // If neither is configured, return unconfigured
    if (!signInConfigured && !userConfigured) {
      return {
        conditionType: 'risk',
        matches: true,
        reason: 'Risk condition is unconfigured — matches all risk levels',
        phase: 'notConfigured',
      };
    }

    // Build a descriptive combined reason
    const parts: string[] = [];
    if (signInConfigured) {
      parts.push(signInResult.reason);
    }
    if (userConfigured) {
      parts.push(userResult.reason);
    }

    return {
      conditionType: 'risk',
      matches: true,
      reason: parts.join('; '),
      phase: 'inclusion',
      details: {
        signIn: signInConfigured ? signInResult.details : undefined,
        user: userConfigured ? userResult.details : undefined,
      },
    };
  }
}
