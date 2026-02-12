// data/appBundles.ts — Application bundle definitions for the CA simulator.
// Single source of truth for bundle membership. GUID-only lookups — no display name matching.

// ── Verified bundle membership maps ──
// Each map: appId → displayName (for reference/logging only; matching is by GUID key)

/** Office 365 bundle — 10 verified member apps */
export const OFFICE365_APP_IDS: ReadonlyMap<string, string> = new Map([
  ['00000002-0000-0ff1-ce00-000000000000', 'Exchange Online'],
  ['00000003-0000-0ff1-ce00-000000000000', 'SharePoint Online'],
  ['00000004-0000-0ff1-ce00-000000000000', 'Skype for Business Online'],
  ['00000005-0000-0ff1-ce00-000000000000', 'Viva Engage (Yammer)'],
  ['00000006-0000-0ff1-ce00-000000000000', 'Microsoft Office Portal'],
  ['00000007-0000-0ff1-ce00-000000000000', 'Exchange Online Protection'],
  ['7557eb47-c689-4224-abcf-aef9bd7573df', 'Skype for Business'],
  ['905fcf26-4eb7-48a0-9ff0-8dcc7194b5ba', 'Sway'],
  ['c9a559d2-7aab-4f13-a6ed-e7e9c52aec87', 'Microsoft Forms'],
  ['cc15fd57-2c6c-4117-a88c-83b1d56b4bbe', 'Microsoft Teams'],
]);

/** Microsoft Admin Portals bundle — verified via live CA policy sign-in logs (Feb 2026) */
export const ADMIN_PORTALS_APP_IDS: ReadonlyMap<string, string> = new Map([
  ['c44b4083-3bb0-49c1-b47d-974e53cbdf3c', 'Azure Portal'],
  ['80ccca67-54bd-44ab-8625-4b79c4dc7775', 'Microsoft 365 Security and Compliance Center'],
]);

/** Azure Virtual Desktop bundle — 3 member apps */
export const AVD_APP_IDS: ReadonlyMap<string, string> = new Map([
  ['9cdead84-a844-4324-93f2-b2e6bb768d07', 'Azure Virtual Desktop'],
  ['a4a365df-50f1-4397-bc59-1a1564b8bb9c', 'Microsoft Remote Desktop'],
  ['270efc09-cd0d-444b-a71f-39af4910ec45', 'Windows Cloud Login'],
]);

// ── Bundle registry ──

const BUNDLE_MAP: ReadonlyMap<string, ReadonlyMap<string, string>> = new Map([
  ['Office365', OFFICE365_APP_IDS],
  ['MicrosoftAdminPortals', ADMIN_PORTALS_APP_IDS],
  ['AzureVirtualDesktop', AVD_APP_IDS],
]);

export const APP_BUNDLE_NAMES = ['Office365', 'MicrosoftAdminPortals', 'AzureVirtualDesktop'] as const;

const BUNDLE_DISPLAY_NAMES: ReadonlyMap<string, string> = new Map([
  ['Office365', 'Office 365'],
  ['MicrosoftAdminPortals', 'Microsoft Admin Portals'],
  ['AzureVirtualDesktop', 'Azure Virtual Desktop'],
]);

// ── Lookup functions ──

/**
 * Check if an appId belongs to a bundle.
 * Also returns true if appId IS the bundle name itself (e.g., appId='Office365', bundleName='Office365').
 */
export function isAppInBundle(appId: string, bundleName: string): boolean {
  if (appId === bundleName) return true;
  const bundle = BUNDLE_MAP.get(bundleName);
  if (!bundle) return false;
  return bundle.has(appId);
}

/** Get the human-readable display name for a bundle, or undefined if not a bundle. */
export function getBundleDisplayName(bundleName: string): string | undefined {
  return BUNDLE_DISPLAY_NAMES.get(bundleName);
}

// ── ScenarioPanel UI types ──

export interface AppBundle {
  id: string;
  displayName: string;
  description: string;
  memberAppIds: string[];
}

export const APP_BUNDLES: AppBundle[] = [
  {
    id: 'All',
    displayName: 'All Cloud Apps',
    description: 'Matches any cloud application',
    memberAppIds: [],
  },
  {
    id: 'Office365',
    displayName: 'Office 365',
    description: 'Exchange Online, SharePoint, Teams, and other O365 apps',
    memberAppIds: [...OFFICE365_APP_IDS.keys()],
  },
  {
    id: 'MicrosoftAdminPortals',
    displayName: 'Microsoft Admin Portals',
    description: 'Azure Portal and M365 Security & Compliance Center',
    memberAppIds: [...ADMIN_PORTALS_APP_IDS.keys()],
  },
  {
    id: 'AzureVirtualDesktop',
    displayName: 'Azure Virtual Desktop',
    description: 'AVD, Remote Desktop, and Windows Cloud Login',
    memberAppIds: [...AVD_APP_IDS.keys()],
  },
];

/** Set of all bundle IDs for quick membership checks */
export const BUNDLE_IDS = new Set(APP_BUNDLES.map((b) => b.id));

/** Set of all app IDs covered by any bundle (for filtering tenant apps) */
export const BUNDLED_APP_IDS = new Set(APP_BUNDLES.flatMap((b) => b.memberAppIds));
