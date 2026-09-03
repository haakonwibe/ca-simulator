// data/templatePolicies.ts — Microsoft CA template policy definitions.
//
// Full policy bodies for the templates behind the baseline checks, used by
// "Fix in sandbox" to create draft policies. Authored against the Microsoft
// Learn template pages (linked from data/baselineChecks.ts). Names carry a
// [Draft] prefix for instant recognizability and collision avoidance.
//
// Deliberate simplifications:
// - No break-glass exclusions (tenant-specific) — the export checklist
//   reminds the admin to add them before deploying.
// - Sign-in-frequency session controls on the risk templates are omitted;
//   they aren't needed to satisfy the corresponding baseline checks.
//
// Self-test invariant (enforced by tests): every template, drafted into an
// empty tenant, satisfies its own baseline check. Factory templates are
// resolved with a fixture context first.

import type { ConditionalAccessPolicy, PolicyConditions } from '@/engine/models/Policy';
import type { UserContext } from '@/engine/models/SimulationContext';
import { AZURE_MANAGEMENT_APP_ID, REMOTE_HELP_APP_ID } from '@/data/baselineChecks';

/** The 14 admin roleTemplateIds Microsoft's admin-scoped templates target. */
export const TEMPLATE_ADMIN_ROLE_IDS: readonly string[] = [
  '62e90394-69f5-4237-9190-012177145e10', // Global Administrator
  '194ae4cb-b126-40b2-bd5b-6091b380977d', // Security Administrator
  'f28a1f50-f6e7-4571-818b-6a12f2af6b6c', // SharePoint Administrator
  '29232cdf-9323-42fd-ade2-1d097af3e4de', // Exchange Administrator
  'b1be1c3e-b65d-4f19-8427-f6fa0d97feb9', // Conditional Access Administrator
  '729827e3-9c14-49f7-bb1b-9608f156bbb8', // Helpdesk Administrator
  'b0f54661-2d74-4c50-afa3-1ec803f12efe', // Billing Administrator
  'fe930be7-5e62-47db-91af-98c3a49a38b1', // User Administrator
  'c4e39bd9-1100-46d3-8c65-fb160da0071f', // Authentication Administrator
  '9b895d92-2cd3-44c7-9d02-a6ac2d5ea5c3', // Application Administrator
  '158c047a-c907-4556-b7ef-446551a6b5f7', // Cloud Application Administrator
  '966707d0-3269-4727-9be2-8c3a10f19b9d', // Password Administrator
  '7be44c8a-adaf-4e2a-84d6-ab2649e08a13', // Privileged Authentication Administrator
  'e8611ab8-c189-46e8-94e1-60213ab1f814', // Privileged Role Administrator
];

const AUTH_STRENGTH_MFA = '00000000-0000-0000-0000-000000000002';
const AUTH_STRENGTH_PHISHING_RESISTANT = '00000000-0000-0000-0000-000000000004';

const ALL_GUEST_TYPES =
  'b2bCollaborationGuest,b2bCollaborationMember,b2bDirectConnectUser,internalGuest,serviceProvider,otherExternalUser';

function conditions(overrides?: Partial<PolicyConditions>): PolicyConditions {
  return {
    users: {
      includeUsers: ['All'],
      excludeUsers: [],
      includeGroups: [],
      excludeGroups: [],
      includeRoles: [],
      excludeRoles: [],
    },
    applications: {
      includeApplications: ['All'],
      excludeApplications: [],
    },
    clientAppTypes: [],
    signInRiskLevels: [],
    userRiskLevels: [],
    ...overrides,
  };
}

function adminUsers(): PolicyConditions['users'] {
  return {
    includeUsers: [],
    excludeUsers: [],
    includeGroups: [],
    excludeGroups: [],
    includeRoles: [...TEMPLATE_ADMIN_ROLE_IDS],
    excludeRoles: [],
  };
}

export type TemplateBody = Omit<ConditionalAccessPolicy, 'id' | 'state'>;

/** What a template factory may need from the caller. */
export interface TemplateContext {
  /** The account mapped as Remote Help Operator, when one is. */
  operator?: UserContext;
}

/**
 * A static body, or a factory for templates that cannot be static — the
 * operator template scopes itself to the mapped account because the tool
 * cannot know the operators group. A factory returns null when its context is
 * missing.
 */
export type TemplateEntry = TemplateBody | ((ctx: TemplateContext) => TemplateBody | null);

/**
 * Template policy bodies keyed by baseline check id. `id` and `state` are
 * assigned at draft-creation time by the store. Resolve through
 * `resolveTemplate`, never `.get()` — some entries are factories.
 */
export const TEMPLATE_POLICIES: ReadonlyMap<string, TemplateEntry> = new Map<string, TemplateEntry>([
  ['require-mfa-admins', {
    displayName: '[Draft] Require multifactor authentication for admins',
    conditions: conditions({ users: adminUsers() }),
    grantControls: { operator: 'OR', builtInControls: ['mfa'] },
    sessionControls: null,
  }],
  ['secure-security-info-registration', {
    displayName: '[Draft] Securing security info registration',
    conditions: conditions({
      users: {
        includeUsers: ['All'],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [],
        excludeGuestsOrExternalUsers: { guestOrExternalUserTypes: ALL_GUEST_TYPES },
      },
      applications: {
        includeApplications: [],
        excludeApplications: [],
        includeUserActions: ['urn:user:registersecurityinfo'], // Graph's canonical short form
      },
      locations: { includeLocations: ['All'], excludeLocations: ['AllTrusted'] },
    }),
    grantControls: { operator: 'OR', builtInControls: ['mfa'] },
    sessionControls: null,
  }],
  ['block-legacy-auth', {
    displayName: '[Draft] Block legacy authentication',
    conditions: conditions({ clientAppTypes: ['exchangeActiveSync', 'other'] }),
    grantControls: { operator: 'OR', builtInControls: ['block'] },
    sessionControls: null,
  }],
  ['require-mfa-admin-portals', {
    displayName: '[Draft] Require MFA for admins accessing Microsoft admin portals',
    conditions: conditions({
      users: adminUsers(),
      applications: { includeApplications: ['MicrosoftAdminPortals'], excludeApplications: [] },
    }),
    grantControls: { operator: 'OR', builtInControls: ['mfa'] },
    sessionControls: null,
  }],
  ['require-mfa-all-users', {
    displayName: '[Draft] Require multifactor authentication for all users',
    conditions: conditions(),
    grantControls: {
      operator: 'OR',
      builtInControls: [],
      authenticationStrength: { id: AUTH_STRENGTH_MFA, displayName: 'Multifactor authentication' },
    },
    sessionControls: null,
  }],
  ['require-mfa-azure-mgmt', {
    displayName: '[Draft] Require multifactor authentication for Azure management',
    conditions: conditions({
      applications: { includeApplications: [AZURE_MANAGEMENT_APP_ID], excludeApplications: [] },
    }),
    grantControls: { operator: 'OR', builtInControls: ['mfa'] },
    sessionControls: null,
  }],
  ['require-mfa-remote-help', {
    displayName: '[Draft] Require multifactor authentication for Remote Help',
    conditions: conditions({
      applications: { includeApplications: [REMOTE_HELP_APP_ID], excludeApplications: [] },
    }),
    grantControls: { operator: 'OR', builtInControls: ['mfa'] },
    sessionControls: null,
  }],
  ['compliant-hybrid-or-mfa-all-users', {
    displayName: '[Draft] Require compliant or hybrid joined device or MFA for all users',
    conditions: conditions(),
    grantControls: { operator: 'OR', builtInControls: ['mfa', 'compliantDevice', 'domainJoinedDevice'] },
    sessionControls: null,
  }],
  ['require-compliant-device', {
    displayName: '[Draft] Require compliant device',
    conditions: conditions(),
    grantControls: { operator: 'OR', builtInControls: ['compliantDevice', 'domainJoinedDevice'] },
    sessionControls: null,
  }],
  ['require-mfa-guests', {
    displayName: '[Draft] Require multifactor authentication for guest access',
    conditions: conditions({
      users: {
        includeUsers: ['None'],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [],
        includeGuestsOrExternalUsers: { guestOrExternalUserTypes: ALL_GUEST_TYPES },
      },
    }),
    grantControls: { operator: 'OR', builtInControls: ['mfa'] },
    sessionControls: null,
  }],
  ['require-mfa-risky-signins', {
    displayName: '[Draft] Require multifactor authentication for risky sign-ins',
    conditions: conditions({ signInRiskLevels: ['medium', 'high'] }),
    grantControls: { operator: 'OR', builtInControls: ['mfa'] },
    sessionControls: null,
  }],
  ['require-password-change-high-risk-users', {
    displayName: '[Draft] Require password change for high-risk users',
    conditions: conditions({ userRiskLevels: ['high'] }),
    grantControls: { operator: 'AND', builtInControls: ['mfa', 'passwordChange'] },
    sessionControls: null,
  }],
  ['compliant-or-hybrid-admins', {
    displayName: '[Draft] Require compliant or hybrid joined device for administrators',
    conditions: conditions({ users: adminUsers() }),
    grantControls: { operator: 'OR', builtInControls: ['compliantDevice', 'domainJoinedDevice'] },
    sessionControls: null,
  }],
  ['block-unknown-platforms', {
    displayName: '[Draft] Block access for unknown or unsupported device platform',
    conditions: conditions({
      platforms: {
        includePlatforms: ['all'],
        excludePlatforms: ['android', 'iOS', 'windows', 'macOS', 'linux'],
      },
    }),
    grantControls: { operator: 'OR', builtInControls: ['block'] },
    sessionControls: null,
  }],
  ['no-persistent-browser', {
    displayName: '[Draft] No persistent browser session',
    conditions: conditions(),
    grantControls: null,
    sessionControls: { persistentBrowser: { isEnabled: true, mode: 'never' } },
  }],
  ['approved-apps-or-app-protection', {
    displayName: '[Draft] Require approved client apps or app protection policies',
    conditions: conditions({
      platforms: { includePlatforms: ['android', 'iOS'] },
    }),
    grantControls: { operator: 'OR', builtInControls: ['approvedApplication', 'compliantApplication'] },
    sessionControls: null,
  }],
  ['app-enforced-restrictions', {
    displayName: '[Draft] Use application enforced restrictions for unmanaged devices',
    conditions: conditions({
      applications: { includeApplications: ['Office365'], excludeApplications: [] },
      clientAppTypes: ['browser'],
    }),
    grantControls: null,
    sessionControls: { applicationEnforcedRestrictions: { isEnabled: true } },
  }],
  ['phishing-resistant-mfa-admins', {
    displayName: '[Draft] Require phishing-resistant multifactor authentication for administrators',
    conditions: conditions({ users: adminUsers() }),
    grantControls: {
      operator: 'OR',
      builtInControls: [],
      authenticationStrength: { id: AUTH_STRENGTH_PHISHING_RESISTANT, displayName: 'Phishing-resistant MFA' },
    },
    sessionControls: null,
  }],
  ['block-insider-risk', {
    displayName: '[Draft] Block access for users with insider risk',
    conditions: conditions({ insiderRiskLevels: ['elevated'] }),
    grantControls: { operator: 'OR', builtInControls: ['block'] },
    sessionControls: null,
  }],
  ['block-high-risk-agents', {
    displayName: '[Draft] Block high-risk agent identities',
    conditions: conditions({
      users: { includeUsers: ['None'], excludeUsers: [], includeGroups: [], excludeGroups: [], includeRoles: [], excludeRoles: [] },
      clientApplications: {
        includeServicePrincipals: [],
        excludeServicePrincipals: [],
        includeAgentIdServicePrincipals: ['All'],
      },
      agentIdRiskLevels: ['high'],
    }),
    grantControls: { operator: 'OR', builtInControls: ['block'] },
    sessionControls: null,
  }],
  ['approved-agents-only', {
    // Deny-by-default: admins add approved agents as exclusions after drafting
    displayName: '[Draft] Allow only approved agent identities',
    conditions: conditions({
      users: { includeUsers: ['None'], excludeUsers: [], includeGroups: [], excludeGroups: [], includeRoles: [], excludeRoles: [] },
      clientApplications: {
        includeServicePrincipals: [],
        excludeServicePrincipals: [],
        includeAgentIdServicePrincipals: ['All'],
        excludeAgentIdServicePrincipals: [],
      },
    }),
    grantControls: { operator: 'OR', builtInControls: ['block'] },
    sessionControls: null,
  }],
  ['block-risky-agent-users', {
    displayName: "[Draft] Block risky agents' user accounts",
    conditions: conditions({
      users: { includeUsers: ['AllAgentIdUsers'], excludeUsers: [], includeGroups: [], excludeGroups: [], includeRoles: [], excludeRoles: [] },
      agentIdRiskLevels: ['medium', 'high'],
    }),
    grantControls: { operator: 'OR', builtInControls: ['block'] },
    sessionControls: null,
  }],
  ['require-device-trust-phishing-resistant-remote-help-operators', (ctx: TemplateContext): TemplateBody | null => {
    // Scoped to the mapped operator account, not a group: the tool cannot know
    // the operators group, and an All-users body would be the sharer lockout the
    // deploy guidance exists to avoid. One named account standing in for the
    // group is exactly how the check itself works; the export note says to swap
    // the account for the group before deploying.
    if (!ctx.operator) return null;
    return {
      displayName: '[Draft] Require compliant device and phishing-resistant MFA for Remote Help operators',
      conditions: conditions({
        users: {
          includeUsers: [ctx.operator.id],
          excludeUsers: [],
          includeGroups: [],
          excludeGroups: [],
          includeRoles: [],
          excludeRoles: [],
        },
        applications: { includeApplications: [REMOTE_HELP_APP_ID], excludeApplications: [] },
      }),
      grantControls: {
        operator: 'AND',
        builtInControls: ['compliantDevice'],
        authenticationStrength: { id: AUTH_STRENGTH_PHISHING_RESISTANT, displayName: 'Phishing-resistant MFA' },
      },
      sessionControls: null,
    };
  }],
]);

/** The one lookup: a static body as-is, a factory called with the context. */
export function resolveTemplate(checkId: string, ctx: TemplateContext = {}): TemplateBody | null {
  const entry = TEMPLATE_POLICIES.get(checkId);
  if (!entry) return null;
  return typeof entry === 'function' ? entry(ctx) : entry;
}

/** Draft id for a template — stable so repeat Fix-in-sandbox reuses the draft. */
export function templateDraftId(checkId: string): string {
  return `draft-${checkId}`;
}
