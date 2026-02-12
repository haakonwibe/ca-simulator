// lib/gapAnalysis.ts — Brute-force coverage gap analysis.
// Sweeps all scenario combinations through the CA engine and identifies unprotected scenarios.

import { CAEngine } from '@/engine/CAEngine';
import type { ConditionalAccessPolicy } from '@/engine/models/Policy';
import type { SimulationContext, UserContext } from '@/engine/models/SimulationContext';
import type { CAEngineResult } from '@/engine/models/EvaluationResult';

// ── Sweep dimensions ──

const SWEEP_USER_TYPES = ['member', 'guest', 'admin'] as const;
const SWEEP_APPS = ['All', 'Office365', 'MicrosoftAdminPortals'] as const;
const SWEEP_PLATFORMS = ['windows', 'macOS', 'iOS', 'android', 'linux'] as const;
const SWEEP_CLIENT_APPS = ['browser', 'mobileAppsAndDesktopClients', 'exchangeActiveSync', 'other'] as const;
const SWEEP_LOCATIONS = ['trusted', 'untrusted'] as const;
const SWEEP_SIGN_IN_RISK = ['none', 'low', 'medium', 'high'] as const;
const SWEEP_USER_RISK = ['none', 'low', 'medium', 'high'] as const;

type SweepUserType = (typeof SWEEP_USER_TYPES)[number];

// ── Synthetic personas ──

const SWEEP_USERS: Record<SweepUserType, UserContext> = {
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

// App display names for readable output
const APP_DISPLAY_NAMES: Record<string, string> = {
  All: 'All Cloud Apps',
  Office365: 'Office 365',
  MicrosoftAdminPortals: 'Microsoft Admin Portals',
};

// ── Gap result types ──

export type GapSeverity = 'critical' | 'warning' | 'caution' | 'info';

export type GapType = 'no-policy' | 'no-mfa' | 'no-device-compliance' | 'no-mfa-or-device' | 'legacy-auth-not-blocked' | 'report-only';

export type GapPersonaSource = 'generic' | 'selected' | 'resolved';

export interface GapAnalysisOptions {
  personaSource?: GapPersonaSource;
  selectedUser?: UserContext;
  resolvedUsers?: UserContext[];
  samplePersonas?: UserContext[];
}

export interface GapDisagreement {
  message: string;
  genericGapCount: number;
  realGapCount: number;
}

export interface GapResult {
  severity: GapSeverity;
  gapType: GapType;
  userType: string;
  application: string;
  platform: string;
  clientApp: string;
  location: string;
  signInRisk: string;
  userRisk: string;
  verdict: string;
  requiredControls: string[];
  appliedPolicyCount: number;
  reportOnlyPolicyCount: number;
  reason: string;
  personaName: string;
  personaSource: GapPersonaSource;
}

export interface GapGroup {
  severity: GapSeverity;
  gapType: GapType;
  userType: string;
  application: string;
  reason: string;
  platforms: string[];
  clientApps: string[];
  locations: string[];
  signInRiskLevels: string[];
  userRiskLevels: string[];
  scenarioCount: number;
  personaName: string;
  personaSource: GapPersonaSource;
}

// ── Legacy client apps ──

const LEGACY_CLIENT_APPS = new Set(['exchangeActiveSync', 'other']);

// ── Classification ──

interface GapClassification {
  severity: GapSeverity;
  gapType: GapType;
  reason: string;
}

function classifyResult(
  result: CAEngineResult,
  reportOnlyCount: number,
  clientAppType?: string,
): GapClassification[] {
  const { finalDecision, appliedPolicies, requiredControls } = result;

  // Block verdict → fully covered, no gaps
  if (finalDecision === 'block') return [];

  // Critical: no applied policies, no report-only → completely unprotected
  if (appliedPolicies.length === 0 && reportOnlyCount === 0) {
    return [{
      severity: 'critical',
      gapType: 'no-policy',
      reason: 'No policies apply — implicit allow with no controls',
    }];
  }

  // Info: all matching are report-only → technically covered but not enforced
  if (appliedPolicies.length === 0 && reportOnlyCount > 0) {
    return [{
      severity: 'info',
      gapType: 'report-only',
      reason: 'Covered by report-only policies only — not currently enforced',
    }];
  }

  // Enforced policies exist — check MFA and device compliance independently
  const hasMfa = requiredControls.includes('mfa');
  const hasCompliantDevice = requiredControls.includes('compliantDevice');
  const isLegacy = clientAppType ? LEGACY_CLIENT_APPS.has(clientAppType) : false;

  // Both present and not legacy → fully covered
  if (hasMfa && hasCompliantDevice && !isLegacy) return [];

  const classifications: GapClassification[] = [];

  if (!hasMfa) {
    classifications.push({
      severity: 'warning',
      gapType: 'no-mfa',
      reason: 'No MFA required — policies apply but none enforce multi-factor authentication',
    });
  }

  if (!hasCompliantDevice) {
    classifications.push({
      severity: 'warning',
      gapType: 'no-device-compliance',
      reason: 'No compliant device required — policies apply but none enforce device compliance',
    });
  }

  // Caution only when BOTH are missing
  if (!hasMfa && !hasCompliantDevice) {
    classifications.push({
      severity: 'caution',
      gapType: 'no-mfa-or-device',
      reason: 'Neither MFA nor compliant device required — minimal security posture',
    });
  }

  // Legacy auth clients can't perform modern auth controls like MFA
  if (isLegacy) {
    classifications.push({
      severity: 'warning',
      gapType: 'legacy-auth-not-blocked',
      reason: 'Legacy authentication not blocked — legacy clients cannot perform MFA and bypass modern authentication controls. Microsoft recommends blocking legacy auth for all users.',
    });
  }

  return classifications;
}

// ── Disagreement detection ──

export function detectDisagreement(
  genericGaps: GapResult[],
  realGaps: GapResult[],
  realGroupCount: number,
  scenarioCount: number,
): GapDisagreement | null {
  if (genericGaps.length === 0 && realGaps.length > 0) {
    return {
      message: `Generic analysis shows no gaps, but real user analysis found ${realGroupCount} coverage finding${realGroupCount === 1 ? '' : 's'} across ${scenarioCount.toLocaleString()} scenarios (combinations of apps, platforms, client apps, locations, and risk levels). User exclusions, group memberships, and role assignments in your policies are creating blind spots that only appear with actual user data.`,
      genericGapCount: 0,
      realGapCount: realGaps.length,
    };
  }
  return null;
}

// ── Scenario count utility ──

export function getSweepScenarioCount(userCount: number): number {
  return userCount * SWEEP_APPS.length * SWEEP_PLATFORMS.length
    * SWEEP_CLIENT_APPS.length * SWEEP_LOCATIONS.length
    * SWEEP_SIGN_IN_RISK.length * SWEEP_USER_RISK.length;
}

// ── Main sweep ──

export function analyzeGaps(
  policies: ConditionalAccessPolicy[],
  options?: GapAnalysisOptions,
): GapResult[] {
  const engine = new CAEngine();
  const gaps: GapResult[] = [];

  let personaSource: GapPersonaSource = options?.personaSource ?? 'generic';

  // Determine which users to sweep
  let sweepUsers: { user: UserContext; personaName: string }[];

  if (personaSource === 'selected' && options?.selectedUser) {
    sweepUsers = [{
      user: options.selectedUser,
      personaName: options.selectedUser.displayName,
    }];
  } else if (personaSource === 'resolved' && options?.resolvedUsers?.length) {
    sweepUsers = options.resolvedUsers.map((u) => ({
      user: u,
      personaName: u.displayName,
    }));
  } else {
    // Fallback: generic sweep
    personaSource = 'generic';
    if (options?.samplePersonas?.length) {
      // Sample mode: use fully modeled sample personas
      sweepUsers = options.samplePersonas.map((u) => ({
        user: u,
        personaName: u.displayName,
      }));
    } else {
      // Live mode: use synthetic personas
      sweepUsers = SWEEP_USER_TYPES.map((t) => ({
        user: SWEEP_USERS[t],
        personaName: SWEEP_USERS[t].displayName,
      }));
    }
  }

  for (const { user, personaName } of sweepUsers) {
    for (const app of SWEEP_APPS) {
      for (const platform of SWEEP_PLATFORMS) {
        for (const clientApp of SWEEP_CLIENT_APPS) {
          for (const location of SWEEP_LOCATIONS) {
            for (const signInRisk of SWEEP_SIGN_IN_RISK) {
              for (const userRisk of SWEEP_USER_RISK) {
                const context: SimulationContext = {
                  user,
                  application: {
                    appId: app,
                    displayName: APP_DISPLAY_NAMES[app] ?? app,
                  },
                  device: {
                    platform,
                  },
                  location: {
                    isTrustedLocation: location === 'trusted',
                  },
                  risk: {
                    signInRiskLevel: signInRisk,
                    userRiskLevel: userRisk,
                  },
                  clientAppType: clientApp,
                  authenticationFlow: 'none',
                  satisfiedControls: [],
                };

                const result = engine.evaluate(policies, context);
                const reportOnlyCount = result.reportOnlyPolicies.length;
                const classifications = classifyResult(result, reportOnlyCount, clientApp);

                for (const classification of classifications) {
                  gaps.push({
                    severity: classification.severity,
                    gapType: classification.gapType,
                    userType: personaName,
                    application: APP_DISPLAY_NAMES[app],
                    platform,
                    clientApp,
                    location,
                    signInRisk,
                    userRisk,
                    verdict: result.finalDecision,
                    requiredControls: result.requiredControls,
                    appliedPolicyCount: result.appliedPolicies.length,
                    reportOnlyPolicyCount: reportOnlyCount,
                    reason: classification.reason,
                    personaName,
                    personaSource,
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  // Sort: critical > warning > caution > info; within same severity by user type then app
  const severityOrder: Record<GapSeverity, number> = { critical: 0, warning: 1, caution: 2, info: 3 };
  gaps.sort((a, b) => {
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    const userDiff = a.userType.localeCompare(b.userType);
    if (userDiff !== 0) return userDiff;
    return a.application.localeCompare(b.application);
  });

  return gaps;
}

// ── Grouping ──

export function groupGaps(gaps: GapResult[]): GapGroup[] {
  const groupMap = new Map<string, GapGroup>();

  for (const gap of gaps) {
    const key = `${gap.severity}|${gap.gapType}|${gap.personaName}|${gap.application}|${gap.reason}`;

    let group = groupMap.get(key);
    if (!group) {
      group = {
        severity: gap.severity,
        gapType: gap.gapType,
        userType: gap.userType,
        application: gap.application,
        reason: gap.reason,
        platforms: [],
        clientApps: [],
        locations: [],
        signInRiskLevels: [],
        userRiskLevels: [],
        scenarioCount: 0,
        personaName: gap.personaName,
        personaSource: gap.personaSource,
      };
      groupMap.set(key, group);
    }

    group.scenarioCount++;

    if (!group.platforms.includes(gap.platform)) group.platforms.push(gap.platform);
    if (!group.clientApps.includes(gap.clientApp)) group.clientApps.push(gap.clientApp);
    if (!group.locations.includes(gap.location)) group.locations.push(gap.location);
    if (!group.signInRiskLevels.includes(gap.signInRisk)) group.signInRiskLevels.push(gap.signInRisk);
    if (!group.userRiskLevels.includes(gap.userRisk)) group.userRiskLevels.push(gap.userRisk);
  }

  const groups = Array.from(groupMap.values());

  // Sort: critical > warning > caution > info
  const severityOrder: Record<GapSeverity, number> = { critical: 0, warning: 1, caution: 2, info: 3 };
  groups.sort((a, b) => {
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    const userDiff = a.userType.localeCompare(b.userType);
    if (userDiff !== 0) return userDiff;
    return a.application.localeCompare(b.application);
  });

  return groups;
}
