// authenticationStrength hierarchy tests

import { describe, it, expect } from 'vitest';
import { getAuthStrengthLevel, isAuthStrengthSatisfied } from '../authenticationStrength';

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
