// engine/authenticationStrength.ts
// Authentication strength hierarchy resolution for Microsoft Entra ID.
// Supports built-in strengths (by well-known ID) and custom strengths (by tier resolution).

/**
 * Well-known Microsoft Entra ID authentication strength IDs → hierarchy levels.
 * Higher level satisfies lower requirements (phishing-resistant satisfies all).
 */
export const AUTH_STRENGTH_HIERARCHY: ReadonlyMap<string, number> = new Map([
  ['00000000-0000-0000-0000-000000000002', 1], // Multifactor authentication
  ['00000000-0000-0000-0000-000000000003', 2], // Passwordless MFA
  ['00000000-0000-0000-0000-000000000004', 3], // Phishing-resistant MFA
]);

// ── Custom auth strength tier resolution ────────────────────────────

/** Methods that qualify as phishing-resistant (strictest tier). */
export const PHISHING_RESISTANT_METHODS: ReadonlySet<string> = new Set([
  'windowsHelloForBusiness',
  'fido2',
  'x509CertificateMultiFactor',
]);

/**
 * Methods that qualify as passwordless (middle tier).
 *
 * Mirrors the "Passwordless MFA strength" column of Microsoft's built-in
 * strengths table exactly — being password-free is not sufficient on its own.
 * Notably excluded, because Microsoft grades them MFA-only:
 *   - temporaryAccessPass{OneTime,MultiUse} — MFA column only
 *   - federated{SingleFactor,MultiFactor}   — MFA column only
 *   - x509CertificateSingleFactor           — satisfies no strength at all
 * https://learn.microsoft.com/entra/identity/authentication/concept-authentication-strengths
 */
export const PASSWORDLESS_METHODS: ReadonlySet<string> = new Set([
  'windowsHelloForBusiness', // also covers the macOS platform credential
  'fido2',
  'x509CertificateMultiFactor',
  'deviceBasedPush',
]);

/**
 * Resolves a custom authentication strength's tier based on its allowedCombinations.
 * Conservative classification — if in doubt, returns the lower tier.
 *
 * Returns: 3 = phishing-resistant, 2 = passwordless, 1 = MFA
 */
export function resolveCustomAuthStrengthTier(allowedCombinations: string[]): number {
  if (allowedCombinations.length === 0) return 1; // Conservative default

  let allPhishingResistant = true;
  let allPasswordless = true;

  for (const combo of allowedCombinations) {
    const methods = combo.split(',').map(m => m.trim());

    // Any password-based combination means it's not passwordless
    if (methods[0] === 'password') {
      allPasswordless = false;
      allPhishingResistant = false;
      continue;
    }

    if (!methods.every(m => PHISHING_RESISTANT_METHODS.has(m))) allPhishingResistant = false;
    if (!methods.every(m => PASSWORDLESS_METHODS.has(m))) allPasswordless = false;
  }

  if (allPhishingResistant) return 3;
  if (allPasswordless) return 2;
  return 1;
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Determines if the user's authentication strength level satisfies the policy's requirement.
 * Checks built-in IDs first, then falls back to the custom auth strength map.
 * User level must be >= the policy's required level.
 */
export function isAuthStrengthSatisfied(
  userLevel: number,
  policyStrengthId: string,
  customAuthStrengthMap?: ReadonlyMap<string, number>,
): boolean {
  let requiredLevel = AUTH_STRENGTH_HIERARCHY.get(policyStrengthId) ?? -1;
  if (requiredLevel < 0 && customAuthStrengthMap) {
    requiredLevel = customAuthStrengthMap.get(policyStrengthId) ?? -1;
  }
  if (requiredLevel < 0) return false;
  return userLevel >= requiredLevel;
}
