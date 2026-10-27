// services/policyPlans.ts — Conditional Access policy plans (preview) as policies.
//
// A plan holds shared identities, resources and conditions plus one or more
// rules. At sign-in Entra combines each rule with its plan and evaluates the
// result as an independent policy, alongside every ordinary policy. Graph
// does not return rules from /policies, so graphService reads them from the
// plans endpoint and this module flattens each rule into a Graph-shaped
// policy BEFORE normalization. Name resolution, normalization and every
// analysis then treat a rule like any other policy; the engine never sees a
// plan.
//
// How a plan and a rule combine:
// - Identities and resources are unions. The portal concatenates the plan's
//   and the rule's include lists and validates the result as one policy: it
//   refuses to save shared users on a plan whose rule includes All users.
// - Other conditions take the rule's value, else the plan's; when both are
//   set, the union. A plan's clientAppTypes ['all'] is what the portal writes
//   when nothing was chosen, so it counts as not set.
// - A device filter or authentication flow set on both keeps the rule's.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawGraphObject = Record<string, any>;

export const PLAN_RULE_SEPARATOR = ' › ';

/** A plan rule's own name, without the "Plan › " prefix it carries everywhere else. */
export function planRuleName(policy: { displayName: string; plan?: { displayName: string } }): string {
  if (!policy.plan) return policy.displayName;
  const prefix = `${policy.plan.displayName}${PLAN_RULE_SEPARATOR}`;
  return policy.displayName.startsWith(prefix) ? policy.displayName.slice(prefix.length) : policy.displayName;
}

const USER_LISTS = ['includeUsers', 'excludeUsers', 'includeGroups', 'excludeGroups', 'includeRoles', 'excludeRoles'];
const APPLICATION_LISTS = [
  'includeApplications',
  'excludeApplications',
  'includeUserActions',
  'includeAuthenticationContextClassReferences',
];
const CLIENT_APPLICATION_LISTS = [
  'includeServicePrincipals',
  'excludeServicePrincipals',
  'includeAgentIdServicePrincipals',
  'excludeAgentIdServicePrincipals',
];

function unionList(...lists: unknown[]): string[] {
  const out: string[] = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const value of list) {
      if (typeof value === 'string' && !out.includes(value)) out.push(value);
    }
  }
  return out;
}

/** Comma-flagged strings (guest types, insider and agent risk) as a list. */
function flags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw !== 'string') return [];
  return raw.split(',').map((v) => v.trim()).filter((v) => v.length > 0);
}

function isSet(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value) || typeof value === 'string') return value.length > 0;
  return true;
}

/** Union the named list fields of two condition blocks; other fields come from the rule's. */
function mergeLists(plan: RawGraphObject | null | undefined, rule: RawGraphObject | null | undefined, keys: string[]) {
  if (!plan) return rule ?? null;
  if (!rule) return plan;
  const merged: RawGraphObject = { ...plan, ...rule };
  for (const key of keys) merged[key] = unionList(plan[key], rule[key]);
  return merged;
}

function mergeGuests(plan: RawGraphObject | null | undefined, rule: RawGraphObject | null | undefined) {
  if (!plan) return rule ?? null;
  if (!rule) return plan;
  const planTenants = plan.externalTenants;
  const ruleTenants = rule.externalTenants;
  let externalTenants = ruleTenants ?? planTenants ?? null;
  if (planTenants && ruleTenants) {
    externalTenants =
      planTenants.membershipKind === 'all' || ruleTenants.membershipKind === 'all'
        ? { '@odata.type': ruleTenants['@odata.type'], membershipKind: 'all' }
        : { ...ruleTenants, members: unionList(planTenants.members, ruleTenants.members) };
  }
  return {
    ...rule,
    guestOrExternalUserTypes: unionList(flags(plan.guestOrExternalUserTypes), flags(rule.guestOrExternalUserTypes)).join(','),
    externalTenants,
  };
}

function mergeUsers(plan: RawGraphObject | null | undefined, rule: RawGraphObject | null | undefined) {
  // Neither side names users (an agent-only rule): Graph's own form for
  // "no users" is ['None']. An empty block would read as unconfigured, which
  // the matcher treats as everyone.
  if (!plan && !rule) {
    return { includeUsers: ['None'], excludeUsers: [], includeGroups: [], excludeGroups: [], includeRoles: [], excludeRoles: [] };
  }
  const merged = mergeLists(plan, rule, USER_LISTS) as RawGraphObject;
  merged.includeGuestsOrExternalUsers = mergeGuests(plan?.includeGuestsOrExternalUsers, rule?.includeGuestsOrExternalUsers);
  merged.excludeGuestsOrExternalUsers = mergeGuests(plan?.excludeGuestsOrExternalUsers, rule?.excludeGuestsOrExternalUsers);
  return merged;
}

function mergeApplications(plan: RawGraphObject | null | undefined, rule: RawGraphObject | null | undefined) {
  // A rule always names its resources; if neither side does, nothing matches
  // rather than everything (an empty include list reads as unconfigured).
  if (!plan && !rule) return { includeApplications: ['None'], excludeApplications: [] };
  return mergeLists(plan, rule, APPLICATION_LISTS);
}

/** Lists where empty means "any": the rule's if set, else the plan's; both set, the union. */
function mergeLevels(plan: unknown, rule: unknown): string[] {
  return unionList(flags(plan), flags(rule));
}

function mergeClientAppTypes(plan: unknown, rule: unknown): string[] {
  const planTypes = flags(plan);
  const planIsDefault = planTypes.length === 1 && planTypes[0] === 'all';
  return unionList(planIsDefault ? [] : planTypes, flags(rule));
}

function ruleElsePlan(plan: unknown, rule: unknown): unknown {
  return isSet(rule) ? rule : isSet(plan) ? plan : null;
}

function mergeConditions(shared: RawGraphObject | null | undefined, own: RawGraphObject | null | undefined): RawGraphObject {
  const plan = shared ?? {};
  const rule = own ?? {};
  const servicePrincipalRiskLevels = mergeLevels(plan.servicePrincipalRiskLevels, rule.servicePrincipalRiskLevels);
  return {
    users: mergeUsers(plan.users, rule.users),
    applications: mergeApplications(plan.applications, rule.applications),
    clientApplications: mergeLists(plan.clientApplications, rule.clientApplications, CLIENT_APPLICATION_LISTS),
    platforms: mergeLists(plan.platforms, rule.platforms, ['includePlatforms', 'excludePlatforms']),
    locations: mergeLists(plan.locations, rule.locations, ['includeLocations', 'excludeLocations']),
    clientAppTypes: mergeClientAppTypes(plan.clientAppTypes, rule.clientAppTypes),
    signInRiskLevels: mergeLevels(plan.signInRiskLevels, rule.signInRiskLevels),
    userRiskLevels: mergeLevels(plan.userRiskLevels, rule.userRiskLevels),
    // Absent rather than empty, as on a policy that never set it
    servicePrincipalRiskLevels: servicePrincipalRiskLevels.length > 0 ? servicePrincipalRiskLevels : null,
    insiderRiskLevels: mergeLevels(plan.insiderRiskLevels, rule.insiderRiskLevels),
    agentIdRiskLevels: mergeLevels(plan.agentIdRiskLevels, rule.agentIdRiskLevels),
    devices: ruleElsePlan(plan.devices, rule.devices),
    authenticationFlows: ruleElsePlan(plan.authenticationFlows, rule.authenticationFlows),
  };
}

/** One rule combined with its plan, in the shape of a /policies item. */
export function flattenPlanRule(plan: RawGraphObject, rule: RawGraphObject): RawGraphObject {
  const planName: string = plan.displayName ?? 'Unnamed plan';
  return {
    id: rule.id,
    displayName: `${planName}${PLAN_RULE_SEPARATOR}${rule.displayName ?? 'Unnamed rule'}`,
    state: rule.state,
    conditions: mergeConditions(plan.sharedConditions, rule.conditions),
    // Rules nest their controls; policies carry them at the top level
    grantControls: rule.controls?.grantControls ?? null,
    sessionControls: rule.controls?.sessionControls ?? null,
    createdDateTime: plan.createdDateTime,
    modifiedDateTime: plan.modifiedDateTime,
    planRef: { id: plan.id, displayName: planName },
  };
}

/** Every rule of every live plan, flattened. Deleted plans are skipped. */
export function flattenPlans(plans: RawGraphObject[]): RawGraphObject[] {
  return plans
    .filter((plan) => plan.deletedDateTime == null)
    .flatMap((plan) => (Array.isArray(plan.rules) ? plan.rules : []).map((rule: RawGraphObject) => flattenPlanRule(plan, rule)));
}
