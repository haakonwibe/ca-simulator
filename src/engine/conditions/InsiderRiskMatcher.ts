// engine/conditions/InsiderRiskMatcher.ts

import type { ConditionMatcher } from './ConditionMatcher';
import type { InsiderRiskLevel } from '../models/Policy';
import type { ConditionMatchResult } from '../models/EvaluationResult';
import type { SimulationContext } from '../models/SimulationContext';

/**
 * Evaluates the insider risk condition of a Conditional Access policy.
 *
 * Insider risk integrates with Microsoft Purview Adaptive Protection and uses
 * different level names than sign-in/user risk: 'minor', 'moderate', 'elevated'.
 *
 * Matching behavior: direct list membership (same as RiskLevelMatcher).
 * The Graph API stores explicit arrays like ['moderate', 'elevated'].
 * Empty or undefined array = unconfigured = matches all.
 */
export class InsiderRiskMatcher implements ConditionMatcher<InsiderRiskLevel[]> {
  evaluate(context: SimulationContext, condition: InsiderRiskLevel[]): ConditionMatchResult {
    // Empty array = unconfigured = matches all
    if (condition.length === 0) {
      return {
        conditionType: 'insiderRisk',
        matches: true,
        reason: 'Insider risk condition is unconfigured — matches all risk levels',
        phase: 'notConfigured',
      };
    }

    const contextLevel = context.risk.insiderRiskLevel;

    // Direct membership check
    if (condition.includes(contextLevel as InsiderRiskLevel)) {
      return {
        conditionType: 'insiderRisk',
        matches: true,
        reason: `Insider risk level "${contextLevel}" is in the policy's targeted levels`,
        phase: 'inclusion',
        details: { matchedLevel: contextLevel, policyLevels: condition },
      };
    }

    return {
      conditionType: 'insiderRisk',
      matches: false,
      reason: `Insider risk level "${contextLevel}" is not in the policy's targeted levels [${condition.join(', ')}]`,
      phase: 'inclusion',
      details: { contextLevel, policyLevels: condition },
    };
  }
}
