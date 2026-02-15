// engine/CAEngine.ts
// Top-level orchestrator for Conditional Access policy evaluation.

import type { ConditionalAccessPolicy } from './models/Policy';
import type { SimulationContext } from './models/SimulationContext';
import type { CAEngineResult, PolicyEvaluationResult, TraceEntry } from './models/EvaluationResult';
import { PolicyEvaluator } from './PolicyEvaluator';
import { GrantControlResolver } from './GrantControlResolver';
import { SessionControlAggregator } from './SessionControlAggregator';

/**
 * The top-level Conditional Access evaluation engine.
 *
 * Takes an array of policies and a simulation context, produces a complete
 * CAEngineResult with final decision, per-policy results, and full trace.
 *
 * Stateless: same inputs → same outputs, always. No caching, no side effects.
 */
export class CAEngine {
  private readonly policyEvaluator = new PolicyEvaluator();
  private readonly grantResolver = new GrantControlResolver();
  private readonly sessionAggregator = new SessionControlAggregator();

  evaluate(policies: ConditionalAccessPolicy[], context: SimulationContext): CAEngineResult {
    const trace: TraceEntry[] = [];

    // ── Phase 1: Signal Collection ──
    trace.push({
      timestamp: Date.now(),
      phase: 'signalCollection',
      message: 'Simulation context collected',
      details: {
        user: { id: context.user.id, displayName: context.user.displayName, userType: context.user.userType },
        application: { appId: context.application.appId, displayName: context.application.displayName },
        device: { platform: context.device.platform },
        location: { namedLocationId: context.location.namedLocationId, isTrusted: context.location.isTrustedLocation },
        risk: context.risk,
        clientAppType: context.clientAppType,
        satisfiedControls: context.satisfiedControls,
        authenticationStrengthLevel: context.authenticationStrengthLevel ?? 0,
      },
    });

    // ── Phase 2: Policy Matching ──
    const appliedPolicies: PolicyEvaluationResult[] = [];
    const reportOnlyPolicies: PolicyEvaluationResult[] = [];
    const skippedPolicies: PolicyEvaluationResult[] = [];

    for (const policy of policies) {
      // Evaluate the policy (PolicyEvaluator handles disabled skip internally)
      const result = this.policyEvaluator.evaluate(policy, context);

      if (policy.state === 'disabled') {
        skippedPolicies.push(result);
        trace.push({
          timestamp: Date.now(),
          phase: 'policyMatching',
          policyId: policy.id,
          message: `Policy "${policy.displayName}" skipped — disabled`,
        });
        continue;
      }

      if (!result.applies) {
        skippedPolicies.push(result);
        trace.push({
          timestamp: Date.now(),
          phase: 'policyMatching',
          policyId: policy.id,
          message: `Policy "${policy.displayName}" does not apply`,
          details: {
            failedCondition: result.conditionResults.find((cr) => !cr.matches)?.conditionType,
          },
        });
        continue;
      }

      if (policy.state === 'enabledForReportingButNotEnforced') {
        reportOnlyPolicies.push(result);
        trace.push({
          timestamp: Date.now(),
          phase: 'policyMatching',
          policyId: policy.id,
          message: `Policy "${policy.displayName}" applies (report-only)`,
        });
      } else {
        appliedPolicies.push(result);
        trace.push({
          timestamp: Date.now(),
          phase: 'policyMatching',
          policyId: policy.id,
          message: `Policy "${policy.displayName}" applies (enforced)`,
        });
      }
    }

    // ── Phase 3: Grant Resolution ──
    // Only enforced, applicable policies affect the final decision
    const grantResult = this.grantResolver.resolve(
      appliedPolicies,
      context.satisfiedControls,
      context.authenticationStrengthLevel,
    );
    trace.push(...grantResult.trace);

    // ── Phase 4: Session Control Aggregation ──
    const sessionResult = this.sessionAggregator.aggregate(appliedPolicies);
    trace.push(...sessionResult.trace);

    // ── Assemble Result ──
    return {
      finalDecision: grantResult.decision,
      requiredControls: grantResult.allRequiredControls,
      satisfiedControls: grantResult.satisfiedControls,
      appliedPolicies,
      skippedPolicies,
      reportOnlyPolicies,
      sessionControls: sessionResult.sessionControls as Record<string, unknown>,
      trace,
    };
  }
}
