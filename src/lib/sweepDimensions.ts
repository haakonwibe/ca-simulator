// lib/sweepDimensions.ts — Shared sweep dimension constants and context builder.
// Used by both gapAnalysis.ts and impactAnalysis.ts for scenario sweeps.

import type { SimulationContext, UserContext } from '@/engine/models/SimulationContext';
import type { ClientAppType, DevicePlatform, RiskLevel } from '@/engine/models/Policy';

// ── Sweep dimensions ──

export const SWEEP_USER_TYPES = ['member', 'guest', 'admin'] as const;

/**
 * Sentinel appId representing "an app not specifically targeted by any policy".
 * The interactive 'All' context matches every policy's application condition,
 * which in a brute-force sweep would let a single-app policy suppress gaps (and
 * overstate its removal impact) for the whole row. This sentinel matches only
 * policies scoped to All cloud apps, so the row reflects baseline coverage.
 */
export const SWEEP_UNLISTED_APP = 'sweep-unlisted-app';

export const SWEEP_APPS = [SWEEP_UNLISTED_APP, 'Office365', 'MicrosoftAdminPortals'] as const;
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
  [SWEEP_UNLISTED_APP]: 'Other Cloud Apps',
  Office365: 'Office 365',
  MicrosoftAdminPortals: 'Microsoft Admin Portals',
};

// ── Agent sweep grid ──
// Shared by sandboxDiff and impactAnalysis: 3 apps × 2 locations × 4 agent
// risk levels per agent identity type, no device platform, browser client.

export const AGENT_SWEEP_RISKS = ['none', 'low', 'medium', 'high'] as const;

export function buildAgentSweepContexts(identityType: 'agentIdentity' | 'agentUser'): SimulationContext[] {
  const isAgentIdentity = identityType === 'agentIdentity';
  const contexts: SimulationContext[] = [];
  for (const app of SWEEP_APPS) {
    for (const location of SWEEP_LOCATIONS) {
      for (const agentRisk of AGENT_SWEEP_RISKS) {
        contexts.push({
          user: isAgentIdentity
            ? { id: 'sweep-agent-placeholder', displayName: 'Generic agent', userType: 'member', memberOfGroupIds: [], directoryRoleIds: [] }
            : { id: 'sweep-agent-user', displayName: 'Agent user account', userType: 'member', memberOfGroupIds: [], directoryRoleIds: [] },
          identityType,
          ...(isAgentIdentity ? { agent: { servicePrincipalId: 'sweep-generic-agent', displayName: 'Generic agent' } } : {}),
          application: { appId: app, displayName: APP_DISPLAY_NAMES[app] ?? app },
          device: {},
          location: { isTrustedLocation: location === 'trusted' },
          risk: { signInRiskLevel: 'none', userRiskLevel: 'none', insiderRiskLevel: 'none', agentRiskLevel: agentRisk },
          clientAppType: 'browser',
          authenticationFlow: 'none',
          authenticationStrengthLevel: 0,
          satisfiedControls: [],
        });
      }
    }
  }
  return contexts;
}

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
