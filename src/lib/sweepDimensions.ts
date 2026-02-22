// lib/sweepDimensions.ts — Shared sweep dimension constants and context builder.
// Used by both gapAnalysis.ts and impactAnalysis.ts for scenario sweeps.

import type { SimulationContext, UserContext } from '@/engine/models/SimulationContext';
import type { ClientAppType, DevicePlatform, RiskLevel } from '@/engine/models/Policy';

// ── Sweep dimensions ──

export const SWEEP_USER_TYPES = ['member', 'guest', 'admin'] as const;
export const SWEEP_APPS = ['All', 'Office365', 'MicrosoftAdminPortals'] as const;
export const SWEEP_PLATFORMS = ['windows', 'macOS', 'iOS', 'android', 'linux'] as const;
export const SWEEP_CLIENT_APPS = ['browser', 'mobileAppsAndDesktopClients', 'exchangeActiveSync', 'other'] as const;
export const SWEEP_LOCATIONS = ['trusted', 'untrusted'] as const;
export const SWEEP_SIGN_IN_RISK = ['none', 'low', 'medium', 'high'] as const;
export const SWEEP_USER_RISK = ['none', 'low', 'medium', 'high'] as const;

export type SweepUserType = (typeof SWEEP_USER_TYPES)[number];

// ── Synthetic personas ──

export const SWEEP_USERS: Record<SweepUserType, UserContext> = {
  member: {
    id: 'sweep-member',
    displayName: 'Standard Member',
    userType: 'member',
    memberOfGroupIds: [],
    directoryRoleIds: [],
  },
  guest: {
    id: 'sweep-guest',
    displayName: 'Guest User',
    userType: 'guest',
    memberOfGroupIds: [],
    directoryRoleIds: [],
    guestOrExternalUserTypes: ['b2bCollaborationGuest'],
  },
  admin: {
    id: 'sweep-admin',
    displayName: 'Global Administrator',
    userType: 'member',
    memberOfGroupIds: [],
    directoryRoleIds: ['62e90394-69f5-4237-9190-012177145e10'],
  },
};

// ── App display names ──

export const APP_DISPLAY_NAMES: Record<string, string> = {
  All: 'All Cloud Apps',
  Office365: 'Office 365',
  MicrosoftAdminPortals: 'Microsoft Admin Portals',
};

// ── Context builder ──

/** Build a SimulationContext from sweep dimension values. */
export function buildSweepContext(
  user: UserContext,
  app: string,
  platform: (typeof SWEEP_PLATFORMS)[number],
  clientApp: (typeof SWEEP_CLIENT_APPS)[number],
  location: (typeof SWEEP_LOCATIONS)[number],
  signInRisk: (typeof SWEEP_SIGN_IN_RISK)[number],
  userRisk: (typeof SWEEP_USER_RISK)[number],
): SimulationContext {
  return {
    user,
    application: {
      appId: app,
      displayName: APP_DISPLAY_NAMES[app] ?? app,
    },
    device: {
      platform: platform as DevicePlatform,
    },
    location: {
      isTrustedLocation: location === 'trusted',
    },
    risk: {
      signInRiskLevel: signInRisk as RiskLevel | 'none',
      userRiskLevel: userRisk as RiskLevel | 'none',
      insiderRiskLevel: 'none',
    },
    clientAppType: clientApp as ClientAppType,
    authenticationFlow: 'none',
    authenticationStrengthLevel: 0,
    satisfiedControls: [],
  };
}
