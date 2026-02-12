// engine/GrantControlResolver.ts
// Cross-policy grant control resolution — the most accuracy-critical module.

import type { PolicyEvaluationResult, TraceEntry } from './models/EvaluationResult';
import type { SatisfiedControl } from './models/SimulationContext';

export interface PolicyBreakdown {
  policyId: string;
  policyName: string;
  satisfied: boolean;
  operator: 'AND' | 'OR';
  requiredControls: string[];
  satisfiedControls: string[];
  unsatisfiedControls: string[];
}

export interface GrantResolutionResult {
  decision: 'allow' | 'block' | 'controlsRequired';
  /** All unique controls required across all policies */
  allRequiredControls: string[];
  /** Controls the user has already satisfied */
  satisfiedControls: string[];
  /** Controls still needed */
  unsatisfiedControls: string[];
  /** Per-policy satisfaction breakdown */
  policyBreakdown: PolicyBreakdown[];
  /** Trace entries for the resolution phase */
  trace: TraceEntry[];
}

/**
 * Resolves grant controls across all matching enabled policies.
 *
 * Two levels of resolution:
 * - Level 1 (Intra-Policy): Each policy's AND/OR operator determines per-policy satisfaction
 * - Level 2 (Cross-Policy): ALL policies must be independently satisfied (always AND)
 *
 * Block always wins. No matching policies = implicit allow.
 */
export class GrantControlResolver {
  resolve(
    applicablePolicies: PolicyEvaluationResult[],
    satisfiedControls: SatisfiedControl[],
  ): GrantResolutionResult {
    const trace: TraceEntry[] = [];
    const satisfied = satisfiedControls.map(String);

    // Step 1: No matching policies → implicit allow
    if (applicablePolicies.length === 0) {
      trace.push(this.trace('No applicable policies — implicit allow'));
      return {
        decision: 'allow',
        allRequiredControls: [],
        satisfiedControls: [],
        unsatisfiedControls: [],
        policyBreakdown: [],
        trace,
      };
    }

    trace.push(this.trace(`Resolving grant controls across ${applicablePolicies.length} applicable policies`));

    // Step 2: Check for block — if ANY policy has 'block', decision is block immediately
    for (const policy of applicablePolicies) {
      const controls = policy.grantControls?.controls ?? [];
      if (controls.includes('block')) {
        trace.push(this.trace(
          `BLOCK: Policy "${policy.policyName}" (${policy.policyId}) contains block control`,
          policy.policyId,
        ));
        return {
          decision: 'block',
          allRequiredControls: ['block'],
          satisfiedControls: [],
          unsatisfiedControls: ['block'],
          policyBreakdown: [{
            policyId: policy.policyId,
            policyName: policy.policyName,
            satisfied: false,
            operator: policy.grantControls?.operator ?? 'AND',
            requiredControls: controls,
            satisfiedControls: [],
            unsatisfiedControls: controls,
          }],
          trace,
        };
      }
    }

    // Step 3: Evaluate each policy independently (per-policy AND/OR)
    const policyBreakdown: PolicyBreakdown[] = [];
    const allRequiredSet = new Set<string>();
    const allUnsatisfiedSet = new Set<string>();

    for (const policy of applicablePolicies) {
      const breakdown = this.evaluatePolicy(policy, satisfied);
      policyBreakdown.push(breakdown);

      for (const c of breakdown.requiredControls) {
        allRequiredSet.add(c);
      }
      for (const c of breakdown.unsatisfiedControls) {
        allUnsatisfiedSet.add(c);
      }

      trace.push(this.trace(
        `Policy "${policy.policyName}": ${breakdown.satisfied ? 'SATISFIED' : 'NOT SATISFIED'} ` +
        `(${breakdown.operator}, controls: [${breakdown.requiredControls.join(', ')}], ` +
        `satisfied: [${breakdown.satisfiedControls.join(', ')}], ` +
        `unsatisfied: [${breakdown.unsatisfiedControls.join(', ')}])`,
        policy.policyId,
      ));
    }

    // Step 4: Cross-policy AND — all policies must be independently satisfied
    const allSatisfied = policyBreakdown.every((b) => b.satisfied);

    const allRequired = [...allRequiredSet];
    const allUnsatisfied = [...allUnsatisfiedSet];
    const allSatisfiedControls = allRequired.filter((c) => satisfied.includes(c));

    if (allSatisfied) {
      trace.push(this.trace('All policies satisfied — decision: allow'));
      return {
        decision: 'allow',
        allRequiredControls: allRequired,
        satisfiedControls: allSatisfiedControls,
        unsatisfiedControls: [],
        policyBreakdown,
        trace,
      };
    }

    trace.push(this.trace(
      `Controls required — unsatisfied: [${allUnsatisfied.join(', ')}]`,
    ));

    return {
      decision: 'controlsRequired',
      allRequiredControls: allRequired,
      satisfiedControls: allSatisfiedControls,
      unsatisfiedControls: allUnsatisfied,
      policyBreakdown,
      trace,
    };
  }

  private evaluatePolicy(
    policy: PolicyEvaluationResult,
    satisfiedControls: string[],
  ): PolicyBreakdown {
    // Policy with no grant controls (session-only) — automatically satisfied
    if (!policy.grantControls) {
      return {
        policyId: policy.policyId,
        policyName: policy.policyName,
        satisfied: true,
        operator: 'AND',
        requiredControls: [],
        satisfiedControls: [],
        unsatisfiedControls: [],
      };
    }

    const { operator, controls } = policy.grantControls;

    // Build per-control satisfaction lists
    const controlsSatisfied = controls.filter((c) => satisfiedControls.includes(c));
    const controlsUnsatisfied = controls.filter((c) => !satisfiedControls.includes(c));

    // Handle authenticationStrength as an additional control requirement
    let authStrengthSatisfied = true;
    const authStrength = policy.grantControls.authenticationStrength;
    if (authStrength) {
      // Check if 'authenticationStrength' is in satisfiedControls (generic)
      // or if the specific strength ID is present
      authStrengthSatisfied =
        satisfiedControls.includes('authenticationStrength') ||
        satisfiedControls.includes(`authenticationStrength:${authStrength}`);
    }

    // Determine per-policy satisfaction
    let satisfied: boolean;
    if (operator === 'AND') {
      // All controls must be satisfied, plus authenticationStrength if present
      satisfied = controlsUnsatisfied.length === 0 && authStrengthSatisfied;
    } else {
      // At least one control must be satisfied
      // authenticationStrength counts as a satisfiable control for OR
      satisfied = controlsSatisfied.length > 0 || (authStrength !== undefined && authStrengthSatisfied);
      // Edge case: OR with empty controls but authStrength only
      if (controls.length === 0 && authStrength) {
        satisfied = authStrengthSatisfied;
      }
      // Edge case: OR with no controls at all
      if (controls.length === 0 && !authStrength) {
        satisfied = true;
      }
    }

    // Include authenticationStrength in the required/unsatisfied lists
    const requiredControls = [...controls];
    const unsatisfiedResult = [...controlsUnsatisfied];
    if (authStrength && !authStrengthSatisfied) {
      requiredControls.push(`authenticationStrength:${authStrength}`);
      unsatisfiedResult.push(`authenticationStrength:${authStrength}`);
    } else if (authStrength && authStrengthSatisfied) {
      requiredControls.push(`authenticationStrength:${authStrength}`);
      controlsSatisfied.push(`authenticationStrength:${authStrength}`);
    }

    return {
      policyId: policy.policyId,
      policyName: policy.policyName,
      satisfied,
      operator,
      requiredControls,
      satisfiedControls: controlsSatisfied,
      unsatisfiedControls: unsatisfiedResult,
    };
  }

  private trace(message: string, policyId?: string): TraceEntry {
    return {
      timestamp: Date.now(),
      phase: 'grantResolution',
      policyId,
      message,
    };
  }
}
