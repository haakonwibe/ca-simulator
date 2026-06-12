// engine/conditions/AgentRiskMatcher.ts
//
// Evaluates the agentIdRiskLevels condition (ID Protection for agents).
// Direct list membership — no ordinal auto-escalation, same rule as every
// other risk matcher. Agent risk applies to BOTH agent identities and
// agent user accounts (Microsoft's "Block risky agents' user accounts"
// recommendation applies the condition to agent-user policies); only
// plain user sign-ins fail a configured agent risk condition.

import type { RiskLevel } from '../models/Policy';
import type { ConditionMatchResult } from '../models/EvaluationResult';
import type { SimulationContext } from '../models/SimulationContext';

export class AgentRiskMatcher {
  evaluate(context: SimulationContext, levels: RiskLevel[]): ConditionMatchResult {
    if ((context.identityType ?? 'user') === 'user') {
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
