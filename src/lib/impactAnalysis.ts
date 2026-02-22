// lib/impactAnalysis.ts — "What if I disabled this policy?" analysis engine.
//
// For each applied policy, removes it from the set and re-runs the CA engine
// to determine the impact on the final verdict and required controls.

import { CAEngine } from '@/engine/CAEngine';
import type { ConditionalAccessPolicy } from '@/engine/models/Policy';
import type { SimulationContext } from '@/engine/models/SimulationContext';
import type { CAEngineResult } from '@/engine/models/EvaluationResult';
import {
  SWEEP_USER_TYPES,
  SWEEP_APPS,
  SWEEP_PLATFORMS,
  SWEEP_CLIENT_APPS,
  SWEEP_LOCATIONS,
  SWEEP_SIGN_IN_RISK,
  SWEEP_USER_RISK,
  SWEEP_USERS,
  buildSweepContext,
} from './sweepDimensions';

// ── Types ───────────────────────────────────────────────────────────

export type ImpactSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface VerdictChange {
  from: CAEngineResult['finalDecision'];
  to: CAEngineResult['finalDecision'];
  fromLabel: string;
  toLabel: string;
}

export interface ImpactGap {
  description: string;
  riskLevel: ImpactSeverity;
  detail: string;
  lostControls: string[];
}

export interface FallbackProtection {
  policyId: string;
  policyName: string;
  controls: string[];
  description: string;
  scope: string;
}

export interface AffectedUserEntry {
  label: string;
  scenariosAffected: number;
  scenariosTotal: number;
}

export interface AffectedUserBreakdown {
  affected: AffectedUserEntry[];
  notAffected: AffectedUserEntry[];
}

export interface OtherProtection {
  policyId: string;
  policyName: string;
  controls: string[];
  description: string;
}

export interface PolicyImpactResult {
  policyId: string;
  policyName: string;
  severity: ImpactSeverity;
  verdictChange: VerdictChange | null;
  controlsLost: string[];
  controlsRetained: string[];
  gapsCreated: ImpactGap[];
  stillProtectedBy: FallbackProtection[];
  otherProtectionActive: OtherProtection[];
  withoutResult: {
    appliedCount: number;
    reportOnlyCount: number;
    decision: CAEngineResult['finalDecision'];
    requiredControls: string[];
  };
}

export interface ImpactAnalysisResult {
  baselineResult: CAEngineResult;
  policyImpacts: PolicyImpactResult[];
  scenarioDescription: string;
}

// ── Sweep types ─────────────────────────────────────────────────────

export interface PolicyImpactSweepResult extends PolicyImpactResult {
  /** How many scenarios change verdict when this policy is removed */
  affectedScenarios: number;
  /** Total scenarios swept */
  totalScenarios: number;
  /** Percentage of scenarios with enforced controls/block WITH this policy */
  coverageBefore: number;
  /** Percentage of scenarios with enforced controls/block WITHOUT this policy */
  coverageAfter: number;
  /** Which user dimension values are affected vs unaffected */
  affectedUserTypes: AffectedUserBreakdown;
}

export interface ImpactSweepResult {
  /** Per-policy impact with sweep statistics */
  policyImpacts: PolicyImpactSweepResult[];
  /** Total scenarios in the sweep */
  totalScenarios: number;
  /** Baseline coverage percentage (all policies active) */
  baselineCoverage: number;
}

// ── Security posture weights ────────────────────────────────────────
//
// Each control type contributes points to a per-scenario security posture
// score (0–10). Higher = stronger protection. These are exported so the
// ScoringMethodologyDialog can display them.

export const CONTROL_WEIGHTS: Record<string, number> = {
  block: 10,
  mfa: 3,
  compliantDevice: 3,
  domainJoinedDevice: 3,
  approvedApplication: 2,
  compliantApplication: 2,
  passwordChange: 1,
};

export const AUTH_STRENGTH_WEIGHT = 5;
export const SESSION_SIGN_IN_FREQUENCY_WEIGHT = 1;
export const MAX_POSTURE_SCORE = 10;

/**
 * Compute a security posture score (0–10) for a single engine result.
 *
 * Rules:
 * - block = instant 10 (access denied, nothing else matters)
 * - authenticationStrength and mfa don't stack — take the higher
 * - compliantDevice and domainJoinedDevice don't stack — take the higher
 * - sign-in frequency session control adds 1 point
 * - Cap at MAX_POSTURE_SCORE
 * - allow with no controls = 0
 */
export function computePostureScore(result: CAEngineResult): number {
  if (result.finalDecision === 'allow' && result.requiredControls.length === 0) {
    return 0;
  }

  if (result.finalDecision === 'block') {
    return MAX_POSTURE_SCORE;
  }

  let score = 0;
  const controls = new Set(result.requiredControls);

  // Auth: take the stronger of authenticationStrength vs mfa (don't stack)
  const hasAuthStrength = result.requiredControls.some(c => c.startsWith('authenticationStrength:'));
  if (hasAuthStrength) {
    score += AUTH_STRENGTH_WEIGHT;
  } else if (controls.has('mfa')) {
    score += CONTROL_WEIGHTS.mfa;
  }

  // Device: take the stronger of compliantDevice vs domainJoinedDevice (don't stack)
  if (controls.has('compliantDevice')) {
    score += CONTROL_WEIGHTS.compliantDevice;
  } else if (controls.has('domainJoinedDevice')) {
    score += CONTROL_WEIGHTS.domainJoinedDevice;
  }

  // App protection controls (these do stack)
  if (controls.has('approvedApplication')) score += CONTROL_WEIGHTS.approvedApplication;
  if (controls.has('compliantApplication')) score += CONTROL_WEIGHTS.compliantApplication;

  // Remediation
  if (controls.has('passwordChange')) score += CONTROL_WEIGHTS.passwordChange;

  // Session controls: check for sign-in frequency
  if (result.sessionControls?.signInFrequency?.isEnabled) {
    score += SESSION_SIGN_IN_FREQUENCY_WEIGHT;
  }

  return Math.min(score, MAX_POSTURE_SCORE);
}

// ── Severity ordering ───────────────────────────────────────────────

const SEVERITY_ORDER: Record<ImpactSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// ── Utilities ───────────────────────────────────────────────────────

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Human-readable label for a verdict + controls combination. */
export function describeVerdict(
  decision: CAEngineResult['finalDecision'],
  controls: string[],
): string {
  if (decision === 'block') return 'Block';
  if (decision === 'allow') return 'Allow';
  // controlsRequired
  if (controls.length === 0) return 'Controls Required';
  const labels = controls.map(formatControlName);
  return `Controls Required (${labels.join(' + ')})`;
}

/** Format an authentication strength name for display, avoiding redundancy. */
function formatAuthStrengthName(rawName: string): string {
  // If the name already mentions "authentication", just use it directly
  if (rawName.toLowerCase().includes('authentication')) {
    return rawName;
  }
  return `${rawName} authentication strength`;
}

function formatControlName(control: string): string {
  if (control.startsWith('authenticationStrength:')) {
    const strengthName = control.substring('authenticationStrength:'.length);
    return `${formatAuthStrengthName(strengthName)}`;
  }
  const CONTROL_LABELS: Record<string, string> = {
    mfa: 'MFA',
    compliantDevice: 'Compliant Device',
    domainJoinedDevice: 'Hybrid Azure AD Join',
    approvedApplication: 'Approved App',
    compliantApplication: 'App Protection',
    passwordChange: 'Password Change',
    block: 'Block',
  };
  return CONTROL_LABELS[control] ?? control;
}

/** Generate gap descriptions for each lost control. */
function generateGaps(controlsLost: string[], appName: string): ImpactGap[] {
  const gaps: ImpactGap[] = [];

  for (const control of controlsLost) {
    switch (control) {
      case 'mfa':
        gaps.push({
          description: 'No MFA required for this scenario',
          riskLevel: 'critical',
          detail: `Users can access ${appName} with password only`,
          lostControls: [control],
        });
        break;
      case 'compliantDevice':
        gaps.push({
          description: 'No device compliance check',
          riskLevel: 'high',
          detail: `Unmanaged devices can access ${appName}`,
          lostControls: [control],
        });
        break;
      case 'domainJoinedDevice':
        gaps.push({
          description: 'No hybrid join requirement',
          riskLevel: 'high',
          detail: `Non-domain-joined devices can access ${appName}`,
          lostControls: [control],
        });
        break;
      case 'block':
        gaps.push({
          description: `${appName} access no longer blocked`,
          riskLevel: 'critical',
          detail: 'This scenario was previously blocked — now users can attempt access',
          lostControls: [control],
        });
        break;
      case 'approvedApplication':
        gaps.push({
          description: 'No approved app requirement',
          riskLevel: 'medium',
          detail: `Unapproved apps can access ${appName}`,
          lostControls: [control],
        });
        break;
      case 'compliantApplication':
        gaps.push({
          description: 'No app protection policy required',
          riskLevel: 'medium',
          detail: `Apps without protection policies can access ${appName}`,
          lostControls: [control],
        });
        break;
      case 'passwordChange':
        gaps.push({
          description: 'No password change required',
          riskLevel: 'high',
          detail: `Compromised passwords may remain in use for ${appName}`,
          lostControls: [control],
        });
        break;
      default:
        if (control.startsWith('authenticationStrength:')) {
          const strengthName = control.substring('authenticationStrength:'.length);
          const displayName = formatAuthStrengthName(strengthName);
          gaps.push({
            description: `${displayName} no longer required`,
            riskLevel: 'high',
            detail: `The ${displayName} is no longer enforced for ${appName}. Users may authenticate with weaker methods.`,
            lostControls: [control],
          });
        } else {
          gaps.push({
            description: `${formatControlName(control)} no longer required`,
            riskLevel: 'medium',
            detail: `The ${formatControlName(control)} control is no longer enforced for ${appName}`,
            lostControls: [control],
          });
        }
    }
  }

  return gaps;
}

/**
 * Check if a policy control "covers" a lost control, accounting for
 * semantic equivalence between related controls.
 *
 * - Any authenticationStrength:* covers mfa (it's strictly stronger)
 * - mfa partially covers any authenticationStrength:* (weaker but present)
 * - compliantDevice and domainJoinedDevice cover each other (both prove device trust)
 */
function controlCovers(policyControl: string, lostControl: string): boolean {
  // Exact match
  if (policyControl === lostControl) return true;

  // Auth strength covers MFA
  if (policyControl.startsWith('authenticationStrength:') && lostControl === 'mfa') return true;

  // MFA covers auth strength (weaker fallback, but still protection)
  if (policyControl === 'mfa' && lostControl.startsWith('authenticationStrength:')) return true;

  // Device trust equivalence
  if (
    (policyControl === 'compliantDevice' && lostControl === 'domainJoinedDevice') ||
    (policyControl === 'domainJoinedDevice' && lostControl === 'compliantDevice')
  ) return true;

  return false;
}

/**
 * Extract a short human-readable scope from a policy's conditions.
 * Returns phrases like "for all users", "for administrators",
 * "for all users, Office 365, untrusted locations", etc.
 */
function describePolicyScope(policy: ConditionalAccessPolicy): string {
  const userScope: string[] = [];
  const qualifiers: string[] = [];

  // User scope (gets the "for" prefix)
  const users = policy.conditions.users;
  if (users.includeUsers.includes('All')) {
    if (users.excludeRoles.length > 0 || users.excludeUsers.length > 0 || users.excludeGroups.length > 0) {
      userScope.push('most users');
    } else {
      userScope.push('all users');
    }
  } else if (users.includeRoles.length > 0 && users.includeUsers.length === 0 && users.includeGroups.length === 0) {
    userScope.push('administrators');
  } else if (users.includeUsers.includes('GuestsOrExternalUsers') || users.includeGuestsOrExternalUsers) {
    userScope.push('guest users');
  }

  // App scope (qualifier, no "for")
  const apps = policy.conditions.applications;
  if (apps.includeApplications.includes('Office365')) {
    qualifiers.push('Office 365');
  } else if (apps.includeApplications.includes('MicrosoftAdminPortals')) {
    qualifiers.push('admin portals');
  } else if (!apps.includeApplications.includes('All') && apps.includeApplications.length > 0) {
    qualifiers.push('specific apps');
  }

  // Location scope (qualifier)
  const locations = policy.conditions.locations;
  if (locations) {
    if (locations.includeLocations.includes('All') && locations.excludeLocations.includes('AllTrusted')) {
      qualifiers.push('untrusted locations');
    } else if (locations.includeLocations.includes('AllTrusted')) {
      qualifiers.push('trusted locations');
    }
  }

  // Risk scope (qualifier)
  if (policy.conditions.signInRiskLevels.length > 0) {
    const levels = policy.conditions.signInRiskLevels;
    if (levels.includes('high') && levels.length === 1) {
      qualifiers.push('high-risk sign-ins');
    } else if (levels.length > 0) {
      qualifiers.push('risky sign-ins');
    }
  }

  // Assemble: "for {users}, {app}, {location}"
  const allParts = [...userScope, ...qualifiers];
  if (allParts.length === 0) return '';
  return `for ${allParts.join(', ')}`;
}

/**
 * Generate a contextual description for a fallback policy, explaining
 * what it still provides relative to what was lost, including scope.
 */
function describeFallback(
  fallbackControls: string[],
  allControlsLost: string[],
  policy: ConditionalAccessPolicy,
): string {
  const parts: string[] = [];

  for (const control of fallbackControls) {
    if (control === 'mfa') {
      parts.push('MFA still required');
    } else if (control.startsWith('authenticationStrength:')) {
      const name = control.substring('authenticationStrength:'.length);
      parts.push(`${formatAuthStrengthName(name)} still enforced`);
    } else if (control === 'compliantDevice') {
      parts.push('Device compliance still enforced');
    } else if (control === 'domainJoinedDevice') {
      parts.push('Hybrid Azure AD Join still required');
    } else if (control === 'approvedApplication') {
      parts.push('Approved app requirement still enforced');
    } else if (control === 'compliantApplication') {
      parts.push('App protection policy still required');
    } else if (control === 'passwordChange') {
      parts.push('Password change still required');
    } else {
      parts.push(`${formatControlName(control)} still enforced`);
    }
  }

  // Add scope qualifier
  const scope = describePolicyScope(policy);
  let result = parts.join(', ');
  if (scope) {
    result += ` ${scope}`;
  }

  // What's still missing despite this fallback (parenthetical)
  const coveredLost = allControlsLost.filter(lost =>
    fallbackControls.some(fc => controlCovers(fc, lost))
  );
  const stillMissing = allControlsLost.filter(lost => !coveredLost.includes(lost));

  if (stillMissing.length > 0) {
    const missingLabels = stillMissing.map(c => {
      if (c === 'mfa') return 'MFA';
      if (c.startsWith('authenticationStrength:')) return 'authentication strength';
      if (c === 'compliantDevice') return 'device compliance';
      if (c === 'domainJoinedDevice') return 'hybrid join';
      if (c === 'approvedApplication') return 'approved app requirement';
      if (c === 'compliantApplication') return 'app protection';
      if (c === 'block') return 'access blocking';
      return formatControlName(c).toLowerCase();
    });
    result += ` (but ${missingLabels.join(' and ')} no longer enforced)`;
  }

  return result;
}

/** Find which remaining applied policies still provide the lost controls. */
function findFallbackPolicies(
  withoutResult: CAEngineResult,
  controlsLost: string[],
  policies: ConditionalAccessPolicy[],
): FallbackProtection[] {
  const policyMap = new Map(policies.map(p => [p.id, p]));
  const fallbacks: FallbackProtection[] = [];

  for (const applied of withoutResult.appliedPolicies) {
    if (!applied.grantControls) continue;

    // Build full control list including authenticationStrength label
    // (grantControls.controls only has builtInControls; auth strength is separate)
    const policyControls = [...applied.grantControls.controls];
    if (applied.grantControls.authenticationStrength) {
      const as = applied.grantControls.authenticationStrength;
      policyControls.push(`authenticationStrength:${as.displayName}`);
    }

    const overlapping = policyControls.filter((c) =>
      controlsLost.some((lost) => controlCovers(c, lost)),
    );
    if (overlapping.length > 0) {
      const sourcePolicy = policyMap.get(applied.policyId);
      fallbacks.push({
        policyId: applied.policyId,
        policyName: applied.policyName,
        controls: overlapping,
        description: sourcePolicy
          ? describeFallback(overlapping, controlsLost, sourcePolicy)
          : overlapping.map(c => formatControlName(c)).join(', '),
        scope: applied.policyName,
      });
    }
  }

  return fallbacks;
}

/**
 * Find policies that still apply after disabling the target policy,
 * but enforce DIFFERENT controls than what was lost. These don't cover
 * the gap but provide other security value.
 *
 * Excludes policies already listed in stillProtectedBy (fallbacks).
 */
function findOtherProtection(
  withoutResult: CAEngineResult,
  fallbackPolicyIds: Set<string>,
  policies: ConditionalAccessPolicy[],
): OtherProtection[] {
  const policyMap = new Map(policies.map(p => [p.id, p]));
  const others: OtherProtection[] = [];

  for (const applied of withoutResult.appliedPolicies) {
    // Skip policies already shown as fallbacks
    if (fallbackPolicyIds.has(applied.policyId)) continue;

    // Skip policies with no grant or session controls
    const hasGrant = applied.grantControls && applied.grantControls.controls.length > 0;
    const hasSession = applied.sessionControls && (
      applied.sessionControls.signInFrequency !== undefined ||
      applied.sessionControls.persistentBrowser !== undefined ||
      applied.sessionControls.cloudAppSecurity !== undefined
    );
    if (!hasGrant && !hasSession) continue;

    const sourcePolicy = policyMap.get(applied.policyId);
    const scope = sourcePolicy ? describePolicyScope(sourcePolicy) : '';
    const descParts: string[] = [];

    // Describe grant controls
    if (applied.grantControls && applied.grantControls.controls.length > 0) {
      const controlLabels = applied.grantControls.controls.map(c => {
        if (c === 'mfa') return 'MFA';
        if (c === 'compliantDevice') return 'device compliance';
        if (c === 'domainJoinedDevice') return 'hybrid Azure AD join';
        if (c === 'approvedApplication') return 'approved app requirement';
        if (c === 'compliantApplication') return 'app protection';
        if (c === 'passwordChange') return 'password change';
        if (c === 'block') return 'access blocked';
        return formatControlName(c);
      });
      descParts.push(controlLabels.join(', ') + ' enforced');
    }

    // Describe session controls
    if (applied.sessionControls?.signInFrequency !== undefined) {
      descParts.push('sign-in frequency controls');
    }
    if (applied.sessionControls?.persistentBrowser !== undefined) {
      descParts.push('persistent browser restrictions');
    }
    if (applied.sessionControls?.cloudAppSecurity !== undefined) {
      descParts.push('Cloud App Security monitoring');
    }

    if (descParts.length === 0) continue;

    let description = descParts.join(' · ');
    if (scope) description += ` ${scope}`;

    others.push({
      policyId: applied.policyId,
      policyName: applied.policyName,
      controls: applied.grantControls?.controls ?? [],
      description,
    });
  }

  return others;
}

/** Compute severity based on verdict change, lost controls, and fallbacks. */
function computeSeverity(
  baselineDecision: CAEngineResult['finalDecision'],
  withoutDecision: CAEngineResult['finalDecision'],
  controlsLost: string[],
  fallbacks: FallbackProtection[],
  isReportOnly: boolean,
): ImpactSeverity {
  // Report-only policies have zero enforcement impact
  if (isReportOnly) return 'low';

  // Verdict changes from block/controlsRequired → allow
  if (
    (baselineDecision === 'block' || baselineDecision === 'controlsRequired') &&
    withoutDecision === 'allow'
  ) {
    return 'critical';
  }

  // All controls lost with no fallback
  if (controlsLost.length > 0 && fallbacks.length === 0) {
    // Block lost is always critical — access was denied, now it's not
    if (controlsLost.includes('block')) return 'critical';
    // Other controls lost with no fallback — serious but not access denial
    return 'high';
  }

  // Verdict changes type (e.g. block → controlsRequired)
  if (baselineDecision !== withoutDecision) {
    return 'high';
  }

  // Controls lost but some fallback exists
  if (controlsLost.length > 0 && fallbacks.length > 0) {
    return 'high';
  }

  // No verdict change, some controls shifted (rare)
  if (controlsLost.length > 0) {
    return 'medium';
  }

  return 'low';
}

/** Build a human-readable scenario description from the simulation context. */
function buildScenarioDescription(context: SimulationContext): string {
  const parts: string[] = [];

  // User
  parts.push(context.user.displayName);

  // Application
  parts.push(context.application.displayName || context.application.appId);

  // Details
  const details: string[] = [];
  if (context.clientAppType) details.push(formatClientApp(context.clientAppType));
  if (context.device.platform) details.push(context.device.platform);
  if (context.location.isTrustedLocation === true) details.push('Trusted Location');
  if (context.location.isTrustedLocation === false) details.push('Untrusted Location');

  if (details.length > 0) {
    parts.push(`(${details.join(', ')})`);
  }

  return parts.join(' → ');
}

function formatClientApp(clientApp: string): string {
  const labels: Record<string, string> = {
    browser: 'Browser',
    mobileAppsAndDesktopClients: 'Mobile/Desktop',
    exchangeActiveSync: 'Exchange ActiveSync',
    other: 'Other Clients',
  };
  return labels[clientApp] ?? clientApp;
}

// ── Main Function ───────────────────────────────────────────────────

/**
 * Analyze the impact of disabling each policy in the current scenario.
 *
 * For each enabled policy that applies (or could apply), removes it from the
 * policy set and re-runs the engine to determine what changes.
 */
export function analyzeImpact(
  policies: ConditionalAccessPolicy[],
  context: SimulationContext,
): ImpactAnalysisResult {
  const engine = new CAEngine();
  const baselineResult = engine.evaluate(policies, context);
  const appName = context.application.displayName || context.application.appId;

  // Collect candidate policy IDs: all applied + report-only from baseline
  const appliedIds = new Set(baselineResult.appliedPolicies.map((p) => p.policyId));
  const reportOnlyIds = new Set(baselineResult.reportOnlyPolicies.map((p) => p.policyId));

  const policyImpacts: PolicyImpactResult[] = [];

  for (const policy of policies) {
    // Skip disabled policies entirely
    if (policy.state === 'disabled') continue;

    const isApplied = appliedIds.has(policy.id);
    const isReportOnly = reportOnlyIds.has(policy.id);

    // Non-applying enabled policies: include with low severity
    if (!isApplied && !isReportOnly) {
      policyImpacts.push({
        policyId: policy.id,
        policyName: policy.displayName,
        severity: 'low',
        verdictChange: null,
        controlsLost: [],
        controlsRetained: [...baselineResult.requiredControls],
        gapsCreated: [],
        stillProtectedBy: [],
        otherProtectionActive: [],
        withoutResult: {
          appliedCount: baselineResult.appliedPolicies.length,
          reportOnlyCount: baselineResult.reportOnlyPolicies.length,
          decision: baselineResult.finalDecision,
          requiredControls: [...baselineResult.requiredControls],
        },
      });
      continue;
    }

    // Remove this policy and re-evaluate
    const withoutPolicies = policies.filter((p) => p.id !== policy.id);
    const withoutResult = engine.evaluate(withoutPolicies, context);

    // Diff controls
    const baselineControls = new Set(baselineResult.requiredControls);
    const withoutControls = new Set(withoutResult.requiredControls);

    // For block policies, treat 'block' as a control for diffing purposes
    if (baselineResult.finalDecision === 'block' && withoutResult.finalDecision !== 'block') {
      baselineControls.add('block');
    }

    const controlsLost = [...baselineControls].filter((c) => !withoutControls.has(c));
    const controlsRetained = [...baselineControls].filter((c) => withoutControls.has(c));

    // Verdict change
    let verdictChange: VerdictChange | null = null;
    if (baselineResult.finalDecision !== withoutResult.finalDecision) {
      verdictChange = {
        from: baselineResult.finalDecision,
        to: withoutResult.finalDecision,
        fromLabel: describeVerdict(baselineResult.finalDecision, baselineResult.requiredControls),
        toLabel: describeVerdict(withoutResult.finalDecision, withoutResult.requiredControls),
      };
    }

    // Gaps, fallbacks, and other active protection
    const gapsCreated = generateGaps(controlsLost, appName);
    const fallbacks = findFallbackPolicies(withoutResult, controlsLost, policies);
    const fallbackIds = new Set(fallbacks.map(fb => fb.policyId));
    const otherProtectionActive = findOtherProtection(withoutResult, fallbackIds, policies);

    // Severity
    const severity = computeSeverity(
      baselineResult.finalDecision,
      withoutResult.finalDecision,
      controlsLost,
      fallbacks,
      isReportOnly,
    );

    policyImpacts.push({
      policyId: policy.id,
      policyName: policy.displayName,
      severity,
      verdictChange,
      controlsLost,
      controlsRetained,
      gapsCreated,
      stillProtectedBy: fallbacks,
      otherProtectionActive,
      withoutResult: {
        appliedCount: withoutResult.appliedPolicies.length,
        reportOnlyCount: withoutResult.reportOnlyPolicies.length,
        decision: withoutResult.finalDecision,
        requiredControls: [...withoutResult.requiredControls],
      },
    });
  }

  // Sort: severity first (critical < high < medium < low), then name
  policyImpacts.sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return a.policyName.localeCompare(b.policyName);
  });

  return {
    baselineResult,
    policyImpacts,
    scenarioDescription: buildScenarioDescription(context),
  };
}

// ── Sweep Function ──────────────────────────────────────────────────
//
// Performance: totalScenarios + sum(appliedScenariosPerPolicy) engine
// evaluations. With ~20 policies and ~5760 scenarios this is well under
// 200K calls, completing in 1-3 seconds.

/**
 * Run impact analysis across the full scenario matrix to produce aggregate
 * statistics like "affects 14 of 19 scenarios" and coverage score percentages.
 */
export function analyzeImpactSweep(
  policies: ConditionalAccessPolicy[],
): ImpactSweepResult {
  const engine = new CAEngine();

  // ── 1. Generate all sweep scenarios ──
  const scenarios: SimulationContext[] = [];
  for (const userType of SWEEP_USER_TYPES) {
    const user = SWEEP_USERS[userType];
    for (const app of SWEEP_APPS) {
      for (const platform of SWEEP_PLATFORMS) {
        for (const clientApp of SWEEP_CLIENT_APPS) {
          for (const location of SWEEP_LOCATIONS) {
            for (const signInRisk of SWEEP_SIGN_IN_RISK) {
              for (const userRisk of SWEEP_USER_RISK) {
                scenarios.push(buildSweepContext(user, app, platform, clientApp, location, signInRisk, userRisk));
              }
            }
          }
        }
      }
    }
  }

  const totalScenarios = scenarios.length;
  const scenariosPerUserType = totalScenarios / SWEEP_USER_TYPES.length;

  // ── 2. Baseline sweep ──
  const baselineResults: CAEngineResult[] = new Array(totalScenarios);
  // Track which policies applied to which scenarios
  const policyScenarioMap = new Map<string, Set<number>>();

  let baselineScoreSum = 0;

  for (let i = 0; i < totalScenarios; i++) {
    const result = engine.evaluate(policies, scenarios[i]);
    baselineResults[i] = result;

    baselineScoreSum += computePostureScore(result);

    // Record applied + report-only policy → scenario mapping
    for (const applied of result.appliedPolicies) {
      let set = policyScenarioMap.get(applied.policyId);
      if (!set) { set = new Set(); policyScenarioMap.set(applied.policyId, set); }
      set.add(i);
    }
    for (const ro of result.reportOnlyPolicies) {
      let set = policyScenarioMap.get(ro.policyId);
      if (!set) { set = new Set(); policyScenarioMap.set(ro.policyId, set); }
      set.add(i);
    }
  }

  const baselineCoverage = totalScenarios > 0
    ? (baselineScoreSum / (totalScenarios * MAX_POSTURE_SCORE)) * 100
    : 0;

  // ── 3. Per-policy sweep ──
  const sweepImpacts: PolicyImpactSweepResult[] = [];

  for (const policy of policies) {
    if (policy.state === 'disabled') continue;

    const appliedScenarios = policyScenarioMap.get(policy.id) ?? new Set<number>();
    const isReportOnly = policy.state === 'enabledForReportingButNotEnforced';
    const withoutPolicies = policies.filter((p) => p.id !== policy.id);

    let affectedScenarios = 0;
    let withoutScoreSum = 0;

    // Track affected counts per user type
    const userTypeAffected = new Array<number>(SWEEP_USER_TYPES.length).fill(0);

    // Representative scenario for qualitative fields
    let representativeIndex = -1;

    for (let i = 0; i < totalScenarios; i++) {
      if (!appliedScenarios.has(i)) {
        // Policy didn't apply — result identical, use baseline score
        withoutScoreSum += computePostureScore(baselineResults[i]);
        continue;
      }

      // Re-evaluate without this policy
      const withoutResult = engine.evaluate(withoutPolicies, scenarios[i]);

      withoutScoreSum += computePostureScore(withoutResult);

      const verdictChanged = baselineResults[i].finalDecision !== withoutResult.finalDecision;
      const controlsChanged = !arraysEqual(
        baselineResults[i].requiredControls,
        withoutResult.requiredControls,
      );
      if (verdictChanged || controlsChanged) {
        affectedScenarios++;
        const userTypeIdx = Math.floor(i / scenariosPerUserType);
        userTypeAffected[userTypeIdx]++;
        if (representativeIndex === -1) {
          representativeIndex = i;
        }
      }
    }

    // Build user type breakdown
    const affectedEntries: AffectedUserEntry[] = [];
    const notAffectedEntries: AffectedUserEntry[] = [];
    for (let u = 0; u < SWEEP_USER_TYPES.length; u++) {
      const entry: AffectedUserEntry = {
        label: SWEEP_USERS[SWEEP_USER_TYPES[u]].displayName,
        scenariosAffected: userTypeAffected[u],
        scenariosTotal: scenariosPerUserType,
      };
      if (userTypeAffected[u] > 0) {
        affectedEntries.push(entry);
      } else {
        notAffectedEntries.push(entry);
      }
    }
    affectedEntries.sort((a, b) => b.scenariosAffected - a.scenariosAffected);
    const affectedUserTypes: AffectedUserBreakdown = { affected: affectedEntries, notAffected: notAffectedEntries };

    const coverageBefore = baselineCoverage;
    const coverageAfter = totalScenarios > 0
      ? (withoutScoreSum / (totalScenarios * MAX_POSTURE_SCORE)) * 100
      : 0;

    // Build single-scenario analysis from representative scenario (or first applied)
    let singleImpact: PolicyImpactResult;

    if (representativeIndex >= 0) {
      // Use the representative scenario for qualitative analysis
      const repResult = analyzeImpact(policies, scenarios[representativeIndex]);
      const found = repResult.policyImpacts.find((p) => p.policyId === policy.id);
      singleImpact = found ?? buildNoImpactResult(policy, baselineResults[0]);
    } else if (appliedScenarios.size > 0) {
      // Policy applied but verdict never changed — use first applied scenario
      const firstApplied = appliedScenarios.values().next().value!;
      const repResult = analyzeImpact(policies, scenarios[firstApplied]);
      const found = repResult.policyImpacts.find((p) => p.policyId === policy.id);
      singleImpact = found ?? buildNoImpactResult(policy, baselineResults[0]);
    } else {
      // Non-applying policy
      singleImpact = buildNoImpactResult(policy, baselineResults[0] ?? { finalDecision: 'allow', requiredControls: [], appliedPolicies: [], reportOnlyPolicies: [] } as unknown as CAEngineResult);
    }

    // Severity adjustment: sweep data can escalate but not downgrade
    let severity = singleImpact.severity;
    if (
      !isReportOnly &&
      affectedScenarios / totalScenarios > 0.5 &&
      severity === 'high'
    ) {
      severity = 'critical';
    }

    sweepImpacts.push({
      ...singleImpact,
      severity,
      affectedScenarios,
      totalScenarios,
      coverageBefore,
      coverageAfter,
      affectedUserTypes,
    });
  }

  // Sort: severity, then affectedScenarios descending, then name
  sweepImpacts.sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sevDiff !== 0) return sevDiff;
    const affDiff = b.affectedScenarios - a.affectedScenarios;
    if (affDiff !== 0) return affDiff;
    return a.policyName.localeCompare(b.policyName);
  });

  return {
    policyImpacts: sweepImpacts,
    totalScenarios,
    baselineCoverage,
  };
}

/** Helper to build a no-impact result for non-applying policies. */
function buildNoImpactResult(
  policy: ConditionalAccessPolicy,
  baselineResult: CAEngineResult,
): PolicyImpactResult {
  return {
    policyId: policy.id,
    policyName: policy.displayName,
    severity: 'low',
    verdictChange: null,
    controlsLost: [],
    controlsRetained: [...(baselineResult.requiredControls ?? [])],
    gapsCreated: [],
    stillProtectedBy: [],
    otherProtectionActive: [],
    withoutResult: {
      appliedCount: baselineResult.appliedPolicies?.length ?? 0,
      reportOnlyCount: baselineResult.reportOnlyPolicies?.length ?? 0,
      decision: baselineResult.finalDecision ?? 'allow',
      requiredControls: [...(baselineResult.requiredControls ?? [])],
    },
  };
}
