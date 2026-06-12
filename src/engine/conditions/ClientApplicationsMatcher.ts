// engine/conditions/ClientApplicationsMatcher.ts
//
// Evaluates agent identity targeting (conditions.clientApplications) for
// agentIdentity sign-ins. Standard exclusion-wins semantics over
// includeAgentIdServicePrincipals / excludeAgentIdServicePrincipals
// ('All' or specific agent service principal ids).
//
// The agentIdServicePrincipalFilter (custom security attributes) is NOT
// evaluated in v0.6.6 — when present, the match result carries a
// filterNotEvaluated detail and the reason says so, rather than guessing.
//
// Workload identities (includeServicePrincipals) are out of scope; this
// matcher only handles the agent lists. The PolicyEvaluator guarantees this
// matcher is only called for agentIdentity contexts.

import type { ClientApplicationsCondition } from '../models/Policy';
import type { ConditionMatchResult } from '../models/EvaluationResult';
import type { SimulationContext } from '../models/SimulationContext';

export class ClientApplicationsMatcher {
  evaluate(context: SimulationContext, condition: ClientApplicationsCondition): ConditionMatchResult {
    const agent = context.agent;
    const agentLabel = agent?.displayName ?? 'Agent';
    const include = condition.includeAgentIdServicePrincipals ?? [];
    const exclude = condition.excludeAgentIdServicePrincipals ?? [];

    // Step 1: exclusion always wins
    if (exclude.includes('All')) {
      return {
        conditionType: 'clientApplications',
        matches: false,
        reason: `${agentLabel} is excluded — policy excludes all agent identities`,
        phase: 'exclusion',
      };
    }
    if (agent && exclude.includes(agent.servicePrincipalId)) {
      return {
        conditionType: 'clientApplications',
        matches: false,
        reason: `${agentLabel} is directly excluded by agent identity`,
        phase: 'exclusion',
        details: { excludedById: agent.servicePrincipalId },
      };
    }

    // Step 2: inclusion
    const included =
      include.includes('All') ||
      (agent !== undefined && include.includes(agent.servicePrincipalId));

    if (!included) {
      return {
        conditionType: 'clientApplications',
        matches: false,
        reason: `${agentLabel} is not in the policy's agent identity targets`,
        phase: 'inclusion',
        details: { targetedAgents: include },
      };
    }

    const filterNote = condition.agentIdServicePrincipalFilter
      ? ' (attribute filter present — not evaluated)'
      : '';
    return {
      conditionType: 'clientApplications',
      matches: true,
      reason: include.includes('All')
        ? `${agentLabel} matches "All agent identities"${filterNote}`
        : `${agentLabel} is directly targeted by agent identity${filterNote}`,
      phase: 'inclusion',
      details: condition.agentIdServicePrincipalFilter
        ? { filterNotEvaluated: true, filterRule: condition.agentIdServicePrincipalFilter.rule }
        : undefined,
    };
  }
}
