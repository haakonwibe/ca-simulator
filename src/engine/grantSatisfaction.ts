// engine/grantSatisfaction.ts — Per-policy grant satisfaction algorithm.
//
// Single source of truth for applying a policy's AND/OR operator over its
// controls and (optional) authentication strength requirement. Used by both
// PolicyEvaluator (per-policy display) and GrantControlResolver (decision) so
// the two can never diverge.

export interface GrantSatisfactionResult {
  satisfied: boolean;
  satisfiedControls: string[];
  unsatisfiedControls: string[];
}

/**
 * @param authStrengthSatisfied undefined = the policy has no authentication
 *   strength requirement; boolean = whether the user meets it.
 */
export function evaluateGrantSatisfaction(
  operator: 'AND' | 'OR',
  controls: string[],
  userSatisfiedControls: string[],
  authStrengthSatisfied: boolean | undefined,
): GrantSatisfactionResult {
  const satisfiedControls = controls.filter((c) => userSatisfiedControls.includes(c));
  const unsatisfiedControls = controls.filter((c) => !userSatisfiedControls.includes(c));

  let satisfied: boolean;
  if (operator === 'AND') {
    // All controls must be satisfied, plus authenticationStrength if present
    satisfied = unsatisfiedControls.length === 0 && (authStrengthSatisfied ?? true);
  } else if (controls.length === 0) {
    // OR with no built-in controls: authenticationStrength alone decides
    satisfied = authStrengthSatisfied ?? true;
  } else {
    // OR: at least one control, or the authenticationStrength, must be satisfied
    satisfied = satisfiedControls.length > 0 || authStrengthSatisfied === true;
  }

  return { satisfied, satisfiedControls, unsatisfiedControls };
}
