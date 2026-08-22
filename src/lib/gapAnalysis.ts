// lib/gapAnalysis.ts — Brute-force coverage gap analysis.
// Sweeps all scenario combinations through the CA engine and identifies unprotected scenarios.

import { CAEngine } from '@/engine/CAEngine';
import type { ConditionalAccessPolicy } from '@/engine/models/Policy';
import type { SimulationContext, UserContext } from '@/engine/models/SimulationContext';
import type { CAEngineResult } from '@/engine/models/EvaluationResult';
import { deriveGuaranteedControls } from './guaranteedControls';
import {
  SWEEP_USER_TYPES,
  SWEEP_APPS,
  SWEEP_PLATFORMS,
  SWEEP_CLIENT_APPS,
  SWEEP_LOCATIONS,
  SWEEP_SIGN_IN_RISK,
  SWEEP_USER_RISK,
  SWEEP_USERS,
  APP_DISPLAY_NAMES,
  buildSweepContext,
} from './sweepDimensions';

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
  const { finalDecision, appliedPolicies } = result;

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

  // Enforced policies exist — check MFA and device compliance independently.
  // Only controls that are GUARANTEED count: a policy requiring
  // "mfa OR compliantDevice" guarantees neither individually.
  const { guaranteed, alternativeSets } = deriveGuaranteedControls(appliedPolicies);
  const satisfiesMfa = (c: string) => c === 'mfa' || c.startsWith('authenticationStrength:');
  // Device trust is compliant OR hybrid joined — both prove the device is known and
  // managed, which is why controlCategory() groups them and why Microsoft's own
  // template is "compliant or hybrid joined device". Counting only compliantDevice
  // here reported a device gap against tenants that require hybrid join.
  const satisfiesDevice = (c: string) => c === 'compliantDevice' || c === 'domainJoinedDevice';

  // A control is guaranteed when it is required outright, OR when every alternative
  // of an OR grant satisfies it — "compliant OR hybrid joined device" is the shape
  // Microsoft's own device-trust templates use, and it guarantees device trust even
  // though neither control alone is mandatory. Same rule the baseline assessment uses.
  const guaranteedControls = [...guaranteed];
  const isGuaranteed = (pred: (c: string) => boolean) =>
    guaranteedControls.some(pred) || alternativeSets.some(set => set.every(pred));

  const hasMfa = isGuaranteed(satisfiesMfa);
  const hasCompliantDevice = isGuaranteed(satisfiesDevice);
  const mfaIsAlternative = !hasMfa && alternativeSets.some(set => set.some(satisfiesMfa));
  const deviceIsAlternative = !hasCompliantDevice && alternativeSets.some(set => set.some(satisfiesDevice));
  // An OR set where EVERY alternative is mfa-or-device still guarantees "one of the two"
  const hasMfaOrDevice = hasMfa || hasCompliantDevice ||
    alternativeSets.some(set => set.every(c => satisfiesMfa(c) || satisfiesDevice(c)));
  const isLegacy = clientAppType ? LEGACY_CLIENT_APPS.has(clientAppType) : false;

  // Both present and not legacy → fully covered
  if (hasMfa && hasCompliantDevice && !isLegacy) return [];

  const classifications: GapClassification[] = [];

  if (!hasMfa) {
    classifications.push({
      severity: 'warning',
      gapType: 'no-mfa',
      reason: mfaIsAlternative
        ? 'MFA not guaranteed — it is only one alternative in an OR grant; a sign-in can complete without MFA'
        : 'No MFA required — policies apply but none enforce multi-factor authentication',
    });
  }

  if (!hasCompliantDevice) {
    classifications.push({
      severity: 'warning',
      gapType: 'no-device-compliance',
      reason: deviceIsAlternative
        ? 'Device trust not guaranteed — it is only one alternative in an OR grant; a sign-in can complete without a compliant or hybrid joined device'
        : 'No device trust required — policies apply but none require a compliant or hybrid joined device',
    });
  }

  // Caution only when not even "one of MFA / compliant device" is guaranteed
  if (!hasMfaOrDevice) {
    classifications.push({
      severity: 'caution',
      gapType: 'no-mfa-or-device',
      reason: 'Neither MFA nor device trust required — minimal security posture',
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
                const context = buildSweepContext(user, app, platform, clientApp, location, signInRisk, userRisk);

                const result = engine.evaluate(policies, context);
                const reportOnlyCount = result.reportOnlyPolicies.length;
                const classifications = classifyResult(result, reportOnlyCount, clientApp);

                for (const classification of classifications) {
                  gaps.push({
                    severity: classification.severity,
                    gapType: classification.gapType,
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

  // Sort: critical > warning > caution > info; within same severity by persona then app
  const severityOrder: Record<GapSeverity, number> = { critical: 0, warning: 1, caution: 2, info: 3 };
  gaps.sort((a, b) => {
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    const userDiff = a.personaName.localeCompare(b.personaName);
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
    const userDiff = a.personaName.localeCompare(b.personaName);
    if (userDiff !== 0) return userDiff;
    return a.application.localeCompare(b.application);
  });

  return groups;
}
