// engine/conditions/AgentRiskMatcher.ts
//
// Evaluates the agentIdRiskLevels condition (ID Protection for agents).
// Direct list membership — no ordinal auto-escalation, same rule as every
// other risk matcher. Only agentIdentity sign-ins can match a configured
// agent risk condition; for any other identity type the condition fails
// (a policy gated on agent risk cannot apply to non-agent sign-ins).

import type { RiskLevel } from '../models/Policy';
import type { ConditionMatchResult } from '../models/EvaluationResult';
import type { SimulationContext } from '../models/SimulationContext';

export class AgentRiskMatcher {
  evaluate(context: SimulationContext, levels: RiskLevel[]): ConditionMatchResult {
    if ((context.identityType ?? 'user') !== 'agentIdentity') {
      return {
        conditionType: 'agentRisk',
        matches: false,
        reason: 'Agent risk condition cannot match non-agent sign-ins',
        phase: 'inclusion',
      };
    }

    const contextLevel = context.risk.agentRiskLevel ?? 'none';
    if (contextLevel !== 'none' && levels.includes(contextLevel)) {
      return {
        conditionType: 'agentRisk',
        matches: true,
        reason: `Agent risk "${contextLevel}" is in the policy's targeted levels`,
        phase: 'inclusion',
        details: { matchedLevel: contextLevel },
      };
    }

    return {
      conditionType: 'agentRisk',
      matches: false,
      reason: contextLevel === 'none'
        ? 'Scenario has no agent risk; policy requires one of: ' + levels.join(', ')
        : `Agent risk "${contextLevel}" is not in the policy's targeted levels (${levels.join(', ')})`,
      phase: 'inclusion',
      details: { targetedLevels: levels },
    };
  }
}
