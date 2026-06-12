// lib/baselineAssessment.ts — Outcome-based baseline assessment.
//
// Each catalog check defines target scenarios and an expected guarantee;
// this module runs them through the engine and judges whether the guarantee
// holds. Guarantee semantics mirror lib/guaranteedControls: a control counts
// only if every path through a policy's grant enforces it (AND policies,
// single-option grants, or OR grants whose every alternative satisfies the
// expectation). A block verdict satisfies any expectation.

import { CAEngine } from '@/engine/CAEngine';
import { AUTH_STRENGTH_HIERARCHY } from '@/engine/authenticationStrength';
import type { ConditionalAccessPolicy, ClientAppType, DevicePlatform, RiskLevel, InsiderRiskLevel } from '@/engine/models/Policy';
import type { SimulationContext, UserContext } from '@/engine/models/SimulationContext';
import type { CAEngineResult } from '@/engine/models/EvaluationResult';
import { applySandboxOverrides, type SandboxOverrides } from './sandbox';
import { SWEEP_APPS, SWEEP_PLATFORMS, SWEEP_CLIENT_APPS, SWEEP_USERS, APP_DISPLAY_NAMES } from './sweepDimensions';
import {
  BASELINE_CHECKS,
  type BaselineCheck,
  type BaselineExpectation,
  type BaselineCategory,
} from '@/data/baselineChecks';

// ── Types ───────────────────────────────────────────────────────────

export type BaselineStatus = 'pass' | 'reportOnly' | 'partial' | 'fail';

export interface BaselineCheckResult {
  check: BaselineCheck;
  status: BaselineStatus;
  scenariosPassed: number;
  scenariosTotal: number;
  /** Example scenarios where the guarantee does not hold (capped) */
  failingExamples: string[];
  /** Policies providing the guarantee, when passing (capped) */
  satisfyingPolicies: string[];
  /** Report-only policies whose promotion would make the check pass (capped) */
  promotablePolicies: string[];
}

export interface BaselineAssessmentResult {
  checks: BaselineCheckResult[];
  counts: Record<BaselineStatus, number>;
  categoryCounts: Record<BaselineCategory, { passed: number; total: number }>;
}

const EXAMPLE_CAP = 5;
const POLICY_CAP = 5;

// ── Scenario generation ─────────────────────────────────────────────

interface BaselineScenario {
  context: SimulationContext;
  description: string;
}

const CLIENT_LABELS: Record<ClientAppType, string> = {
  browser: 'Browser',
  mobileAppsAndDesktopClients: 'Mobile/Desktop',
  exchangeActiveSync: 'Exchange ActiveSync',
  other: 'Other (Legacy)',
};

/** Synthetic identities for agent checks */
const SWEEP_GENERIC_AGENT = { servicePrincipalId: 'sweep-generic-agent', displayName: 'Generic agent' };
const SWEEP_AGENT_USER: UserContext = {
  id: 'sweep-agent-user',
  displayName: 'Agent user account',
  userType: 'member',
  memberOfGroupIds: [],
  directoryRoleIds: [],
};

/** Agent sign-in scenarios: no personas, no device platform, browser client. */
function generateAgentScenarios(check: BaselineCheck): BaselineScenario[] {
  const spec = check.assessment;
  const identity = spec.identity!;
  const scenarios: BaselineScenario[] = [];

  const targets = spec.target.kind === 'app'
    ? [{ appId: spec.target.appId, displayName: spec.target.displayName }]
    : SWEEP_APPS.map((appId) => ({ appId, displayName: APP_DISPLAY_NAMES[appId] ?? appId }));
  const locations = spec.locations ?? ['trusted', 'untrusted'];
  const agentRisks = identity.agentRiskLevels ?? ['none'];

  const isAgentIdentity = identity.type === 'agentIdentity';
  const label = isAgentIdentity ? SWEEP_GENERIC_AGENT.displayName : SWEEP_AGENT_USER.displayName;

  for (const target of targets) {
    for (const location of locations) {
      for (const agentRisk of agentRisks) {
        scenarios.push({
          context: {
            user: isAgentIdentity
              ? { id: 'sweep-agent-placeholder', displayName: label, userType: 'member', memberOfGroupIds: [], directoryRoleIds: [] }
              : SWEEP_AGENT_USER,
            identityType: identity.type,
            ...(isAgentIdentity ? { agent: SWEEP_GENERIC_AGENT } : {}),
            application: { appId: target.appId, displayName: target.displayName },
            device: {}, // agents have no device platform
            location: { isTrustedLocation: location === 'trusted' },
            risk: {
              signInRiskLevel: 'none',
              userRiskLevel: 'none',
              insiderRiskLevel: 'none',
              agentRiskLevel: agentRisk as RiskLevel | 'none',
            },
            clientAppType: 'browser',
            authenticationFlow: 'none',
            authenticationStrengthLevel: 0,
            satisfiedControls: [],
          },
          description: [
            `${label} → ${target.displayName}`,
            `${location} location`,
            ...(agentRisk !== 'none' ? [`${agentRisk} agent risk`] : []),
          ].join(', '),
        });
      }
    }
  }
  return scenarios;
}

function generateScenarios(check: BaselineCheck): BaselineScenario[] {
  const spec = check.assessment;
  if (spec.identity) return generateAgentScenarios(check);
  const scenarios: BaselineScenario[] = [];

  const targets: { appId: string; displayName: string; userAction?: 'registerSecurityInformation' }[] =
    spec.target.kind === 'sweepApps'
      ? SWEEP_APPS.map((appId) => ({ appId, displayName: APP_DISPLAY_NAMES[appId] ?? appId }))
      : spec.target.kind === 'app'
        ? [{ appId: spec.target.appId, displayName: spec.target.displayName }]
        : [{ appId: '', displayName: spec.target.displayName, userAction: spec.target.action }];

  const platforms: (DevicePlatform | undefined)[] =
    spec.platforms === 'unknown' ? [undefined] : (spec.platforms ?? [...SWEEP_PLATFORMS]);
  const clientApps = spec.clientApps ?? [...SWEEP_CLIENT_APPS];
  const locations = spec.locations ?? ['trusted', 'untrusted'];
  const signInRisks = spec.signInRiskLevels ?? ['none'];
  const userRisks = spec.userRiskLevels ?? ['none'];
  const insiderRisks = spec.insiderRiskLevels ?? ['none'];

  for (const persona of spec.personas) {
    const user: UserContext = SWEEP_USERS[persona];
    for (const target of targets) {
      for (const platform of platforms) {
        for (const clientApp of clientApps) {
          for (const location of locations) {
            for (const signInRisk of signInRisks) {
              for (const userRisk of userRisks) {
                for (const insiderRisk of insiderRisks) {
                  scenarios.push({
                    context: {
                      user,
                      application: target.userAction
                        ? { appId: '', displayName: target.displayName, userAction: target.userAction }
                        : { appId: target.appId, displayName: target.displayName },
                      device: { platform },
                      location: { isTrustedLocation: location === 'trusted' },
                      risk: {
                        signInRiskLevel: signInRisk as RiskLevel | 'none',
                        userRiskLevel: userRisk as RiskLevel | 'none',
                        insiderRiskLevel: insiderRisk as InsiderRiskLevel | 'none',
                      },
                      clientAppType: clientApp,
                      authenticationFlow: 'none',
                      authenticationStrengthLevel: 0,
                      satisfiedControls: [],
                    },
                    description: describeScenario(user, target.displayName, platform, clientApp, location, signInRisk, userRisk, insiderRisk),
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  return scenarios;
}

function describeScenario(
  user: UserContext,
  targetName: string,
  platform: DevicePlatform | undefined,
  clientApp: ClientAppType,
  location: string,
  signInRisk: string,
  userRisk: string,
  insiderRisk: string,
): string {
  const parts = [
    `${user.displayName} → ${targetName}`,
    platform ?? 'unknown platform',
    CLIENT_LABELS[clientApp],
    `${location} location`,
  ];
  if (signInRisk !== 'none') parts.push(`${signInRisk} sign-in risk`);
  if (userRisk !== 'none') parts.push(`${userRisk} user risk`);
  if (insiderRisk !== 'none') parts.push(`${insiderRisk} insider risk`);
  return parts.join(', ');
}

// ── Guarantee judgment ──────────────────────────────────────────────

interface GrantUnit {
  control: string;
  authStrengthId?: string;
}

function authStrengthTier(
  strengthId: string,
  customAuthStrengthMap?: ReadonlyMap<string, number>,
): number {
  return AUTH_STRENGTH_HIERARCHY.get(strengthId)
    ?? customAuthStrengthMap?.get(strengthId)
    ?? 1; // unknown custom strength: counts as MFA, never as phishing-resistant
}

function unitMeetsExpectation(
  unit: GrantUnit,
  expect: BaselineExpectation,
  customAuthStrengthMap?: ReadonlyMap<string, number>,
): boolean {
  switch (expect) {
    case 'block':
      return unit.control === 'block';
    case 'mfa':
      return unit.control === 'mfa' || unit.control === 'block' || unit.authStrengthId !== undefined;
    case 'phishing-resistant-mfa':
      return unit.control === 'block'
        || (unit.authStrengthId !== undefined && authStrengthTier(unit.authStrengthId, customAuthStrengthMap) >= 3);
    case 'device-trust':
      return unit.control === 'block' || unit.control === 'compliantDevice' || unit.control === 'domainJoinedDevice';
    case 'device-trust-or-mfa':
      return unitMeetsExpectation(unit, 'mfa', customAuthStrengthMap)
        || unitMeetsExpectation(unit, 'device-trust', customAuthStrengthMap);
    case 'app-protection':
      return unit.control === 'block' || unit.control === 'approvedApplication' || unit.control === 'compliantApplication';
    case 'password-change':
      return unit.control === 'block' || unit.control === 'passwordChange';
    default:
      return false;
  }
}

/**
 * Returns the name of a policy guaranteeing the expectation in this result,
 * or null if no policy does. Block verdicts satisfy everything.
 */
function findSatisfyingPolicy(
  result: CAEngineResult,
  expect: BaselineExpectation,
  customAuthStrengthMap?: ReadonlyMap<string, number>,
): string | null {
  // Session-control expectations are judged on the aggregated session controls
  if (expect === 'no-persistent-browser') {
    if (result.finalDecision === 'block') return blockSource(result);
    const pb = result.sessionControls.persistentBrowser;
    return pb?.isEnabled && pb.mode === 'never' ? pb.source : null;
  }
  if (expect === 'app-enforced-restrictions') {
    if (result.finalDecision === 'block') return blockSource(result);
    const aer = result.sessionControls.applicationEnforcedRestrictions;
    return aer?.isEnabled ? aer.source : null;
  }

  if (result.finalDecision === 'block' && expect !== 'block') {
    return blockSource(result);
  }

  for (const policy of result.appliedPolicies) {
    const gc = policy.grantControls;
    if (!gc) continue;

    const units: GrantUnit[] = gc.controls.map((control) => ({ control }));
    if (gc.authenticationStrength) {
      units.push({
        control: `authenticationStrength:${gc.authenticationStrength.displayName}`,
        authStrengthId: gc.authenticationStrength.policyStrengthId,
      });
    }
    if (units.length === 0) continue;

    const meets = (u: GrantUnit) => unitMeetsExpectation(u, expect, customAuthStrengthMap);
    const guaranteed =
      gc.operator === 'AND' || units.length === 1
        ? units.some(meets)      // every unit is individually guaranteed
        : units.every(meets);    // OR: every alternative must satisfy it
    if (guaranteed) return policy.policyName;
  }

  return null;
}

function blockSource(result: CAEngineResult): string {
  const blocker = result.appliedPolicies.find((p) => p.grantControls?.controls.includes('block'));
  return blocker?.policyName ?? 'Blocked';
}

// ── Assessment ──────────────────────────────────────────────────────

function pushCapped(list: string[], value: string, cap: number): void {
  if (list.length < cap && !list.includes(value)) list.push(value);
}

/**
 * Assess all baseline checks against a policy set.
 * Pure and synchronous; total cost is well under one full gap sweep.
 */
export function assessBaseline(
  policies: ConditionalAccessPolicy[],
  customAuthStrengthMap?: ReadonlyMap<string, number>,
): BaselineAssessmentResult {
  const engine = new CAEngine();

  // Promoted set for report-only detection (built once)
  const promotionOverrides: SandboxOverrides = {};
  for (const p of policies) {
    if (p.state === 'enabledForReportingButNotEnforced') {
      promotionOverrides[p.id] = 'enabled';
    }
  }
  const hasReportOnly = Object.keys(promotionOverrides).length > 0;
  const promotedPolicies = hasReportOnly ? applySandboxOverrides(policies, promotionOverrides) : policies;
  const reportOnlyIds = new Set(Object.keys(promotionOverrides));

  const checks: BaselineCheckResult[] = [];

  for (const check of BASELINE_CHECKS) {
    const scenarios = generateScenarios(check);
    const expect = check.assessment.expect;

    let passed = 0;
    const failingExamples: string[] = [];
    const failingIndices: number[] = [];
    const satisfyingPolicies: string[] = [];

    const withContext = (context: SimulationContext) => {
      if (customAuthStrengthMap && customAuthStrengthMap.size > 0) {
        return { ...context, customAuthStrengthMap: new Map(customAuthStrengthMap) };
      }
      return context;
    };

    scenarios.forEach((scenario, i) => {
      const result = engine.evaluate(policies, withContext(scenario.context));
      const satisfier = findSatisfyingPolicy(result, expect, customAuthStrengthMap);
      if (satisfier) {
        passed++;
        pushCapped(satisfyingPolicies, satisfier, POLICY_CAP);
      } else {
        failingIndices.push(i);
        pushCapped(failingExamples, scenario.description, EXAMPLE_CAP);
      }
    });

    // Report-only detection: would promoting report-only policies fix it?
    let status: BaselineStatus;
    const promotablePolicies: string[] = [];

    if (passed === scenarios.length) {
      status = 'pass';
    } else {
      let promotedFixesAll = false;
      if (hasReportOnly) {
        promotedFixesAll = true;
        for (const i of failingIndices) {
          const promotedResult = engine.evaluate(promotedPolicies, withContext(scenarios[i].context));
          const satisfier = findSatisfyingPolicy(promotedResult, expect, customAuthStrengthMap);
          if (!satisfier) {
            promotedFixesAll = false;
            break;
          }
          // Credit only genuinely report-only policies as promotable
          const satisfierPolicy = policies.find((p) => p.displayName === satisfier);
          if (satisfierPolicy && reportOnlyIds.has(satisfierPolicy.id)) {
            pushCapped(promotablePolicies, satisfier, POLICY_CAP);
          }
        }
      }

      if (promotedFixesAll && promotablePolicies.length > 0) {
        status = 'reportOnly';
      } else if (passed > 0) {
        status = 'partial';
      } else {
        status = 'fail';
      }
    }

    checks.push({
      check,
      status,
      scenariosPassed: passed,
      scenariosTotal: scenarios.length,
      failingExamples,
      satisfyingPolicies,
      promotablePolicies,
    });
  }

  // Summaries
  const counts: Record<BaselineStatus, number> = { pass: 0, reportOnly: 0, partial: 0, fail: 0 };
  const categoryCounts = {
    secureFoundation: { passed: 0, total: 0 },
    zeroTrust: { passed: 0, total: 0 },
    remoteWork: { passed: 0, total: 0 },
    protectAdmin: { passed: 0, total: 0 },
    emergingThreats: { passed: 0, total: 0 },
    aiAgents: { passed: 0, total: 0 },
  } satisfies Record<BaselineCategory, { passed: number; total: number }>;

  for (const result of checks) {
    counts[result.status]++;
    for (const category of result.check.categories) {
      categoryCounts[category].total++;
      if (result.status === 'pass') categoryCounts[category].passed++;
    }
  }

  return { checks, counts, categoryCounts };
}
