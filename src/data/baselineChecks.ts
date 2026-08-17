// data/baselineChecks.ts — Microsoft Conditional Access template baseline catalog.
//
// Pure data, appBundles-style: the single source of truth for what the
// Baseline tab assesses. Each check is an outcome spec — target scenarios plus
// the protection that must be GUARANTEED in them — evaluated by
// lib/baselineAssessment.ts through the engine. Structural matching against
// template JSON is deliberately avoided: a custom-shaped policy that provides
// the protection passes; a template lookalike with a scope hole fails.
//
// Catalog source: https://learn.microsoft.com/entra/identity/conditional-access/concept-conditional-access-policy-common
// The AI Agents template category is out of scope (the engine doesn't model
// agent identities).

import type { ClientAppType, DevicePlatform, RiskLevel, InsiderRiskLevel } from '@/engine/models/Policy';

export type BaselineCategory =
  | 'secureFoundation'
  | 'zeroTrust'
  | 'remoteWork'
  | 'protectAdmin'
  | 'emergingThreats'
  | 'aiAgents';

export const BASELINE_CATEGORY_LABELS: Record<BaselineCategory, string> = {
  secureFoundation: 'Secure Foundation',
  zeroTrust: 'Zero Trust',
  remoteWork: 'Remote Work',
  protectAdmin: 'Protect Administrators',
  emergingThreats: 'Emerging Threats',
  aiAgents: 'AI Agents',
};

export type BaselineLicense = 'P1' | 'P2' | 'purview';

export type BaselinePersona = 'member' | 'guest' | 'admin';

/**
 * What must be guaranteed in every target scenario.
 * Grant expectations are satisfied by a block verdict too (block beats everything).
 */
export type BaselineExpectation =
  | 'block'
  | 'mfa'                      // MFA or any authentication strength
  | 'phishing-resistant-mfa'   // authentication strength tier 3
  | 'device-trust'             // compliant or hybrid-joined device
  | 'device-trust-or-mfa'
  | 'app-protection'           // approved client app or app protection policy
  | 'password-change'
  | 'no-persistent-browser'    // session control: persistent browser = never
  | 'app-enforced-restrictions'; // session control: app-enforced restrictions

export type BaselineTarget =
  | { kind: 'sweepApps' }      // the standard sweep app dimension
  | { kind: 'app'; appId: string; displayName: string }
  | { kind: 'userAction'; action: 'registerSecurityInformation'; displayName: string };

export interface BaselineAssessmentSpec {
  /** Ignored when `identity` is set (agent checks use synthetic agent contexts) */
  personas: BaselinePersona[];
  /** Agent sign-in checks: synthetic agent contexts replace personas */
  identity?: {
    type: 'agentIdentity' | 'agentUser';
    /** Agent risk dimension; defaults to ['none'] */
    agentRiskLevels?: (RiskLevel | 'none')[];
  };
  target: BaselineTarget;
  /** Defaults to all four client app types */
  clientApps?: ClientAppType[];
  /** Defaults to the five sweep platforms; 'unknown' = platform not reported */
  platforms?: DevicePlatform[] | 'unknown';
  /** Defaults to both */
  locations?: ('trusted' | 'untrusted')[];
  /** Defaults to ['none'] */
  signInRiskLevels?: (RiskLevel | 'none')[];
  /** Defaults to ['none'] */
  userRiskLevels?: (RiskLevel | 'none')[];
  /** Defaults to ['none'] */
  insiderRiskLevels?: (InsiderRiskLevel | 'none')[];
  expect: BaselineExpectation;
}

export interface BaselineCheck {
  id: string;
  name: string;
  categories: BaselineCategory[];
  license: BaselineLicense;
  docsUrl: string;
  whyItMatters: string;
  assessment: BaselineAssessmentSpec;
}

const DOCS = 'https://learn.microsoft.com/entra/identity/conditional-access';

/** Windows Azure Service Management API — the Azure management target app. */
export const AZURE_MANAGEMENT_APP_ID = '797f4846-ba00-4fd7-ba43-dac1f8f63013';

export const BASELINE_CHECKS: readonly BaselineCheck[] = [
  {
    id: 'require-mfa-admins',
    name: 'Require multifactor authentication for admins',
    categories: ['secureFoundation', 'zeroTrust', 'protectAdmin'],
    license: 'P1',
    docsUrl: `${DOCS}/policy-old-require-mfa-admin`,
    whyItMatters: 'Privileged accounts are the highest-value target — a compromised admin password without MFA is a full tenant compromise.',
    assessment: {
      personas: ['admin'],
      target: { kind: 'sweepApps' },
      expect: 'mfa',
    },
  },
  {
    id: 'secure-security-info-registration',
    name: 'Securing security info registration',
    categories: ['secureFoundation', 'zeroTrust', 'remoteWork'],
    license: 'P1',
    docsUrl: `${DOCS}/policy-all-users-security-info-registration`,
    whyItMatters: 'Unprotected security info registration lets an attacker with a stolen password enroll their own MFA methods. Pair it with a Temporary Access Pass or a trusted-location path: a user who has not registered any method yet cannot satisfy an MFA requirement to register their first one.',
    assessment: {
      // Members and admins only — Microsoft's template explicitly excludes
      // guest/external users from this protection (they register elsewhere)
      personas: ['member', 'admin'],
      target: { kind: 'userAction', action: 'registerSecurityInformation', displayName: 'Security info registration' },
      clientApps: ['browser', 'mobileAppsAndDesktopClients'],
      locations: ['untrusted'], // the template itself excludes trusted locations
      expect: 'mfa',
    },
  },
  {
    id: 'block-legacy-auth',
    name: 'Block legacy authentication',
    categories: ['secureFoundation', 'zeroTrust', 'remoteWork', 'protectAdmin'],
    license: 'P1',
    docsUrl: `${DOCS}/policy-block-legacy-authentication`,
    whyItMatters: 'Legacy protocols cannot perform MFA and are the most common vector for credential-stuffing and password-spray attacks.',
    assessment: {
      personas: ['member', 'guest', 'admin'],
      target: { kind: 'sweepApps' },
      clientApps: ['exchangeActiveSync', 'other'],
      expect: 'block',
    },
  },
  {
    id: 'require-mfa-admin-portals',
    name: 'Require MFA for admins accessing Microsoft admin portals',
    categories: ['secureFoundation', 'zeroTrust'],
    license: 'P1',
    docsUrl: `${DOCS}/policy-old-require-mfa-admin-portals`,
    whyItMatters: 'Admin portals expose tenant-wide configuration; sessions reaching them deserve a stronger guarantee than password alone.',
    assessment: {
      personas: ['admin'],
      target: { kind: 'app', appId: 'MicrosoftAdminPortals', displayName: 'Microsoft Admin Portals' },
      expect: 'mfa',
    },
  },
  {
    id: 'require-mfa-all-users',
    name: 'Require multifactor authentication for all users',
    categories: ['secureFoundation', 'zeroTrust', 'remoteWork'],
    license: 'P1',
    docsUrl: `${DOCS}/policy-all-users-mfa-strength`,
    whyItMatters: 'MFA blocks the overwhelming majority of automated identity attacks; coverage gaps are where account takeovers happen.',
    assessment: {
      personas: ['member', 'guest', 'admin'],
      target: { kind: 'sweepApps' },
      expect: 'mfa',
    },
  },
  {
    id: 'require-mfa-azure-mgmt',
    name: 'Require multifactor authentication for Azure management',
    categories: ['secureFoundation', 'zeroTrust', 'protectAdmin'],
    license: 'P1',
    docsUrl: `${DOCS}/policy-old-require-mfa-azure-mgmt`,
    whyItMatters: 'Azure management endpoints control subscriptions and infrastructure — password-only access invites lateral movement into cloud workloads.',
    assessment: {
      personas: ['member', 'guest', 'admin'],
      target: { kind: 'app', appId: AZURE_MANAGEMENT_APP_ID, displayName: 'Azure Service Management' },
      expect: 'mfa',
    },
  },
  {
    id: 'compliant-hybrid-or-mfa-all-users',
    name: 'Require compliant or hybrid joined device or MFA for all users',
    categories: ['secureFoundation', 'zeroTrust'],
    license: 'P1',
    docsUrl: `${DOCS}/policy-alt-all-users-compliant-hybrid-or-mfa`,
    whyItMatters: 'Guarantees every sign-in proves either device trust or a second factor — the recommended balance of security and flexibility.',
    assessment: {
      personas: ['member', 'guest', 'admin'],
      target: { kind: 'sweepApps' },
      expect: 'device-trust-or-mfa',
    },
  },
  {
    id: 'require-compliant-device',
    name: 'Require compliant device',
    categories: ['secureFoundation', 'remoteWork', 'protectAdmin'],
    license: 'P1',
    docsUrl: `${DOCS}/policy-all-users-device-compliance`,
    whyItMatters: 'Device compliance ensures data is only accessed from managed, healthy endpoints with security controls in place.',
    assessment: {
      personas: ['member', 'admin'], // guests rarely have managed devices; template guidance targets internal users
      target: { kind: 'sweepApps' },
      expect: 'device-trust',
    },
  },
  {
    id: 'require-mfa-guests',
    name: 'Require multifactor authentication for guest access',
    categories: ['zeroTrust', 'remoteWork'],
    license: 'P1',
    docsUrl: `${DOCS}/policy-old-require-mfa-guest`,
    whyItMatters: 'Guest accounts live outside your credential hygiene controls; their home tenant may enforce nothing at all.',
    assessment: {
      personas: ['guest'],
      target: { kind: 'sweepApps' },
      expect: 'mfa',
    },
  },
  {
    id: 'require-mfa-risky-signins',
    name: 'Require multifactor authentication for risky sign-ins',
    categories: ['zeroTrust', 'remoteWork'],
    license: 'P2',
    docsUrl: `${DOCS}/policy-risk-based-sign-in`,
    whyItMatters: 'Sign-in risk signals (anonymized IPs, impossible travel, token anomalies) identify in-progress attacks that static policies miss.',
    assessment: {
      personas: ['member', 'guest', 'admin'],
      target: { kind: 'sweepApps' },
      signInRiskLevels: ['medium', 'high'],
      expect: 'mfa',
    },
  },
  {
    id: 'require-password-change-high-risk-users',
    name: 'Require password change for high-risk users',
    categories: ['zeroTrust', 'remoteWork'],
    license: 'P2',
    docsUrl: `${DOCS}/policy-risk-based-user`,
    whyItMatters: 'A high user-risk score usually means leaked credentials; forcing a secured password change closes the window of exposure.',
    assessment: {
      personas: ['member', 'admin'],
      target: { kind: 'sweepApps' },
      userRiskLevels: ['high'],
      expect: 'password-change',
    },
  },
  {
    id: 'compliant-or-hybrid-admins',
    name: 'Require compliant or hybrid joined device for administrators',
    categories: ['remoteWork', 'protectAdmin'],
    license: 'P1',
    docsUrl: `${DOCS}/policy-alt-admin-device-compliand-hybrid`,
    whyItMatters: 'Admin sessions from unmanaged endpoints expose privileged tokens to whatever malware lives there.',
    assessment: {
      personas: ['admin'],
      target: { kind: 'sweepApps' },
      expect: 'device-trust',
    },
  },
  {
    id: 'block-unknown-platforms',
    name: 'Block access for unknown or unsupported device platform',
    categories: ['zeroTrust', 'remoteWork'],
    license: 'P1',
    docsUrl: `${DOCS}/policy-all-users-device-unknown-unsupported`,
    whyItMatters: 'Clients that hide or spoof their platform sidestep platform-scoped policies; blocking them closes that loophole.',
    assessment: {
      personas: ['member', 'guest', 'admin'],
      target: { kind: 'sweepApps' },
      platforms: 'unknown',
      clientApps: ['browser', 'mobileAppsAndDesktopClients'],
      expect: 'block',
    },
  },
  {
    id: 'no-persistent-browser',
    name: 'No persistent browser session',
    categories: ['zeroTrust', 'remoteWork'],
    license: 'P1',
    docsUrl: `${DOCS}/policy-all-users-persistent-browser`,
    whyItMatters: 'Persistent sessions on shared or unmanaged machines keep working long after the user walks away.',
    assessment: {
      personas: ['member', 'guest', 'admin'],
      target: { kind: 'sweepApps' },
      clientApps: ['browser'],
      expect: 'no-persistent-browser',
    },
  },
  {
    id: 'approved-apps-or-app-protection',
    name: 'Require approved client apps or app protection policies',
    categories: ['zeroTrust', 'remoteWork'],
    license: 'P1',
    docsUrl: `${DOCS}/policy-all-users-approved-app-or-app-protection`,
    whyItMatters: 'On mobile platforms, corporate data is only contained when accessed through apps that honor protection policies.',
    assessment: {
      personas: ['member', 'admin'],
      target: { kind: 'sweepApps' },
      platforms: ['iOS', 'android'],
      clientApps: ['browser', 'mobileAppsAndDesktopClients'],
      expect: 'app-protection',
    },
  },
  {
    id: 'app-enforced-restrictions',
    name: 'Use application enforced restrictions for unmanaged devices',
    categories: ['remoteWork'],
    license: 'P1',
    docsUrl: `${DOCS}/policy-all-users-app-enforced-restrictions`,
    whyItMatters: 'Limited, browser-only access for unmanaged devices keeps documents viewable but not downloadable onto unknown endpoints.',
    assessment: {
      personas: ['member', 'guest'],
      target: { kind: 'app', appId: 'Office365', displayName: 'Office 365' },
      clientApps: ['browser'],
      expect: 'app-enforced-restrictions',
    },
  },
  {
    id: 'phishing-resistant-mfa-admins',
    name: 'Require phishing-resistant multifactor authentication for administrators',
    categories: ['protectAdmin', 'emergingThreats'],
    license: 'P1',
    docsUrl: `${DOCS}/policy-admin-phish-resistant-mfa`,
    whyItMatters: 'Conventional MFA can be phished in real time with adversary-in-the-middle kits; FIDO2 and certificate-based methods cannot.',
    assessment: {
      personas: ['admin'],
      target: { kind: 'sweepApps' },
      expect: 'phishing-resistant-mfa',
    },
  },
  {
    id: 'block-insider-risk',
    name: 'Block access for users with insider risk',
    categories: ['zeroTrust'],
    license: 'purview',
    docsUrl: `${DOCS}/policy-risk-based-insider-block`,
    whyItMatters: 'Elevated insider-risk signals from Purview (data exfiltration patterns, departing employees) warrant cutting access automatically.',
    assessment: {
      personas: ['member'],
      target: { kind: 'sweepApps' },
      insiderRiskLevels: ['elevated'],
      expect: 'block',
    },
  },
  {
    id: 'block-high-risk-agents',
    name: 'Block high-risk agent identities',
    categories: ['aiAgents'],
    license: 'P2',
    docsUrl: `${DOCS}/policy-autonomous-agents`,
    whyItMatters: 'A compromised agent operates at machine speed with standing permissions; ID Protection risk signals are the tripwire that cuts it off automatically.',
    assessment: {
      personas: [],
      identity: { type: 'agentIdentity', agentRiskLevels: ['high'] },
      target: { kind: 'sweepApps' },
      expect: 'block',
    },
  },
  {
    id: 'approved-agents-only',
    name: 'Allow only approved agent identities',
    categories: ['aiAgents'],
    license: 'P1',
    docsUrl: `${DOCS}/policy-autonomous-agents`,
    whyItMatters: 'Agents enter tenants through many channels (ISV consent, Copilot Studio, Foundry); deny-by-default ensures only reviewed agents can authenticate, regardless of how they arrived.',
    assessment: {
      personas: [],
      identity: { type: 'agentIdentity', agentRiskLevels: ['none'] },
      target: { kind: 'sweepApps' },
      expect: 'block',
    },
  },
  {
    id: 'block-risky-agent-users',
    name: "Block risky agents' user accounts",
    categories: ['aiAgents'],
    license: 'P2',
    docsUrl: `${DOCS}/policy-autonomous-agents`,
    whyItMatters: "Agents operating as users carry mailboxes and memberships; when ID Protection flags them, 'All users' policies won't catch them — only agent-user targeting will.",
    assessment: {
      personas: [],
      identity: { type: 'agentUser', agentRiskLevels: ['medium', 'high'] },
      target: { kind: 'sweepApps' },
      expect: 'block',
    },
  },
] as const;
