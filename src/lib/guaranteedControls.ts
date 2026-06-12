// lib/guaranteedControls.ts — Derive which grant controls are actually
// guaranteed to be enforced, using per-policy operator information.
//
// CAEngineResult.requiredControls is a flattened union across policies: a
// policy requiring "mfa OR compliantDevice" contributes both, even though a
// sign-in can complete with either one alone. Gap classification and posture
// scoring must not treat such alternatives as guaranteed.

import type { PolicyEvaluationResult } from '@/engine/models/EvaluationResult';

export interface GuaranteedControlsResult {
  /** Controls every sign-in must satisfy (AND policies, single-option OR policies) */
  guaranteed: Set<string>;
  /** OR policies with multiple options: each set requires at least one of its members */
  alternativeSets: string[][];
}

/** Control category for non-stacking/equivalence checks. */
export function controlCategory(control: string): string {
  if (control === 'mfa' || control.startsWith('authenticationStrength:')) return 'auth';
  if (control === 'compliantDevice' || control === 'domainJoinedDevice') return 'device';
  return control;
}

/**
 * Splits the grant controls of the applied policies into guaranteed controls
 * and alternative sets.
 *
 * Authentication strength participates as `authenticationStrength:<name>`,
 * matching the label format used in CAEngineResult.requiredControls.
 */
export function deriveGuaranteedControls(appliedPolicies: PolicyEvaluationResult[]): GuaranteedControlsResult {
  const guaranteed = new Set<string>();
  const alternativeSets: string[][] = [];

  for (const policy of appliedPolicies) {
    const gc = policy.grantControls;
    if (!gc) continue;

    const effective = [...gc.controls];
    if (gc.authenticationStrength) {
      effective.push(`authenticationStrength:${gc.authenticationStrength.displayName}`);
    }
    if (effective.length === 0) continue;

    if (gc.operator === 'AND' || effective.length === 1) {
      for (const control of effective) {
        guaranteed.add(control);
      }
    } else {
      alternativeSets.push(effective);
    }
  }

  return { guaranteed, alternativeSets };
}
