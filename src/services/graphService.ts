// services/graphService.ts — Graph API fetching, GUID resolution, and normalization.
//
// This is the SINGLE place where Graph schema → Engine schema translation happens.
// The engine NEVER sees raw Graph API data — only normalized data through this module.

import type {
  ConditionalAccessPolicy,
  PolicyConditions,
  UserCondition,
  GuestOrExternalUserCondition,
  ApplicationCondition,
  PlatformCondition,
  LocationCondition,
  DeviceFilterCondition,
  ClientApplicationsCondition,
  GrantControls,
  SessionControls,
  ClientAppType,
  RiskLevel,
  BuiltInControl,
  DevicePlatform,
  PolicyState,
  AuthenticationFlowCondition,
  AuthenticationFlowTransferMethod,
  InsiderRiskLevel,
} from '../engine/models/Policy';
import { graphFetch, graphPost, fetchAllPages, GraphPermissionError } from './graphClient';
import { resolveCustomAuthStrengthTier, AUTH_STRENGTH_HIERARCHY } from '../engine/authenticationStrength';
import type { TenantApplication } from '../types/TenantApplication';
import { BUNDLE_IDS, BUNDLED_APP_IDS } from '../data/appBundles';

// ── Types ───────────────────────────────────────────────────────────

/** Raw Graph API policy — loosely typed, normalized by normalizePolicies(). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawGraphPolicy = Record<string, any>;

export interface NamedLocationInfo {
  displayName: string;
  isTrusted: boolean;
  locationType: 'ip' | 'country';
}

// ── Well-Known ID Maps ──────────────────────────────────────────────
// From docs/project-instructions.md section 2.2.
// Hardcoded to avoid unnecessary API calls.

const WELL_KNOWN_APPS: Record<string, string> = {
  'All': 'All Cloud Apps',
  'None': 'None',
  'Office365': 'Office 365',
  'MicrosoftAdminPortals': 'Microsoft Admin Portals',
  'AllAgentIdResources': 'All Agent Resources',
  '00000002-0000-0ff1-ce00-000000000000': 'Office 365 Exchange Online',
  '00000003-0000-0ff1-ce00-000000000000': 'Office 365 SharePoint Online',
  '00000003-0000-0000-c000-000000000000': 'Microsoft Graph',
  '797f4846-ba00-4fd7-ba43-dac1f8f63013': 'Azure Service Management',
};

const WELL_KNOWN_ROLES: Record<string, string> = {
  '62e90394-69f5-4237-9190-012177145e10': 'Global Administrator',
  'f28a1f50-f6e7-4571-818b-6a12f2af6b6c': 'SharePoint Administrator',
  '29232cdf-9323-42fd-ade2-1d097af3e4de': 'Exchange Administrator',
  'b1be1c3e-b65d-4f19-8427-f6fa0d97feb9': 'Conditional Access Administrator',
  '194ae4cb-b126-40b2-bd5b-6091b380977d': 'Security Administrator',
  '9b895d92-2cd3-44c7-9d02-a6ac2d5ea5c3': 'Application Administrator',
  'e8611ab8-c189-46e8-94e1-60213ab1f814': 'Privileged Role Administrator',
  'fe930be7-5e62-47db-91af-98c3a49a38b1': 'User Administrator',
  '729827e3-9c14-49f7-bb1b-9608f156bbb8': 'Helpdesk Administrator',
  '966707d0-3269-4727-9be2-8c3a10f19b9d': 'Password Administrator',
  'fdd7a751-b60b-444a-984c-02652fe8fa1c': 'Groups Administrator',
  '7be44c8a-adaf-4e2a-84d6-ab2649e08a13': 'Privileged Authentication Administrator',
  'c4e39bd9-1100-46d3-8c65-fb160da0071f': 'Authentication Administrator',
  '0526716b-113d-4c15-b2c8-68e3c22b9f80': 'Authentication Policy Administrator',
  'b0f54661-2d74-4c50-afa3-1ec803f12efe': 'Billing Administrator',
  '158c047a-c907-4556-b7ef-446551a6b5f7': 'Cloud Application Administrator',
  '5c4f9dcd-47dc-4cf7-8c9a-9e4207cbfc91': 'Cloud Device Administrator',
  '17315797-102d-40b4-93e0-432062caca18': 'Compliance Administrator',
};

// Well-known special identifiers that aren't real GUIDs
const SPECIAL_IDS = new Set([
  'All', 'None', 'GuestsOrExternalUsers',
  'Office365', 'MicrosoftAdminPortals',
  'AllTrusted',
  'AllAgentIdUsers', 'AllAgentIdResources',
]);

// ── 1. Fetch CA Policies ────────────────────────────────────────────
//
// The policy LIST uses the beta endpoint: v1.0 strips agent targeting
// entirely (includeAgentIdServicePrincipals, agentIdRiskLevels), leaving
// agent policies looking like they target nobody — verified against a live
// tenant. Beta is a superset for normal policies; unknown extras are
// dropped by normalization. On beta failure we fall back to v1.0 and flag
// agent details as unavailable rather than failing the load.

const BETA_POLICIES_URL = 'https://graph.microsoft.com/beta/identity/conditionalAccess/policies';

async function fetchPolicies(token: string): Promise<{ raw: RawGraphPolicy[]; agentDetailsUnavailable: boolean }> {
  try {
    const raw = await fetchAllPages<RawGraphPolicy>(BETA_POLICIES_URL, token);
    return { raw, agentDetailsUnavailable: false };
  } catch (error) {
    if (error instanceof GraphPermissionError) throw error; // consent problems are not endpoint problems
    const raw = await fetchAllPages<RawGraphPolicy>('/identity/conditionalAccess/policies', token);
    return { raw, agentDetailsUnavailable: true };
  }
}

// ── 2. Fetch Named Locations ────────────────────────────────────────

async function fetchNamedLocations(token: string): Promise<Map<string, NamedLocationInfo>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await fetchAllPages<Record<string, any>>('/identity/conditionalAccess/namedLocations', token);
  const map = new Map<string, NamedLocationInfo>();

  for (const loc of raw) {
    const odataType: string = loc['@odata.type'] ?? '';
    const isIp = odataType.includes('ipNamedLocation');
    map.set(loc.id, {
      displayName: loc.displayName ?? loc.id,
      isTrusted: isIp ? (loc.isTrusted ?? false) : false,
      locationType: isIp ? 'ip' : 'country',
    });
  }

  return map;
}

// ── 3. Bulk GUID Resolution ─────────────────────────────────────────

async function resolveDirectoryObjects(token: string, ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;

  // Max 1000 IDs per call
  for (let i = 0; i < ids.length; i += 1000) {
    const batch = ids.slice(i, i + 1000);
    const result = await graphPost<{ value: Array<{ id: string; displayName?: string }> }>(
      '/directoryObjects/getByIds',
      token,
      { ids: batch, types: ['user', 'group', 'directoryRole'] },
    );
    for (const obj of result.value) {
      if (obj.displayName) {
        map.set(obj.id, obj.displayName);
      }
    }
  }

  return map;
}

// ── 4. App Name Resolution ──────────────────────────────────────────

async function resolveAppNames(token: string, appIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  // Pre-populate well-known apps
  for (const [id, name] of Object.entries(WELL_KNOWN_APPS)) {
    map.set(id, name);
  }

  // Filter to only unknown app IDs that look like GUIDs
  const unknownIds = appIds.filter(id => !map.has(id) && !SPECIAL_IDS.has(id));

  // Resolve unknown app IDs via service principals, batched with an `in`
  // filter (Graph allows at most 15 values per `in` clause)
  const IN_CLAUSE_LIMIT = 15;
  for (let i = 0; i < unknownIds.length; i += IN_CLAUSE_LIMIT) {
    const chunk = unknownIds.slice(i, i + IN_CLAUSE_LIMIT);
    try {
      const idList = chunk.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
      const filter = encodeURIComponent(`appId in (${idList})`);
      const result = await graphFetch<{ value: Array<{ displayName: string; appId: string }> }>(
        `/servicePrincipals?$filter=${filter}&$select=displayName,appId`,
        token,
      );
      for (const sp of result.value) {
        // Key by the ID as referenced in the policy (defends against casing drift)
        const original = chunk.find(id => id.toLowerCase() === sp.appId.toLowerCase());
        map.set(original ?? sp.appId, sp.displayName);
      }
    } catch (error) {
      if (error instanceof GraphPermissionError) throw error;
      // If a chunk can't be resolved, leave its IDs out — the UI will show raw GUIDs
    }
  }

  return map;
}

// ── 5. Extract Referenced IDs ───────────────────────────────────────

/** Collect all GUIDs referenced across all policies for bulk resolution. */
function extractReferencedIds(rawPolicies: RawGraphPolicy[]): {
  directoryObjectIds: string[];
  appIds: string[];
  roleTemplateIds: string[];
} {
  const dirIds = new Set<string>();
  const appIds = new Set<string>();
  const roleIds = new Set<string>();

  for (const p of rawPolicies) {
    const cond = p.conditions ?? {};
    const users = cond.users ?? {};
    const apps = cond.applications ?? {};

    // User/group IDs
    for (const id of users.includeUsers ?? []) {
      if (!SPECIAL_IDS.has(id)) dirIds.add(id);
    }
    for (const id of users.excludeUsers ?? []) {
      if (!SPECIAL_IDS.has(id)) dirIds.add(id);
    }
    for (const id of users.includeGroups ?? []) dirIds.add(id);
    for (const id of users.excludeGroups ?? []) dirIds.add(id);
    // Roles are TEMPLATE IDs — getByIds can't resolve them (it looks up role
    // instance ids), so they get their own resolution via /directoryRoleTemplates
    for (const id of users.includeRoles ?? []) {
      if (!WELL_KNOWN_ROLES[id]) roleIds.add(id);
    }
    for (const id of users.excludeRoles ?? []) {
      if (!WELL_KNOWN_ROLES[id]) roleIds.add(id);
    }

    // App IDs
    for (const id of apps.includeApplications ?? []) {
      if (!SPECIAL_IDS.has(id)) appIds.add(id);
    }
    for (const id of apps.excludeApplications ?? []) {
      if (!SPECIAL_IDS.has(id)) appIds.add(id);
    }
  }

  return {
    directoryObjectIds: [...dirIds],
    appIds: [...appIds],
    roleTemplateIds: [...roleIds],
  };
}

/**
 * Resolve role template IDs (beyond WELL_KNOWN_ROLES) to display names via
 * /directoryRoleTemplates — its `id` IS the template id that CA policies store.
 */
async function resolveRoleTemplateNames(token: string, roleTemplateIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (roleTemplateIds.length === 0) return map;

  const wanted = new Set(roleTemplateIds);
  const templates = await fetchAllPages<{ id: string; displayName?: string }>('/directoryRoleTemplates', token);
  for (const template of templates) {
    if (wanted.has(template.id) && template.displayName) {
      map.set(template.id, template.displayName);
    }
  }

  return map;
}

// ── 6. Normalizer — CRITICAL ────────────────────────────────────────

function normalizeUserCondition(raw: Record<string, unknown> | undefined): UserCondition {
  if (!raw) {
    return {
      includeUsers: ['All'],
      excludeUsers: [],
      includeGroups: [],
      excludeGroups: [],
      includeRoles: [],
      excludeRoles: [],
    };
  }

  const result: UserCondition = {
    includeUsers: (raw.includeUsers as string[]) ?? [],
    excludeUsers: (raw.excludeUsers as string[]) ?? [],
    includeGroups: (raw.includeGroups as string[]) ?? [],
    excludeGroups: (raw.excludeGroups as string[]) ?? [],
    includeRoles: (raw.includeRoles as string[]) ?? [],
    excludeRoles: (raw.excludeRoles as string[]) ?? [],
  };

  if (raw.includeGuestsOrExternalUsers) {
    result.includeGuestsOrExternalUsers = normalizeGuestCondition(
      raw.includeGuestsOrExternalUsers as Record<string, unknown>,
    );
  }
  if (raw.excludeGuestsOrExternalUsers) {
    result.excludeGuestsOrExternalUsers = normalizeGuestCondition(
      raw.excludeGuestsOrExternalUsers as Record<string, unknown>,
    );
  }

  return result;
}

function normalizeGuestCondition(raw: Record<string, unknown>): GuestOrExternalUserCondition {
  const result: GuestOrExternalUserCondition = {
    guestOrExternalUserTypes: (raw.guestOrExternalUserTypes as string) ?? '',
  };

  if (raw.externalTenants) {
    const tenants = raw.externalTenants as Record<string, unknown>;
    result.externalTenants = {
      membershipKind: (tenants.membershipKind as 'all' | 'enumerated' | 'unknownFutureValue') ?? 'all',
      members: (tenants.members as string[]) ?? undefined,
    };
  }

  return result;
}

function normalizeApplicationCondition(raw: Record<string, unknown> | undefined): ApplicationCondition {
  if (!raw) {
    return {
      includeApplications: ['All'],
      excludeApplications: [],
    };
  }

  const result: ApplicationCondition = {
    includeApplications: (raw.includeApplications as string[]) ?? [],
    excludeApplications: (raw.excludeApplications as string[]) ?? [],
  };

  if (raw.includeUserActions && (raw.includeUserActions as string[]).length > 0) {
    result.includeUserActions = raw.includeUserActions as string[];
  }
  if (raw.includeAuthenticationContextClassReferences && (raw.includeAuthenticationContextClassReferences as string[]).length > 0) {
    result.includeAuthenticationContextClassReferences = raw.includeAuthenticationContextClassReferences as string[];
  }

  return result;
}

function normalizePlatformCondition(raw: Record<string, unknown> | undefined): PlatformCondition | undefined {
  if (!raw) return undefined;
  const include = raw.includePlatforms as string[] | undefined;
  if (!include || include.length === 0) return undefined;

  return {
    includePlatforms: include as DevicePlatform[],
    excludePlatforms: (raw.excludePlatforms as DevicePlatform[]) ?? undefined,
  };
}

function normalizeLocationCondition(raw: Record<string, unknown> | undefined): LocationCondition | undefined {
  if (!raw) return undefined;
  const include = raw.includeLocations as string[] | undefined;
  if (!include || include.length === 0) return undefined;

  return {
    includeLocations: include,
    excludeLocations: (raw.excludeLocations as string[]) ?? [],
  };
}

function normalizeDeviceFilter(raw: Record<string, unknown> | undefined): DeviceFilterCondition | undefined {
  if (!raw) return undefined;
  const deviceFilter = raw.deviceFilter as Record<string, unknown> | undefined;
  if (!deviceFilter) return undefined;
  if (!deviceFilter.rule) return undefined;

  return {
    mode: (deviceFilter.mode as 'include' | 'exclude') ?? 'include',
    rule: deviceFilter.rule as string,
  };
}

function normalizeAuthenticationFlows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any | undefined,
): AuthenticationFlowCondition | undefined {
  if (!raw) return undefined;

  // Graph API may return transferMethods in unexpected shapes — always coerce to string[]
  let methods: AuthenticationFlowTransferMethod[] = [];

  if (Array.isArray(raw.transferMethods)) {
    methods = raw.transferMethods.filter(
      (m: unknown): m is AuthenticationFlowTransferMethod => typeof m === 'string',
    );
  } else if (typeof raw.transferMethods === 'string') {
    // Single string instead of array
    methods = [raw.transferMethods as AuthenticationFlowTransferMethod];
  }

  if (methods.length === 0) return undefined;
  return { transferMethods: methods };
}

function normalizeGrantControls(raw: Record<string, unknown> | null | undefined): GrantControls | null {
  if (!raw) return null;
  const builtIn = (raw.builtInControls as string[]) ?? [];
  const hasTermsOfUse = ((raw.termsOfUse as string[]) ?? []).length > 0;
  const hasCustomFactors = ((raw.customAuthenticationFactors as string[]) ?? []).length > 0;
  if (builtIn.length === 0 && !raw.authenticationStrength && !hasTermsOfUse && !hasCustomFactors) return null;

  const result: GrantControls = {
    operator: ((raw.operator as string) ?? 'AND').toUpperCase() as 'AND' | 'OR',
    builtInControls: builtIn as BuiltInControl[],
  };

  if (raw.customAuthenticationFactors && (raw.customAuthenticationFactors as string[]).length > 0) {
    result.customAuthenticationFactors = raw.customAuthenticationFactors as string[];
  }
  if (raw.termsOfUse && (raw.termsOfUse as string[]).length > 0) {
    result.termsOfUse = raw.termsOfUse as string[];
  }
  if (raw.authenticationStrength) {
    const strength = raw.authenticationStrength as Record<string, unknown>;
    result.authenticationStrength = {
      id: (strength.id as string) ?? '',
      displayName: strength.displayName as string | undefined,
    };
  }

  return result;
}

function normalizeSessionControls(raw: Record<string, unknown> | null | undefined): SessionControls | null {
  if (!raw) return null;

  const result: SessionControls = {};
  let hasAny = false;

  if (raw.applicationEnforcedRestrictions) {
    const aer = raw.applicationEnforcedRestrictions as Record<string, unknown>;
    if (aer.isEnabled) {
      result.applicationEnforcedRestrictions = { isEnabled: true };
      hasAny = true;
    }
  }

  if (raw.cloudAppSecurity) {
    const cas = raw.cloudAppSecurity as Record<string, unknown>;
    if (cas.isEnabled) {
      result.cloudAppSecurity = {
        isEnabled: true,
        cloudAppSecurityType: (cas.cloudAppSecurityType as string) ?? '',
      };
      hasAny = true;
    }
  }

  if (raw.signInFrequency) {
    const sif = raw.signInFrequency as Record<string, unknown>;
    if (sif.isEnabled) {
      result.signInFrequency = {
        isEnabled: true,
        value: (sif.value as number) ?? 0,
        type: (sif.type as 'hours' | 'days') ?? 'hours',
        frequencyInterval: (sif.frequencyInterval as string) ?? 'timeBased',
      };
      hasAny = true;
    }
  }

  if (raw.persistentBrowser) {
    const pb = raw.persistentBrowser as Record<string, unknown>;
    if (pb.isEnabled) {
      result.persistentBrowser = {
        isEnabled: true,
        mode: (pb.mode as 'always' | 'never') ?? 'never',
      };
      hasAny = true;
    }
  }

  if (raw.continuousAccessEvaluation) {
    const cae = raw.continuousAccessEvaluation as Record<string, unknown>;
    if (cae.mode) {
      result.continuousAccessEvaluation = { mode: cae.mode as string };
      hasAny = true;
    }
  }

  if (raw.disableResilienceDefaults === true) {
    result.disableResilienceDefaults = true;
    hasAny = true;
  }

  if (raw.secureSignInSession) {
    const sss = raw.secureSignInSession as Record<string, unknown>;
    if (sss.isEnabled) {
      result.secureSignInSession = { isEnabled: true };
      hasAny = true;
    }
  }

  return hasAny ? result : null;
}

/**
 * Graph models some risk conditions as comma-flagged strings (insiderRiskLevels,
 * agentIdRiskLevels) rather than collections. Accepts string, array, or null
 * and always produces a clean array (or undefined when unset).
 */
function normalizeFlaggedLevels<T extends string>(raw: unknown): T[] | undefined {
  if (raw == null) return undefined;
  const values = Array.isArray(raw)
    ? raw.map(String)
    : String(raw).split(',').map((v) => v.trim());
  const filtered = values.filter((v) => v.length > 0);
  return filtered.length > 0 ? (filtered as T[]) : undefined;
}

function normalizeFilterRule(raw: unknown): DeviceFilterCondition | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const filter = raw as Record<string, unknown>;
  if (!filter.rule) return undefined;
  return {
    mode: (filter.mode as 'include' | 'exclude') ?? 'include',
    rule: filter.rule as string,
  };
}

function normalizeClientApplications(raw: Record<string, unknown> | null | undefined): ClientApplicationsCondition | undefined {
  if (!raw) return undefined;

  const result: ClientApplicationsCondition = {
    includeServicePrincipals: (raw.includeServicePrincipals as string[]) ?? [],
    excludeServicePrincipals: (raw.excludeServicePrincipals as string[]) ?? [],
  };
  const includeAgents = raw.includeAgentIdServicePrincipals as string[] | undefined;
  const excludeAgents = raw.excludeAgentIdServicePrincipals as string[] | undefined;
  if (includeAgents?.length) result.includeAgentIdServicePrincipals = includeAgents;
  if (excludeAgents?.length) result.excludeAgentIdServicePrincipals = excludeAgents;
  const spFilter = normalizeFilterRule(raw.servicePrincipalFilter);
  if (spFilter) result.servicePrincipalFilter = spFilter;
  const agentFilter = normalizeFilterRule(raw.agentIdServicePrincipalFilter);
  if (agentFilter) result.agentIdServicePrincipalFilter = agentFilter;

  // Drop the condition entirely when it carries no targeting (the common
  // case: Graph returns an empty clientApplications block on every policy)
  const hasContent =
    result.includeServicePrincipals.length > 0 ||
    result.excludeServicePrincipals.length > 0 ||
    result.includeAgentIdServicePrincipals !== undefined ||
    result.excludeAgentIdServicePrincipals !== undefined ||
    result.servicePrincipalFilter !== undefined ||
    result.agentIdServicePrincipalFilter !== undefined;
  return hasContent ? result : undefined;
}

function normalizePolicies(
  rawPolicies: RawGraphPolicy[],
  _directoryObjectNames: Map<string, string>,
  _appNames: Map<string, string>,
  _namedLocations: Map<string, NamedLocationInfo>,
): ConditionalAccessPolicy[] {
  return rawPolicies.map((raw) => {
    const cond = raw.conditions ?? {};

    const conditions: PolicyConditions = {
      users: normalizeUserCondition(cond.users),
      applications: normalizeApplicationCondition(cond.applications),
      platforms: normalizePlatformCondition(cond.platforms),
      locations: normalizeLocationCondition(cond.locations),
      clientAppTypes: (cond.clientAppTypes as ClientAppType[]) ?? [],
      signInRiskLevels: (cond.signInRiskLevels as RiskLevel[]) ?? [],
      userRiskLevels: (cond.userRiskLevels as RiskLevel[]) ?? [],
      devices: normalizeDeviceFilter(cond.devices),
      authenticationFlows: normalizeAuthenticationFlows(cond.authenticationFlows),
      servicePrincipalRiskLevels: (cond.servicePrincipalRiskLevels as RiskLevel[]) ?? undefined,
      // Graph wire format is a comma-flagged string, not a collection
      insiderRiskLevels: normalizeFlaggedLevels<InsiderRiskLevel>(cond.insiderRiskLevels),
      clientApplications: normalizeClientApplications(cond.clientApplications),
      agentIdRiskLevels: normalizeFlaggedLevels<RiskLevel>(cond.agentIdRiskLevels),
    };

    return {
      id: raw.id,
      displayName: raw.displayName ?? 'Unnamed Policy',
      state: (raw.state as PolicyState) ?? 'disabled',
      conditions,
      grantControls: normalizeGrantControls(raw.grantControls),
      sessionControls: normalizeSessionControls(raw.sessionControls),
      createdDateTime: raw.createdDateTime,
      modifiedDateTime: raw.modifiedDateTime,
    };
  });
}

// ── 7. Tenant Name Resolution ─────────────────────────────────────

export async function fetchTenantName(token: string): Promise<string | null> {
  try {
    const result = await graphFetch<{ value: Array<{ displayName: string }> }>(
      '/organization?$select=displayName',
      token,
    );
    return result.value?.[0]?.displayName ?? null;
  } catch {
    return null;
  }
}

// ── 8. Authentication Strength Policies ─────────────────────────────

async function fetchAuthStrengthPolicies(token: string): Promise<Map<string, number>> {
  const raw = await fetchAllPages<{ id: string; allowedCombinations: string[] }>(
    '/identity/conditionalAccess/authenticationStrength/policies',
    token,
  );
  const map = new Map<string, number>();
  for (const policy of raw) {
    if (AUTH_STRENGTH_HIERARCHY.has(policy.id)) continue; // Skip built-ins
    map.set(policy.id, resolveCustomAuthStrengthTier(policy.allowedCombinations));
  }
  return map;
}

// ── 9. Tenant Application Discovery ─────────────────────────────────

/** Exported for testing — merges and deduplicates app lists. */
export function mergeApplicationSources(
  enterpriseApps: Array<{ appId: string; displayName: string }>,
  appRegistrations: Array<{ appId: string; displayName: string }>,
  policyApps: Map<string, string>,
): TenantApplication[] {
  const excluded = new Set([...BUNDLE_IDS, ...BUNDLED_APP_IDS, 'None']);
  const seen = new Map<string, TenantApplication>();

  // 1. Enterprise apps — highest priority
  for (const app of enterpriseApps) {
    if (excluded.has(app.appId)) continue;
    seen.set(app.appId, {
      appId: app.appId,
      displayName: app.displayName || app.appId,
      source: 'enterprise',
    });
  }

  // 2. App registrations — fill gaps
  for (const app of appRegistrations) {
    if (excluded.has(app.appId) || seen.has(app.appId)) continue;
    seen.set(app.appId, {
      appId: app.appId,
      displayName: app.displayName || app.appId,
      source: 'registration',
    });
  }

  // 3. Policy-referenced apps — fallback
  for (const [appId, displayName] of policyApps) {
    if (excluded.has(appId) || seen.has(appId)) continue;
    seen.set(appId, {
      appId,
      displayName: displayName || appId,
      source: 'policy',
    });
  }

  // Sort alphabetically by displayName (case-insensitive)
  return [...seen.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }),
  );
}

/**
 * Fetch tenant applications from two Graph API sources and merge with
 * policy-referenced apps into a single deduplicated list.
 *
 * @param token - Bearer token with Directory.Read.All scope
 * @param policyAppIds - Map of appId → displayName from policy extraction + resolution
 * @returns Sorted, deduplicated array of tenant applications (excludes bundle members)
 */
export async function fetchTenantApplications(
  token: string,
  policyAppIds: Map<string, string>,
): Promise<TenantApplication[]> {
  let enterpriseApps: Array<{ appId: string; displayName: string }> = [];
  let appRegistrations: Array<{ appId: string; displayName: string }> = [];

  // Fetch both sources in parallel, following pagination — resilient to partial failure
  const [enterpriseResult, registrationResult] = await Promise.allSettled([
    fetchAllPages<{ appId: string; displayName: string }>(
      `/servicePrincipals?$filter=${encodeURIComponent("servicePrincipalType eq 'Application' and not(appOwnerOrganizationId eq f8cdef31-a31e-4b4a-93e4-5f571e91255a)")}&$select=appId,displayName&$top=999&$count=true`,
      token,
      { 'ConsistencyLevel': 'eventual' },
    ),
    fetchAllPages<{ appId: string; displayName: string }>(
      '/applications?$select=appId,displayName&$top=999',
      token,
    ),
  ]);

  // Re-throw 403 from either source
  if (enterpriseResult.status === 'rejected') {
    if (enterpriseResult.reason instanceof GraphPermissionError) throw enterpriseResult.reason;
  } else {
    enterpriseApps = enterpriseResult.value;
  }

  if (registrationResult.status === 'rejected') {
    if (registrationResult.reason instanceof GraphPermissionError) throw registrationResult.reason;
  } else {
    appRegistrations = registrationResult.value;
  }

  return mergeApplicationSources(enterpriseApps, appRegistrations, policyAppIds);
}

// ── 10. Top-Level Orchestrator ──────────────────────────────────────

export async function loadPoliciesFromGraph(token: string): Promise<{
  policies: ConditionalAccessPolicy[];
  namedLocations: Map<string, NamedLocationInfo>;
  displayNames: Map<string, string>;
  authStrengthMap: Map<string, number>;
  tenantApplications: TenantApplication[];
  /** True when the beta policy endpoint failed and v1.0 fallback was used — agent targeting is invisible */
  agentDetailsUnavailable: boolean;
}> {
  // Fetch policies, named locations, and auth strength policies in parallel
  const [{ raw: rawPolicies, agentDetailsUnavailable }, namedLocations, authStrengthMap] = await Promise.all([
    fetchPolicies(token),
    fetchNamedLocations(token),
    // Re-throw 403 (ConsentBanner); other failures degrade to an empty map,
    // which makes custom auth strengths unsatisfiable in simulations
    fetchAuthStrengthPolicies(token).catch((error) => {
      if (error instanceof GraphPermissionError) throw error;
      return new Map<string, number>();
    }),
  ]);

  // Extract all referenced GUIDs
  const { directoryObjectIds, appIds, roleTemplateIds } = extractReferencedIds(rawPolicies);

  // Resolve GUIDs in parallel — re-throw 403 so the store can show ConsentBanner
  let directoryObjectNames = new Map<string, string>();
  let appNames = new Map<string, string>();
  let roleTemplateNames = new Map<string, string>();
  try {
    [directoryObjectNames, appNames, roleTemplateNames] = await Promise.all([
      resolveDirectoryObjects(token, directoryObjectIds),
      resolveAppNames(token, appIds),
      resolveRoleTemplateNames(token, roleTemplateIds),
    ]);
  } catch (error) {
    if (error instanceof GraphPermissionError) throw error;
    // Non-permission errors: proceed with empty display names
  }

  // Fetch tenant applications (needs resolved appNames as input)
  const tenantApplications = await fetchTenantApplications(token, appNames)
    .catch((error) => {
      if (error instanceof GraphPermissionError) throw error;
      return [] as TenantApplication[];
    });

  // Merge all display names into one map for the UI
  const displayNames = new Map<string, string>();
  for (const [id, name] of directoryObjectNames) displayNames.set(id, name);
  for (const [id, name] of appNames) displayNames.set(id, name);
  for (const [id, name] of Object.entries(WELL_KNOWN_ROLES)) displayNames.set(id, name);
  for (const [id, name] of roleTemplateNames) displayNames.set(id, name);
  for (const [id, info] of namedLocations) displayNames.set(id, info.displayName);

  // Normalize raw Graph data into engine-ready policies
  const policies = normalizePolicies(rawPolicies, directoryObjectNames, appNames, namedLocations);

  return { policies, namedLocations, displayNames, authStrengthMap, tenantApplications, agentDetailsUnavailable };
}

// Exported for testing (fixture-based normalization tests)
export { normalizePolicies };
