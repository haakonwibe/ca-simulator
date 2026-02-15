// lib/deriveSatisfiedControls.ts — Derives the SatisfiedControl[] array
// from intuitive scenario inputs (authentication, device state, app protection, etc.)

import type { SatisfiedControl } from '@/engine/models/SimulationContext';

export function deriveSatisfiedControls(scenario: {
  authentication: string;
  deviceState: string;
  appProtection: string;
  passwordChanged: boolean;
}): SatisfiedControl[] {
  const controls: SatisfiedControl[] = [];

  // Authentication — any MFA-level option satisfies the built-in 'mfa' control
  if (scenario.authentication === 'mfa' || scenario.authentication === 'passwordlessMfa' || scenario.authentication === 'phishingResistantMfa') {
    controls.push('mfa');
  }

  // Device State
  if (scenario.deviceState === 'compliant' || scenario.deviceState === 'compliantAndHybrid') {
    controls.push('compliantDevice');
  }
  if (scenario.deviceState === 'domainJoined' || scenario.deviceState === 'compliantAndHybrid') {
    controls.push('domainJoinedDevice');
  }

  // App Protection
  if (scenario.appProtection === 'approvedApp' || scenario.appProtection === 'both') {
    controls.push('approvedApplication');
  }
  if (scenario.appProtection === 'managedApp' || scenario.appProtection === 'both') {
    controls.push('compliantApplication');
  }

  // Password Change
  if (scenario.passwordChanged) {
    controls.push('passwordChange');
  }

  return controls;
}

/**
 * Derives the authentication strength level from the scenario authentication value.
 * 0 = none, 1 = MFA, 2 = Passwordless MFA, 3 = Phishing-resistant MFA
 */
export function deriveAuthStrengthLevel(authentication: string): number {
  switch (authentication) {
    case 'mfa': return 1;
    case 'passwordlessMfa': return 2;
    case 'phishingResistantMfa': return 3;
    default: return 0;
  }
}
