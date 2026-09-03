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
import { classifyPersona } from './gapPersonas';
import { SWEEP_APPS, SWEEP_PLATFORMS, SWEEP_CLIENT_APPS, SWEEP_USERS, APP_DISPLAY_NAMES } from './sweepDimensions';
import {
  BASELINE_CHECKS,
  type BaselineCheck,
  type BaselineExpectation,
  type BaselineCategory,
  type BaselinePersona,
} from '@/data/baselineChecks';

// ── Types ───────────────────────────────────────────────────────────

/**
 * `unmapped` is a slot-scoped check with no account mapped into its slot: never
 * run, so neither a pass nor a fail, and counted in no category.
 */
export type BaselineStatus = 'pass' | 'reportOnly' | 'partial' | 'fail' | 'unmapped';

/**
 * A real tenant account to assess alongside the synthetic personas.
 * `isException` marks break-glass / automation accounts: still evaluated, never
 * counted against a check. `slotKey` names the persona slot the account was
 * mapped into — slot-scoped checks select on it.
 */
export interface BaselinePersonaInput {
  user: UserContext;
  label: string;
  slotKey: string;
  isException: boolean;
}

/** Per-account tally, so a synthetic pass and a real failure are visible side by side. */
export interface BaselinePersonaResult {
  label: string;
  kind: 'synthetic' | 'real';
  passed: number;
  total: number;
}

export interface BaselineExceptionResult {
  label: string;
  passed: number;
  total: number;
  failingExamples: string[];
}

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
  /** Per-account breakdown of the counted scenarios (synthetic first, then real) */
  personaResults: BaselinePersonaResult[];
  /** Break-glass / service accounts — reported, excluded from the arithmetic */
  exceptionResults: BaselineExceptionResult[];
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
  personaLabel: string;
  personaKind: 'synthetic' | 'real';
  /** Excluded from the pass arithmetic; reported on its own */
  isException: boolean;
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
          personaLabel: label,
          personaKind: 'synthetic',
          isException: false,
        });
      }
    }
  }
  return scenarios;
}

interface PersonaSweepEntry {
  user: UserContext;
  label: string;
  kind: 'synthetic' | 'real';
  isException: boolean;
}

/**
 * Who stands in for a persona class. The synthetic persona always sweeps — it is
 * what answers "does a policy of this shape exist at all?" — and mapped real
 * accounts of the same class sweep alongside it. Their disagreement is the finding:
 * a synthetic pass beside a real failure means the policy exists but excludes the
 * account, which neither run alone would say.
 */
function personaSweepEntries(
  persona: BaselinePersona,
  personas?: BaselinePersonaInput[],
): PersonaSweepEntry[] {
  const synthetic = SWEEP_USERS[persona];
  const entries: PersonaSweepEntry[] = [
    { user: synthetic, label: synthetic.displayName, kind: 'synthetic', isException: false },
  ];
  for (const p of personas ?? []) {
    if (classifyPersona(p.user) === persona) {
      entries.push({ user: p.user, label: p.label, kind: 'real', isException: p.isException });
    }
  }
  return entries;
}

/**
 * Slot-scoped checks sweep only the accounts mapped into one slot, with no
 * synthetic stand-in: the slot carries a role no account property reveals, so a
 * synthetic persona would be a plain member and the check would demand the
 * control from everyone. Exception accounts never belong in a role slot, but
 * are filtered defensively.
 */
function slotSweepEntries(slot: string, personas?: BaselinePersonaInput[]): PersonaSweepEntry[] {
  return (personas ?? [])
    .filter((p) => p.slotKey === slot && !p.isException)
    .map((p) => ({ user: p.user, label: p.label, kind: 'real' as const, isException: false }));
}

function generateScenarios(
  check: BaselineCheck,
  personas?: BaselinePersonaInput[],
): BaselineScenario[] {
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

  const entries: PersonaSweepEntry[] = spec.slot
    ? slotSweepEntries(spec.slot, personas)
    : spec.personas.flatMap((persona) => personaSweepEntries(persona, personas));

  for (const entry of entries) {
    const user: UserContext = entry.user;
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
                    description: describeScenario(entry.label, target.displayName, platform, clientApp, location, signInRisk, userRisk, insiderRisk),
                    personaLabel: entry.label,
                    personaKind: entry.kind,
                    isException: entry.isException,
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
  personaLabel: string,
  targetName: string,
  platform: DevicePlatform | undefined,
  clientApp: ClientAppType,
  location: string,
  signInRisk: string,
  userRisk: string,
  insiderRisk: string,
): string {
  const parts = [
    `${personaLabel} → ${targetName}`,
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

/**
 * Composite expectations are judged per part, each part by any applied policy —
 * cross-policy AND means an All-apps compliant-device policy and a helper-scoped
 * phishing-resistant policy together guarantee both. A single grant unit can
 * never satisfy a composite, which is why it is not a case in unitMeetsExpectation.
 */
const EXPECTATION_PARTS: Partial<Record<BaselineExpectation, BaselineExpectation[]>> = {
  'device-trust-and-phishing-resistant-mfa': ['device-trust', 'phishing-resistant-mfa'],
};

/**
 * Names of the policies guaranteeing every part of the expectation, or null if
 * any part is unguaranteed. Simple expectations yield a single name.
 */
function findSatisfyingPolicies(
  result: CAEngineResult,
  expect: BaselineExpectation,
  customAuthStrengthMap?: ReadonlyMap<string, number>,
): string[] | null {
  const names: string[] = [];
  for (const part of EXPECTATION_PARTS[expect] ?? [expect]) {
    const name = findSatisfyingPolicy(result, part, customAuthStrengthMap);
    if (!name) return null;
    if (!names.includes(name)) names.push(name);
  }
  return names;
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
  personas?: BaselinePersonaInput[],
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
    const scenarios = generateScenarios(check, personas);
    const expect = check.assessment.expect;

    let passed = 0;
    let countedTotal = 0;
    const failingExamples: string[] = [];
    const failingIndices: number[] = [];
    const satisfyingPolicies: string[] = [];
    const personaTally = new Map<string, BaselinePersonaResult>();
    const exceptionTally = new Map<string, BaselineExceptionResult>();

    const withContext = (context: SimulationContext) => {
      if (customAuthStrengthMap && customAuthStrengthMap.size > 0) {
        return { ...context, customAuthStrengthMap: new Map(customAuthStrengthMap) };
      }
      return context;
    };

    scenarios.forEach((scenario, i) => {
      const result = engine.evaluate(policies, withContext(scenario.context));
      const satisfiers = findSatisfyingPolicies(result, expect, customAuthStrengthMap);

      // Break-glass and automation accounts are meant to sit outside policy.
      // Evaluate and report them, but keep them out of the arithmetic entirely —
      // otherwise every admin check parks on red for a deliberate exclusion.
      if (scenario.isException) {
        const tally = exceptionTally.get(scenario.personaLabel)
          ?? { label: scenario.personaLabel, passed: 0, total: 0, failingExamples: [] };
        tally.total++;
        if (satisfiers) tally.passed++;
        else pushCapped(tally.failingExamples, scenario.description, EXAMPLE_CAP);
        exceptionTally.set(scenario.personaLabel, tally);
        return;
      }

      const tally = personaTally.get(scenario.personaLabel)
        ?? { label: scenario.personaLabel, kind: scenario.personaKind, passed: 0, total: 0 };
      tally.total++;
      countedTotal++;

      if (satisfiers) {
        passed++;
        tally.passed++;
        for (const name of satisfiers) pushCapped(satisfyingPolicies, name, POLICY_CAP);
      } else {
        failingIndices.push(i);
        pushCapped(failingExamples, scenario.description, EXAMPLE_CAP);
      }
      personaTally.set(scenario.personaLabel, tally);
    });

    // Report-only detection: would promoting report-only policies fix it?
    let status: BaselineStatus;
    const promotablePolicies: string[] = [];

    if (check.assessment.slot && countedTotal === 0) {
      // Slot-scoped check with nothing mapped: never run, so neither pass nor
      // fail. Must precede the pass branch — 0 === 0 would read as a pass.
      status = 'unmapped';
    } else if (passed === countedTotal) {
      status = 'pass';
    } else {
      let promotedFixesAll = false;
      if (hasReportOnly) {
        promotedFixesAll = true;
        for (const i of failingIndices) {
          const promotedResult = engine.evaluate(promotedPolicies, withContext(scenarios[i].context));
          const satisfiers = findSatisfyingPolicies(promotedResult, expect, customAuthStrengthMap);
          if (!satisfiers) {
            promotedFixesAll = false;
            break;
          }
          // Credit only genuinely report-only policies as promotable
          for (const name of satisfiers) {
            const satisfierPolicy = policies.find((p) => p.displayName === name);
            if (satisfierPolicy && reportOnlyIds.has(satisfierPolicy.id)) {
              pushCapped(promotablePolicies, name, POLICY_CAP);
            }
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
      scenariosTotal: countedTotal,
      failingExamples,
      satisfyingPolicies,
      promotablePolicies,
      // Synthetic first, so a real account's disagreement reads against a baseline
      personaResults: [...personaTally.values()].sort((a, b) =>
        a.kind === b.kind ? 0 : a.kind === 'synthetic' ? -1 : 1,
      ),
      exceptionResults: [...exceptionTally.values()],
    });
  }

  // Summaries
  const counts: Record<BaselineStatus, number> = { pass: 0, reportOnly: 0, partial: 0, fail: 0, unmapped: 0 };
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
    // An unmapped check was never run — it is in the status tally but in no
    // category pair, or Remote Work would sit on amber for nothing.
    if (result.status === 'unmapped') continue;
    for (const category of result.check.categories) {
      categoryCounts[category].total++;
      if (result.status === 'pass') categoryCounts[category].passed++;
    }
  }

  return { checks, counts, categoryCounts };
}
