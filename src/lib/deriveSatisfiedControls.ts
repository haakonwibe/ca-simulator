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

  // Authentication
  if (scenario.authentication === 'mfa' || scenario.authentication === 'phishingResistantMfa') {
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
