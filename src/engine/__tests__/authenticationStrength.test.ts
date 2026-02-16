// authenticationStrength hierarchy tests

import { describe, it, expect } from 'vitest';
import {
  getAuthStrengthLevel,
  isAuthStrengthSatisfied,
  resolveCustomAuthStrengthTier,
} from '../authenticationStrength';

const MFA_ID = '00000000-0000-0000-0000-000000000002';
const PASSWORDLESS_ID = '00000000-0000-0000-0000-000000000003';
const PHISHING_RESISTANT_ID = '00000000-0000-0000-0000-000000000004';
const CUSTOM_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

describe('getAuthStrengthLevel', () => {
  it('returns 1 for Multifactor authentication', () => {
    expect(getAuthStrengthLevel(MFA_ID)).toBe(1);
  });

  it('returns 2 for Passwordless MFA', () => {
    expect(getAuthStrengthLevel(PASSWORDLESS_ID)).toBe(2);
  });

  it('returns 3 for Phishing-resistant MFA', () => {
    expect(getAuthStrengthLevel(PHISHING_RESISTANT_ID)).toBe(3);
  });

  it('returns -1 for unknown/custom ID', () => {
    expect(getAuthStrengthLevel(CUSTOM_ID)).toBe(-1);
  });
});

describe('isAuthStrengthSatisfied', () => {
  it('level 3 user satisfies level 1 (phishing-resistant satisfies MFA)', () => {
    expect(isAuthStrengthSatisfied(3, MFA_ID)).toBe(true);
  });

  it('level 3 user satisfies level 2 (phishing-resistant satisfies passwordless)', () => {
    expect(isAuthStrengthSatisfied(3, PASSWORDLESS_ID)).toBe(true);
  });

  it('level 3 user satisfies level 3 (exact match)', () => {
    expect(isAuthStrengthSatisfied(3, PHISHING_RESISTANT_ID)).toBe(true);
  });

  it('level 2 user satisfies level 1 (passwordless satisfies MFA)', () => {
    expect(isAuthStrengthSatisfied(2, MFA_ID)).toBe(true);
  });

  it('level 2 user satisfies level 2 (exact match)', () => {
    expect(isAuthStrengthSatisfied(2, PASSWORDLESS_ID)).toBe(true);
  });

  it('level 1 user does NOT satisfy level 2 (MFA does not satisfy passwordless)', () => {
    expect(isAuthStrengthSatisfied(1, PASSWORDLESS_ID)).toBe(false);
  });

  it('level 1 user does NOT satisfy level 3 (MFA does not satisfy phishing-resistant)', () => {
    expect(isAuthStrengthSatisfied(1, PHISHING_RESISTANT_ID)).toBe(false);
  });

  it('level 2 user does NOT satisfy level 3 (passwordless does not satisfy phishing-resistant)', () => {
    expect(isAuthStrengthSatisfied(2, PHISHING_RESISTANT_ID)).toBe(false);
  });

  it('level 0 user never satisfies any known policy', () => {
    expect(isAuthStrengthSatisfied(0, MFA_ID)).toBe(false);
    expect(isAuthStrengthSatisfied(0, PASSWORDLESS_ID)).toBe(false);
    expect(isAuthStrengthSatisfied(0, PHISHING_RESISTANT_ID)).toBe(false);
  });

  it('unknown/custom policy ID is never satisfied regardless of user level', () => {
    expect(isAuthStrengthSatisfied(3, CUSTOM_ID)).toBe(false);
    expect(isAuthStrengthSatisfied(1, CUSTOM_ID)).toBe(false);
  });
});

// ── Custom authentication strength tier resolution ──────────────────

describe('resolveCustomAuthStrengthTier', () => {
  it('returns 3 for all phishing-resistant combinations', () => {
    expect(resolveCustomAuthStrengthTier(['fido2', 'windowsHelloForBusiness'])).toBe(3);
  });

  it('returns 3 for single phishing-resistant method', () => {
    expect(resolveCustomAuthStrengthTier(['x509CertificateMultiFactor'])).toBe(3);
  });

  it('returns 3 for all three phishing-resistant methods', () => {
    expect(resolveCustomAuthStrengthTier([
      'windowsHelloForBusiness', 'fido2', 'x509CertificateMultiFactor',
    ])).toBe(3);
  });

  it('returns 2 for passwordless-only methods (not all phishing-resistant)', () => {
    expect(resolveCustomAuthStrengthTier(['fido2', 'deviceBasedPush'])).toBe(2);
  });

  it('returns 2 for passwordless methods like TAP and federated', () => {
    expect(resolveCustomAuthStrengthTier([
      'temporaryAccessPassOneTime', 'federatedMultiFactor',
    ])).toBe(2);
  });

  it('returns 1 for any password-based combination', () => {
    expect(resolveCustomAuthStrengthTier([
      'fido2', 'password,microsoftAuthenticatorPush',
    ])).toBe(1);
  });

  it('returns 1 for mixed password and passwordless', () => {
    expect(resolveCustomAuthStrengthTier([
      'password,softwareOath', 'windowsHelloForBusiness',
    ])).toBe(1);
  });

  it('returns 1 for empty combinations (conservative)', () => {
    expect(resolveCustomAuthStrengthTier([])).toBe(1);
  });

  it('returns 1 for unknown method names (conservative)', () => {
    expect(resolveCustomAuthStrengthTier(['someUnknownMethod'])).toBe(1);
  });
});

// ── isAuthStrengthSatisfied with custom map ─────────────────────────

describe('isAuthStrengthSatisfied with custom map', () => {
  const customMap = new Map<string, number>([
    ['custom-mfa-id', 1],
    ['custom-passwordless-id', 2],
    ['custom-phishing-resistant-id', 3],
  ]);

  it('resolves custom ID at tier 1 (MFA)', () => {
    expect(isAuthStrengthSatisfied(1, 'custom-mfa-id', customMap)).toBe(true);
    expect(isAuthStrengthSatisfied(0, 'custom-mfa-id', customMap)).toBe(false);
  });

  it('resolves custom ID at tier 2 (passwordless)', () => {
    expect(isAuthStrengthSatisfied(2, 'custom-passwordless-id', customMap)).toBe(true);
    expect(isAuthStrengthSatisfied(1, 'custom-passwordless-id', customMap)).toBe(false);
  });

  it('resolves custom ID at tier 3 (phishing-resistant)', () => {
    expect(isAuthStrengthSatisfied(3, 'custom-phishing-resistant-id', customMap)).toBe(true);
    expect(isAuthStrengthSatisfied(2, 'custom-phishing-resistant-id', customMap)).toBe(false);
  });

  it('higher user level satisfies lower custom tier (hierarchy)', () => {
    expect(isAuthStrengthSatisfied(3, 'custom-mfa-id', customMap)).toBe(true);
    expect(isAuthStrengthSatisfied(2, 'custom-mfa-id', customMap)).toBe(true);
  });

  it('built-in IDs still resolved by hardcoded map (not overridden)', () => {
    const overrideMap = new Map([['00000000-0000-0000-0000-000000000002', 3]]);
    // Built-in says level 1, override says 3 — built-in wins (checked first)
    expect(isAuthStrengthSatisfied(1, MFA_ID, overrideMap)).toBe(true);
  });

  it('unknown ID not in custom map still returns false', () => {
    expect(isAuthStrengthSatisfied(3, 'totally-unknown-id', customMap)).toBe(false);
  });

  it('unknown ID without map still returns false (backward compat)', () => {
    expect(isAuthStrengthSatisfied(3, 'totally-unknown-id')).toBe(false);
  });
});
