// lib/sandboxDiff.ts — Sandbox-vs-live sweep comparison.
//
// Runs the live and sandboxed policy sets through the full scenario sweep and
// summarizes what the sandbox changes would do: verdict transitions, posture
// score delta, and which user types are affected. Pure — memoization is the
// caller's concern.

import { CAEngine } from '@/engine/CAEngine';
import type { ConditionalAccessPolicy, PolicyState } from '@/engine/models/Policy';
import type { SimulationContext } from '@/engine/models/SimulationContext';
import {
  computePostureScore,
  MAX_POSTURE_SCORE,
  type AffectedUserBreakdown,
  type AffectedUserEntry,
} from './impactAnalysis';
import type { SandboxOverrides } from './sandbox';
import {
  SWEEP_USER_TYPES,
  SWEEP_APPS,
  SWEEP_PLATFORMS,
  SWEEP_CLIENT_APPS,
  SWEEP_LOCATIONS,
  SWEEP_SIGN_IN_RISK,
  SWEEP_USER_RISK,
  SWEEP_USERS,
  buildSweepContext,
} from './sweepDimensions';

// ── Types ───────────────────────────────────────────────────────────

export interface SandboxChange {
  policyId: string;
  policyName: string;
  from: PolicyState;
  to: PolicyState;
}

export interface SandboxSweepDiff {
  totalScenarios: number;
  /** Scenarios whose verdict or required controls differ between the sets */
  affectedScenarios: number;
  /** Scenarios going from non-block (live) to block (sandbox) */
  newlyBlocked: number;
  /** Scenarios going from block (live) to non-block (sandbox) */
  newlyAllowed: number;
  /** Affected scenarios (excluding verdict flips above) whose posture score rose */
  strengthened: number;
  /** Affected scenarios (excluding verdict flips above) whose posture score fell */
  weakened: number;
  /** Posture coverage percentage (0–100) for the live set */
  postureBefore: number;
  /** Posture coverage percentage (0–100) for the sandboxed set */
  postureAfter: number;
  affectedUserTypes: AffectedUserBreakdown;
}

// ── Change list ─────────────────────────────────────────────────────

/** Human-oriented list of sandbox deviations, in live policy order. */
export function describeSandboxChanges(
  livePolicies: ConditionalAccessPolicy[],
  overrides: SandboxOverrides,
): SandboxChange[] {
  const changes: SandboxChange[] = [];
  for (const policy of livePolicies) {
    const to = overrides[policy.id];
    if (to !== undefined && to !== policy.state) {
      changes.push({
        policyId: policy.id,
        policyName: policy.displayName,
        from: policy.state,
        to,
      });
    }
  }
  return changes;
}

// ── Sweep comparison ────────────────────────────────────────────────

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

/**
 * Compare two policy sets across the full scenario sweep.
 * Cost: 2 × totalScenarios engine evaluations (~2 × 5,760).
 */
export function compareSweeps(
  livePolicies: ConditionalAccessPolicy[],
  sandboxPolicies: ConditionalAccessPolicy[],
): SandboxSweepDiff {
  const engine = new CAEngine();

  // Generate the scenario grid (same dimensions as gap/impact sweeps)
  const scenarios: SimulationContext[] = [];
  for (const userType of SWEEP_USER_TYPES) {
    const user = SWEEP_USERS[userType];
    for (const app of SWEEP_APPS) {
      for (const platform of SWEEP_PLATFORMS) {
        for (const clientApp of SWEEP_CLIENT_APPS) {
          for (const location of SWEEP_LOCATIONS) {
            for (const signInRisk of SWEEP_SIGN_IN_RISK) {
              for (const userRisk of SWEEP_USER_RISK) {
                scenarios.push(buildSweepContext(user, app, platform, clientApp, location, signInRisk, userRisk));
              }
            }
          }
        }
      }
    }
  }

  const totalScenarios = scenarios.length;
  const scenariosPerUserType = totalScenarios / SWEEP_USER_TYPES.length;

  let affectedScenarios = 0;
  let newlyBlocked = 0;
  let newlyAllowed = 0;
  let strengthened = 0;
  let weakened = 0;
  let liveScoreSum = 0;
  let sandboxScoreSum = 0;
  const userTypeAffected = new Array<number>(SWEEP_USER_TYPES.length).fill(0);

  for (let i = 0; i < totalScenarios; i++) {
    const liveResult = engine.evaluate(livePolicies, scenarios[i]);
    const sandboxResult = engine.evaluate(sandboxPolicies, scenarios[i]);

    const liveScore = computePostureScore(liveResult);
    const sandboxScore = computePostureScore(sandboxResult);
    liveScoreSum += liveScore;
    sandboxScoreSum += sandboxScore;

    const verdictChanged = liveResult.finalDecision !== sandboxResult.finalDecision;
    const controlsChanged = !arraysEqual(liveResult.requiredControls, sandboxResult.requiredControls);
    if (!verdictChanged && !controlsChanged) continue;

    affectedScenarios++;
    userTypeAffected[Math.floor(i / scenariosPerUserType)]++;

    // Classify each affected scenario into exactly one bucket
    if (liveResult.finalDecision !== 'block' && sandboxResult.finalDecision === 'block') {
      newlyBlocked++;
    } else if (liveResult.finalDecision === 'block' && sandboxResult.finalDecision !== 'block') {
      newlyAllowed++;
    } else if (sandboxScore > liveScore) {
      strengthened++;
    } else if (sandboxScore < liveScore) {
      weakened++;
    }
    // else: controls shifted with equal weight — counted in affectedScenarios only
  }

  // User type breakdown (same shape as impact analysis)
  const affected: AffectedUserEntry[] = [];
  const notAffected: AffectedUserEntry[] = [];
  for (let u = 0; u < SWEEP_USER_TYPES.length; u++) {
    const entry: AffectedUserEntry = {
      label: SWEEP_USERS[SWEEP_USER_TYPES[u]].displayName,
      scenariosAffected: userTypeAffected[u],
      scenariosTotal: scenariosPerUserType,
    };
    if (userTypeAffected[u] > 0) {
      affected.push(entry);
    } else {
      notAffected.push(entry);
    }
  }
  affected.sort((a, b) => b.scenariosAffected - a.scenariosAffected);

  const toPercent = (sum: number) =>
    totalScenarios > 0 ? (sum / (totalScenarios * MAX_POSTURE_SCORE)) * 100 : 0;

  return {
    totalScenarios,
    affectedScenarios,
    newlyBlocked,
    newlyAllowed,
    strengthened,
    weakened,
    postureBefore: toPercent(liveScoreSum),
    postureAfter: toPercent(sandboxScoreSum),
    affectedUserTypes: { affected, notAffected },
  };
}
