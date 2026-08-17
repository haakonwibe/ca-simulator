// deriveSatisfiedControls tests — scenario picker values → engine controls

import { describe, it, expect } from 'vitest';
import { deriveSatisfiedControls, deriveAuthStrengthLevel } from '../deriveSatisfiedControls';

const base = {
  authentication: 'none',
  deviceCompliance: 'any',
  deviceJoin: 'unregistered',
  appProtection: 'none',
  passwordChanged: false,
};

describe('device compliance → compliantDevice', () => {
  it('compliant satisfies the control', () => {
    expect(deriveSatisfiedControls({ ...base, deviceCompliance: 'compliant' }))
      .toContain('compliantDevice');
  });

  it('non-compliant does not satisfy it', () => {
    expect(deriveSatisfiedControls({ ...base, deviceCompliance: 'nonCompliant' }))
      .not.toContain('compliantDevice');
  });

  it('any does not satisfy it', () => {
    expect(deriveSatisfiedControls({ ...base, deviceCompliance: 'any' }))
      .not.toContain('compliantDevice');
  });
});

describe('device join type → domainJoinedDevice', () => {
  // "Require Microsoft Entra hybrid joined device" means hybrid specifically.
  it('hybrid join satisfies the control', () => {
    expect(deriveSatisfiedControls({ ...base, deviceJoin: 'hybrid' }))
      .toContain('domainJoinedDevice');
  });

  it('Entra joined does NOT satisfy the hybrid-join control', () => {
    expect(deriveSatisfiedControls({ ...base, deviceJoin: 'entraJoined' }))
      .not.toContain('domainJoinedDevice');
  });

  it('Entra registered does NOT satisfy the hybrid-join control', () => {
    expect(deriveSatisfiedControls({ ...base, deviceJoin: 'registered' }))
      .not.toContain('domainJoinedDevice');
  });

  it('unregistered does not satisfy it', () => {
    expect(deriveSatisfiedControls({ ...base, deviceJoin: 'unregistered' }))
      .not.toContain('domainJoinedDevice');
  });
});

describe('compliance and join are independent', () => {
  it('a compliant Entra-joined device satisfies compliance only', () => {
    const controls = deriveSatisfiedControls({
      ...base, deviceCompliance: 'compliant', deviceJoin: 'entraJoined',
    });
    expect(controls).toEqual(['compliantDevice']);
  });

  it('a compliant hybrid-joined device satisfies both', () => {
    const controls = deriveSatisfiedControls({
      ...base, deviceCompliance: 'compliant', deviceJoin: 'hybrid',
    });
    expect(controls).toContain('compliantDevice');
    expect(controls).toContain('domainJoinedDevice');
  });

  it('a non-compliant hybrid-joined device satisfies join only', () => {
    const controls = deriveSatisfiedControls({
      ...base, deviceCompliance: 'nonCompliant', deviceJoin: 'hybrid',
    });
    expect(controls).toEqual(['domainJoinedDevice']);
  });
});

describe('authentication → mfa control', () => {
  it.each(['mfa', 'passwordlessMfa', 'phishingResistantMfa'])('%s satisfies mfa', (auth) => {
    expect(deriveSatisfiedControls({ ...base, authentication: auth })).toContain('mfa');
  });

  it('none does not satisfy mfa', () => {
    expect(deriveSatisfiedControls(base)).not.toContain('mfa');
  });
});

describe('app protection and password change', () => {
  it('approvedApp satisfies approvedApplication only', () => {
    expect(deriveSatisfiedControls({ ...base, appProtection: 'approvedApp' }))
      .toEqual(['approvedApplication']);
  });

  it('managedApp satisfies compliantApplication only', () => {
    expect(deriveSatisfiedControls({ ...base, appProtection: 'managedApp' }))
      .toEqual(['compliantApplication']);
  });

  it('both satisfies the two app controls', () => {
    const controls = deriveSatisfiedControls({ ...base, appProtection: 'both' });
    expect(controls).toContain('approvedApplication');
    expect(controls).toContain('compliantApplication');
  });

  it('passwordChanged satisfies passwordChange', () => {
    expect(deriveSatisfiedControls({ ...base, passwordChanged: true }))
      .toContain('passwordChange');
  });
});

describe('deriveAuthStrengthLevel', () => {
  it('maps each option to its tier', () => {
    expect(deriveAuthStrengthLevel('none')).toBe(0);
    expect(deriveAuthStrengthLevel('mfa')).toBe(1);
    expect(deriveAuthStrengthLevel('passwordlessMfa')).toBe(2);
    expect(deriveAuthStrengthLevel('phishingResistantMfa')).toBe(3);
  });

  it('unknown values fall back to 0', () => {
    expect(deriveAuthStrengthLevel('somethingElse')).toBe(0);
  });
});
