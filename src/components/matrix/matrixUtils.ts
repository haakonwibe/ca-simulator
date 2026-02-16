// components/matrix/matrixUtils.ts — Column definitions, cell summaries, sorting, and
// conditionResult-to-column mapping for the Evaluation Matrix.

import type {
  ConditionalAccessPolicy,
  PolicyConditions,
  AuthenticationFlowCondition,
  RiskLevel,
} from '@/engine/models/Policy';
import type {
  CAEngineResult,
  ConditionMatchResult,
  PolicyEvaluationResult,
} from '@/engine/models/EvaluationResult';

// ── Column definitions ──────────────────────────────────────────────

export interface MatrixColumn {
  key: string;
  header: string;
  /** Engine conditionType values that map to this column */
  conditionTypes: string[];
}

export const MATRIX_COLUMNS: MatrixColumn[] = [
  { key: 'users', header: 'Users', conditionTypes: ['users'] },
  { key: 'apps', header: 'Apps', conditionTypes: ['applications'] },
  { key: 'platform', header: 'Platform', conditionTypes: ['platforms'] },
  { key: 'clientApp', header: 'Client App', conditionTypes: ['clientAppTypes'] },
  { key: 'location', header: 'Location', conditionTypes: ['locations'] },
  { key: 'signInRisk', header: 'Sign-in Risk', conditionTypes: ['signInRisk', 'risk'] },
  { key: 'userRisk', header: 'User Risk', conditionTypes: ['userRisk', 'risk'] },
  { key: 'authFlows', header: 'Auth Flows', conditionTypes: ['authenticationFlows'] },
];

// ── Pre-evaluation cell summaries ───────────────────────────────────

export function getCellSummary(
  policy: ConditionalAccessPolicy,
  columnKey: string,
  displayNames: Map<string, string>,
): string {
  const c = policy.conditions;
  switch (columnKey) {
    case 'users':
      return summarizeUsers(c.users, displayNames);
    case 'apps':
      return summarizeApps(c.applications, displayNames);
    case 'platform':
      return summarizePlatform(c.platforms);
    case 'clientApp':
      return summarizeClientApp(c.clientAppTypes);
    case 'location':
      return summarizeLocation(c.locations);
    case 'signInRisk':
      return summarizeRisk(c.signInRiskLevels);
    case 'userRisk':
      return summarizeRisk(c.userRiskLevels);
    case 'authFlows':
      return summarizeAuthFlows(c.authenticationFlows);
    default:
      return '\u00b7';
  }
}

function summarizeUsers(
  u: PolicyConditions['users'],
  displayNames: Map<string, string>,
): string {
  const parts: string[] = [];
  const hasAll = u.includeUsers.includes('All');
  const hasNone = u.includeUsers.includes('None');
  const hasGuests = !!u.includeGuestsOrExternalUsers;

  if (hasAll) {
    parts.push('All');
  } else if (hasNone && !u.includeGroups.length && !u.includeRoles.length && hasGuests) {
    parts.push('Guests');
  } else if (hasNone && !u.includeGroups.length && !u.includeRoles.length) {
    parts.push('None');
  } else {
    if (u.includeRoles.length > 0) {
      if (u.includeRoles.length === 1) {
        const name = displayNames.get(u.includeRoles[0]);
        parts.push(name ? truncate(name, 12) : 'Roles(1)');
      } else {
        parts.push(`Roles(${u.includeRoles.length})`);
      }
    }
    if (u.includeGroups.length > 0) {
      parts.push(`Groups(${u.includeGroups.length})`);
    }
    if (hasGuests) {
      parts.push('Guests');
    }
    const directUsers = u.includeUsers.filter(
      (id) => id !== 'All' && id !== 'None' && id !== 'GuestsOrExternalUsers',
    );
    if (directUsers.length > 0) {
      parts.push(`Users(${directUsers.length})`);
    }
  }

  const totalExclusions =
    u.excludeUsers.length + u.excludeGroups.length + u.excludeRoles.length;
  if (totalExclusions > 0) {
    return `${parts.join(', ')} \u2212${totalExclusions}`;
  }
  return parts.join(', ') || 'None';
}

function summarizeApps(
  a: PolicyConditions['applications'],
  displayNames: Map<string, string>,
): string {
  const inc = a.includeApplications;
  let base: string;

  if (a.includeUserActions?.length) {
    const action = a.includeUserActions[0];
    if (action.includes('registerSecurityInformation')) return 'Reg SecInfo';
    if (action.includes('registerDevice')) return 'Reg Device';
    return 'UserAction';
  }
  if (a.includeAuthenticationContextClassReferences?.length) {
    const refs = a.includeAuthenticationContextClassReferences;
    return refs.length === 1 ? `AuthCtx:${refs[0].toUpperCase()}` : `AuthCtx(${refs.length})`;
  }

  if (inc.includes('All')) {
    base = 'All';
  } else if (inc.includes('Office365')) {
    base = 'O365';
  } else if (inc.includes('MicrosoftAdminPortals')) {
    base = 'Admin';
  } else if (inc.length === 1) {
    const name = displayNames.get(inc[0]);
    base = name ? truncate(name, 12) : 'Apps(1)';
  } else if (inc.length > 1) {
    base = `Apps(${inc.length})`;
  } else {
    base = 'None';
  }

  if (a.excludeApplications.length > 0) {
    return `${base} \u2212${a.excludeApplications.length}`;
  }
  return base;
}

function summarizePlatform(p: PolicyConditions['platforms']): string {
  if (!p) return '\u00b7';
  if (p.includePlatforms.includes('all')) return 'All';

  const abbrev: Record<string, string> = {
    windows: 'Win',
    macOS: 'Mac',
    iOS: 'iOS',
    android: 'And',
    linux: 'Lin',
    windowsPhone: 'WPh',
  };
  const names = p.includePlatforms.map((pl) => abbrev[pl] ?? pl);
  return names.join(',');
}

function summarizeClientApp(types: PolicyConditions['clientAppTypes']): string {
  if (!types || types.length === 0) return '\u00b7';
  // All 4 types = matches all = not really configured
  if (types.length >= 4) return '\u00b7';

  const abbrev: Record<string, string> = {
    browser: 'Browser',
    mobileAppsAndDesktopClients: 'Mobile',
    exchangeActiveSync: 'EAS',
    other: 'Other',
  };
  return types.map((t) => abbrev[t] ?? t).join(',');
}

function summarizeLocation(loc: PolicyConditions['locations']): string {
  if (!loc) return '\u00b7';
  const inc = loc.includeLocations;
  const exc = loc.excludeLocations;

  if (inc.includes('All') && exc.includes('AllTrusted')) return 'Untrusted';
  if (inc.includes('AllTrusted')) return 'Trusted';
  if (inc.includes('All')) return 'All';
  if (inc.length > 0) return `Loc(${inc.length})`;
  return '\u00b7';
}

function summarizeRisk(levels: RiskLevel[]): string {
  if (!levels || levels.length === 0) return '\u00b7';

  const sorted = [...levels].filter((l) => l !== 'none');
  if (sorted.length === 0) return '\u00b7';

  const order: Record<string, number> = { low: 0, medium: 1, high: 2 };
  sorted.sort((a, b) => (order[a] ?? 0) - (order[b] ?? 0));

  if (sorted.length === 3) return 'Low+';
  if (sorted.length === 2 && sorted[0] === 'medium') return 'Med+';
  if (sorted.length === 1 && sorted[0] === 'high') return 'High';
  if (sorted.length === 1 && sorted[0] === 'medium') return 'Med';
  if (sorted.length === 1 && sorted[0] === 'low') return 'Low';

  // Fallback: join
  const abbrev: Record<string, string> = { low: 'Low', medium: 'Med', high: 'High' };
  return sorted.map((l) => abbrev[l] ?? l).join(',');
}

function summarizeAuthFlows(af: AuthenticationFlowCondition | undefined): string {
  if (!af || !af.transferMethods || af.transferMethods.length === 0) return '\u00b7';
  const abbrev: Record<string, string> = {
    deviceCodeFlow: 'DevCode',
    authenticationTransfer: 'Transfer',
    unknownFutureValue: 'Unknown',
  };
  return af.transferMethods.map((m) => abbrev[m] ?? m).join(',');
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '\u2026' : s;
}

// ── Policy name subtitle (disambiguation) ───────────────────────────

/**
 * Returns a short disambiguating subtitle for a policy row, showing the
 * policy's primary target so similarly-named policies are distinguishable.
 *
 * Priority: specific apps → specific roles → risk levels → platforms →
 * guests → unique grant control → null (no subtitle needed).
 */
export function getPolicySubtitle(
  policy: ConditionalAccessPolicy,
  displayNames: Map<string, string>,
): string | null {
  const { conditions, grantControls } = policy;

  // 0a. User actions
  if (conditions.applications.includeUserActions?.length) {
    const action = conditions.applications.includeUserActions[0];
    if (action.includes('registerSecurityInformation')) return '\u2192 Register security info';
    if (action.includes('registerDevice')) return '\u2192 Register/join devices';
    return '\u2192 User action';
  }
  // 0b. Authentication context
  if (conditions.applications.includeAuthenticationContextClassReferences?.length) {
    const refs = conditions.applications.includeAuthenticationContextClassReferences;
    return refs.length === 1 ? `\u2192 Auth Context ${refs[0].toUpperCase()}` : `\u2192 Auth Context (${refs.length})`;
  }

  // 1. Specific applications (not "All")
  const apps = conditions.applications.includeApplications;
  if (apps.length > 0 && !apps.includes('All')) {
    if (apps.includes('Office365')) return '\u2192 Office 365';
    if (apps.includes('MicrosoftAdminPortals')) return '\u2192 Admin Portals';
    if (apps.length === 1) {
      const name = displayNames.get(apps[0]);
      return name ? `\u2192 ${truncate(name, 24)}` : null;
    }
    if (apps.length > 1) return `\u2192 ${apps.length} apps`;
  }

  // 2. Specific roles
  if (conditions.users.includeRoles.length > 0) {
    if (conditions.users.includeRoles.length === 1) {
      const name = displayNames.get(conditions.users.includeRoles[0]);
      return name ? `\u2192 ${truncate(name, 24)}` : '\u2192 Admins';
    }
    return `\u2192 Roles(${conditions.users.includeRoles.length})`;
  }

  // 3. Risk levels
  const signIn = conditions.signInRiskLevels.filter((l) => l !== 'none');
  const user = conditions.userRiskLevels.filter((l) => l !== 'none');
  if (signIn.length > 0 || user.length > 0) {
    if (user.length > 0 && signIn.length === 0) {
      return `\u2192 ${formatRiskSubtitle(user)} user risk`;
    }
    if (signIn.length > 0) {
      return `\u2192 ${formatRiskSubtitle(signIn)} sign-in risk`;
    }
  }

  // 4. Specific platforms
  if (conditions.platforms && !conditions.platforms.includePlatforms.includes('all')) {
    const abbrev: Record<string, string> = {
      windows: 'Windows', macOS: 'macOS', iOS: 'iOS',
      android: 'Android', linux: 'Linux',
    };
    const names = conditions.platforms.includePlatforms.map((p) => abbrev[p] ?? p);
    return `\u2192 ${names.join(', ')}`;
  }

  // 5. Guest users
  if (conditions.users.includeGuestsOrExternalUsers) {
    return '\u2192 Guest users';
  }

  // 6. Unique grant control
  if (grantControls?.builtInControls?.includes('block')) return '\u2192 Block';
  if (grantControls?.builtInControls?.includes('passwordChange')) return '\u2192 Password change';

  return null;
}

function formatRiskSubtitle(levels: string[]): string {
  const order: Record<string, number> = { low: 0, medium: 1, high: 2 };
  const sorted = [...levels].sort((a, b) => (order[a] ?? 0) - (order[b] ?? 0));

  if (sorted.length >= 3) return 'Low+';
  if (sorted.length === 2 && sorted[0] === 'medium') return 'Med+';
  if (sorted.length === 1) {
    const labels: Record<string, string> = { high: 'High', medium: 'Med', low: 'Low' };
    return labels[sorted[0]] ?? sorted[0];
  }
  return sorted.join(',');
}

// ── Pre-evaluation verdict summary ──────────────────────────────────

export function getVerdictSummary(policy: ConditionalAccessPolicy): string {
  const gc = policy.grantControls;
  if (!gc) {
    return policy.sessionControls ? 'Session' : '\u00b7';
  }
  if (gc.builtInControls.includes('block')) return 'Block';

  const controls = gc.builtInControls.map(abbreviateControl);
  if (gc.authenticationStrength) {
    controls.push('AuthStr');
  }
  if (controls.length === 0) return '\u00b7';
  return `${gc.operator}(${controls.join(',')})`;
}

function abbreviateControl(c: string): string {
  const map: Record<string, string> = {
    mfa: 'mfa',
    compliantDevice: 'device',
    domainJoinedDevice: 'hybrid',
    approvedApplication: 'approv',
    compliantApplication: 'complApp',
    passwordChange: 'pwChg',
  };
  return map[c] ?? c;
}

// ── ConditionResult → column mapping ────────────────────────────────

/**
 * Find the ConditionMatchResult that maps to a given matrix column.
 *
 * Risk column mapping (critical):
 * - 'risk' (combined) → found by BOTH signInRisk and userRisk columns
 * - 'signInRisk' (sign-in failed) → only found by signInRisk column
 * - 'userRisk' (user risk failed) → only found by userRisk column
 */
export function findConditionResult(
  conditionResults: ConditionMatchResult[],
  column: MatrixColumn,
): ConditionMatchResult | undefined {
  for (const ct of column.conditionTypes) {
    const found = conditionResults.find((r) => r.conditionType === ct);
    if (found) return found;
  }
  return undefined;
}

/**
 * Checks if a condition is actually configured on a policy.
 * Distinguishes "not configured" (auto-matches) from "not evaluated" (short-circuit).
 */
export function isConditionConfigured(
  policy: ConditionalAccessPolicy,
  columnKey: string,
): boolean {
  switch (columnKey) {
    case 'users':
      return true; // Always present
    case 'apps':
      return true; // Always present
    case 'platform':
      return !!policy.conditions.platforms;
    case 'clientApp':
      return true; // Always present (empty = matches all)
    case 'location':
      return !!policy.conditions.locations;
    case 'signInRisk':
      return policy.conditions.signInRiskLevels.length > 0;
    case 'userRisk':
      return policy.conditions.userRiskLevels.length > 0;
    case 'authFlows':
      return !!policy.conditions.authenticationFlows &&
        policy.conditions.authenticationFlows.transferMethods.length > 0;
    default:
      return false;
  }
}

// ── Cell state determination ────────────────────────────────────────

export type CellState =
  | 'match'
  | 'fail'
  | 'excluded'
  | 'notConfigured'
  | 'notEvaluated'
  | 'disabled';

export function getCellState(
  conditionResult: ConditionMatchResult | undefined,
  policy: ConditionalAccessPolicy,
  columnKey: string,
): CellState {
  if (policy.state === 'disabled') return 'disabled';

  if (!conditionResult) {
    // No result — either not configured or short-circuited before reaching this condition
    if (isConditionConfigured(policy, columnKey)) {
      return 'notEvaluated'; // Was configured but short-circuited
    }
    return 'notConfigured';
  }

  if (conditionResult.phase === 'exclusion') return 'excluded';
  if (conditionResult.phase === 'notConfigured') {
    return 'notConfigured';
  }
  if (conditionResult.matches) return 'match';
  return 'fail';
}

// ── Row grouping and sorting ────────────────────────────────────────

export type RowGroup =
  | 'block'
  | 'controlsRequired'
  | 'satisfied'
  | 'reportOnly'
  | 'skipped'
  | 'disabled';

export function getRowGroup(
  policy: ConditionalAccessPolicy,
  evalResult: CAEngineResult | null,
): RowGroup {
  if (policy.state === 'disabled') return 'disabled';

  if (!evalResult) {
    // Pre-eval sorting: enabled → reportOnly → disabled
    if (policy.state === 'enabledForReportingButNotEnforced') return 'reportOnly';
    return 'satisfied'; // Enabled policies go to generic middle group
  }

  // Post-eval
  const applied = evalResult.appliedPolicies.find((p) => p.policyId === policy.id);
  if (applied) {
    if (applied.grantControls?.controls.includes('block')) return 'block';
    if (!applied.grantControls?.satisfied) return 'controlsRequired';
    return 'satisfied';
  }

  const reportOnly = evalResult.reportOnlyPolicies.find(
    (p) => p.policyId === policy.id,
  );
  if (reportOnly) return 'reportOnly';

  return 'skipped';
}

const GROUP_ORDER: Record<RowGroup, number> = {
  block: 0,
  controlsRequired: 1,
  satisfied: 2,
  reportOnly: 3,
  skipped: 4,
  disabled: 5,
};

export function sortPoliciesForMatrix(
  policies: ConditionalAccessPolicy[],
  evalResult: CAEngineResult | null,
): ConditionalAccessPolicy[] {
  return [...policies].sort((a, b) => {
    const ga = GROUP_ORDER[getRowGroup(a, evalResult)];
    const gb = GROUP_ORDER[getRowGroup(b, evalResult)];
    if (ga !== gb) return ga - gb;
    return a.displayName.localeCompare(b.displayName);
  });
}

// ── Eval result lookup ──────────────────────────────────────────────

export function findEvalResult(
  result: CAEngineResult,
  policyId: string | null,
): PolicyEvaluationResult | undefined {
  if (!policyId) return undefined;
  return (
    result.appliedPolicies.find((p) => p.policyId === policyId) ??
    result.reportOnlyPolicies.find((p) => p.policyId === policyId) ??
    result.skippedPolicies.find((p) => p.policyId === policyId)
  );
}

// ── Category inference (shared between PolicyGraph + PolicyDetailPanel) ──

export function inferCategory(policy: ConditionalAccessPolicy): string {
  const { conditions, grantControls } = policy;

  if (grantControls?.builtInControls?.includes('block')) return 'security';

  if (conditions.signInRiskLevels?.length > 0 || conditions.userRiskLevels?.length > 0 || conditions.insiderRiskLevels?.length)
    return 'risk';

  if (
    grantControls?.builtInControls?.some((c) =>
      ['compliantDevice', 'domainJoinedDevice'].includes(c),
    )
  )
    return 'device';
  if (conditions.devices || conditions.platforms) return 'device';

  if (
    conditions.locations &&
    ((conditions.locations.includeLocations?.length ?? 0) > 0 ||
      (conditions.locations.excludeLocations?.length ?? 0) > 0)
  )
    return 'location';

  if (
    grantControls?.builtInControls?.some((c) =>
      ['approvedApplication', 'compliantApplication'].includes(c),
    )
  )
    return 'app-protection';

  if (policy.sessionControls && !grantControls) return 'session';

  return 'identity';
}

// ── Knockout detection ──────────────────────────────────────────────

/**
 * Returns true if this column contains the first (leftmost) failing condition
 * for a skipped policy — the "knockout" reason the policy was skipped.
 */
export function isFirstFailure(
  conditionResults: ConditionMatchResult[],
  column: MatrixColumn,
): boolean {
  const firstFail = conditionResults.find((cr) => !cr.matches);
  if (!firstFail) return false;
  return column.conditionTypes.includes(firstFail.conditionType);
}
