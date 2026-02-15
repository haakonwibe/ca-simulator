// engine/authenticationStrength.ts
// Authentication strength hierarchy resolution for Microsoft Entra ID built-in strengths.

/**
 * Well-known Microsoft Entra ID authentication strength IDs → hierarchy levels.
 * Higher level satisfies lower requirements (phishing-resistant satisfies all).
 */
export const AUTH_STRENGTH_HIERARCHY: ReadonlyMap<string, number> = new Map([
  ['00000000-0000-0000-0000-000000000002', 1], // Multifactor authentication
  ['00000000-0000-0000-0000-000000000003', 2], // Passwordless MFA
  ['00000000-0000-0000-0000-000000000004', 3], // Phishing-resistant MFA
]);

/**
 * Returns the hierarchy level for a given authentication strength ID.
 * Known built-in IDs return 1–3. Unknown/custom IDs return -1 (never satisfied).
 */
export function getAuthStrengthLevel(id: string): number {
  return AUTH_STRENGTH_HIERARCHY.get(id) ?? -1;
}

/**
 * Determines if the user's authentication strength level satisfies the policy's requirement.
 * User level must be >= the policy's required level. Unknown policy IDs are never satisfied.
 */
export function isAuthStrengthSatisfied(userLevel: number, policyStrengthId: string): boolean {
  const requiredLevel = getAuthStrengthLevel(policyStrengthId);
  if (requiredLevel < 0) return false; // Unknown/custom → never satisfied
  return userLevel >= requiredLevel;
}
