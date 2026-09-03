// data/microsoftServices.ts — First-party Microsoft resources a sign-in can target.
//
// Tenant app discovery deliberately filters out Microsoft-owned service
// principals (`appOwnerOrganizationId eq f8cdef31-…` in graphService), so these
// never appear in the Tenant Apps list — yet they are exactly the resources
// that surface in sign-in logs when a "block everything except…" allowlist
// misfires. This is the curated list, and the single source of truth for their
// display names.
//
// ONLY Microsoft-documented app IDs belong here. Community-sourced IDs (e.g.
// "Microsoft Account Controls V2") stay out — the custom app ID entry in the
// Simulation Context covers anything not listed.

import { REMOTE_HELP_APP_ID, AZURE_MANAGEMENT_APP_ID } from '@/data/baselineChecks';

/** The umbrella resource no policy can name. */
export const MICROSOFT_GRAPH_APP_ID = '00000003-0000-0000-c000-000000000000';

/** Azure AD Graph — the audience baseline-scope sign-ins land on since June 2026. */
export const AZURE_AD_GRAPH_APP_ID = '00000002-0000-0000-c000-000000000000';

/**
 * Whether a Conditional Access policy can name this resource in its include or
 * exclude list. Not a property of the simulator — a property of Entra.
 */
export type CaTargetability =
  /** Appears in the portal's resource picker; can be included or excluded. */
  | 'selectable'
  /** Reachable only via All resources or an application filter — never named directly. */
  | 'filter-only'
  /** Cannot be named at all; the portal answers "Resource unsupported in Conditional Access". */
  | 'unsupported';

export interface MicrosoftService {
  appId: string;
  displayName: string;
  /** One scannable line for the picker row. The full story goes on the verdict. */
  summary: string;
  /** The full explanation, shown on the verdict when the resource is not selectable. */
  description: string;
  caTarget: CaTargetability;
  docsUrl: string;
}

const CA_APPS_DOC =
  'https://learn.microsoft.com/entra/identity/conditional-access/concept-conditional-access-cloud-apps';
const CROSS_TENANT_DOC =
  'https://learn.microsoft.com/entra/external-id/cross-tenant-access-settings-b2b-collaboration#considerations-for-allowing-microsoft-applications';

export const MICROSOFT_SERVICES: readonly MicrosoftService[] = [
  // Picker order is array order: the resources people reach for first, then
  // the two that no policy can name. Every 'selectable' entry stays ahead of
  // the rest — a test enforces it.
  {
    appId: REMOTE_HELP_APP_ID,
    displayName: 'Remote Assistance Service',
    summary: 'Intune Remote Help',
    description:
      "Intune Remote Help. Its service principal must be created by hand before CA can target it, and Microsoft's deploy guidance is to exclude it — sound for device requirements, not for MFA.",
    caTarget: 'selectable',
    docsUrl: 'https://learn.microsoft.com/intune/remote-help/plan#planning-considerations',
  },
  {
    appId: '19db86c3-b2b9-44cc-b339-36da233a3be2',
    displayName: 'My Sign-ins',
    summary: 'mysignins.microsoft.com, including Security Info',
    description:
      'mysignins.microsoft.com, including the Security Info page where users register MFA methods.',
    caTarget: 'selectable',
    docsUrl: CROSS_TENANT_DOC,
  },
  {
    appId: '8c59ead7-d703-4a27-9e55-c96a0054c8d2',
    displayName: 'My Profile',
    summary: 'myaccount.microsoft.com, My Groups and My Access',
    description:
      'myaccount.microsoft.com, including My Groups and My Access. Several of its tabs call the other portals listed here.',
    caTarget: 'selectable',
    docsUrl: CROSS_TENANT_DOC,
  },
  {
    appId: '2793995e-0a7d-40d7-bd35-6968ba142197',
    displayName: 'My Apps',
    summary: 'myapplications.microsoft.com — the app launcher',
    description: 'myapplications.microsoft.com — the app launcher portal.',
    caTarget: 'selectable',
    docsUrl: CROSS_TENANT_DOC,
  },
  {
    appId: '0000000c-0000-0000-c000-000000000000',
    displayName: 'Microsoft App Access Panel',
    summary: 'Late-bound calls from inside My Sign-ins',
    description:
      'Late-bound calls made while loading pages inside My Sign-ins, such as the Security Info blade and the organization switcher.',
    caTarget: 'selectable',
    docsUrl: CROSS_TENANT_DOC,
  },
  {
    appId: AZURE_MANAGEMENT_APP_ID,
    displayName: 'Azure Service Management',
    summary: 'Azure portal, CLI, PowerShell and the ARM APIs',
    description:
      'The Azure management plane: portal, CLI, PowerShell, and the ARM APIs behind them.',
    caTarget: 'selectable',
    docsUrl: `${CA_APPS_DOC}#other-applications`,
  },
  {
    appId: '45a330b1-b1ec-4cc1-9161-9f03992aa49f',
    displayName: 'Universal Store Service APIs and Web Application',
    summary: 'Windows Store — excluded for Subscription Activation',
    description:
      'Windows Store for Business. Microsoft documents excluding it so Windows Subscription Activation keeps working on devices that have been offline.',
    caTarget: 'selectable',
    docsUrl:
      'https://learn.microsoft.com/entra/identity/conditional-access/policy-alt-all-users-compliant-hybrid-or-mfa#subscription-activation',
  },
  {
    appId: MICROSOFT_GRAPH_APP_ID,
    displayName: 'Microsoft Graph',
    summary: 'Umbrella resource — no policy can name it',
    description:
      "Umbrella resource. A policy cannot name it in either list — the portal answers \"Resource unsupported in Conditional Access\" — so an allowlist of named apps never covers it and an All-resources exclusion cannot carve it out. Entra evaluates the underlying service the token is for; the simulator evaluates Graph itself.",
    caTarget: 'unsupported',
    docsUrl: `${CA_APPS_DOC}#microsoft-cloud-applications`,
  },
  {
    appId: AZURE_AD_GRAPH_APP_ID,
    displayName: 'Windows Azure Active Directory',
    summary: 'Azure AD Graph — reachable only via All resources or a filter',
    description:
      'Azure AD Graph — directory data. Not in the portal picker: reachable through All resources, or named only by an application filter on a custom security attribute. Since the June 2026 baseline-scopes change it is also the audience for sign-ins that request nothing beyond baseline scopes.',
    caTarget: 'filter-only',
    docsUrl: `${CA_APPS_DOC}#conditional-access-for-all-resources`,
  },
];

export const MICROSOFT_SERVICE_IDS: ReadonlySet<string> = new Set(
  MICROSOFT_SERVICES.map((s) => s.appId),
);

export function getMicrosoftService(appId: string): MicrosoftService | undefined {
  return MICROSOFT_SERVICES.find((s) => s.appId === appId);
}

/**
 * Can a policy list this resource? The sandbox only ever offers these — drafting
 * an exclusion the portal will refuse would show a fix that cannot be deployed.
 */
export function isNameableInPolicy(service: MicrosoftService): boolean {
  return service.caTarget === 'selectable';
}

/**
 * Short tag for resources that behave unlike an ordinary app. It says how the
 * resource IS reached, which is more use than saying what you cannot do with
 * it. A selectable resource gets no tag — it behaves as expected.
 */
export const CA_TARGET_BADGE: Record<CaTargetability, string | null> = {
  selectable: null,
  'filter-only': 'Filter only',
  unsupported: 'All resources only',
};
