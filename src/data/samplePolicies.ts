// data/samplePolicies.ts — Hardcoded sample policies for demo mode.
// Represents a realistic, diverse tenant configuration covering all condition types.

import type { ConditionalAccessPolicy } from '../engine/models/Policy';

export const SAMPLE_POLICIES: ConditionalAccessPolicy[] = [
  // 1. Require MFA for all users accessing Office 365
  {
    id: 'ca-policy-001-mfa-all-office365',
    displayName: 'CA001: Require MFA for all users — Office 365',
    state: 'enabled',
    conditions: {
      users: {
        includeUsers: ['All'],
        excludeUsers: ['break-glass-admin'],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [],
      },
      applications: {
        includeApplications: ['Office365'],
        excludeApplications: [],
      },
      clientAppTypes: ['browser', 'mobileAppsAndDesktopClients'],
      signInRiskLevels: [],
      userRiskLevels: [],
    },
    grantControls: {
      operator: 'OR',
      builtInControls: ['mfa'],
    },
    sessionControls: null,
  },

  // 2. Block legacy authentication
  {
    id: 'ca-policy-002-block-legacy-auth',
    displayName: 'CA002: Block legacy authentication',
    state: 'enabled',
    conditions: {
      users: {
        includeUsers: ['All'],
        excludeUsers: ['sample-user-2'], // Sam Chen excluded — creates legacy auth gap for admin
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [],
      },
      applications: {
        includeApplications: ['All'],
        excludeApplications: [],
      },
      clientAppTypes: ['exchangeActiveSync', 'other'],
      signInRiskLevels: [],
      userRiskLevels: [],
    },
    grantControls: {
      operator: 'OR',
      builtInControls: ['block'],
    },
    sessionControls: null,
  },

  // 3. Require MFA for admin roles (all client types — empty = matches all)
  {
    id: 'ca-policy-003-mfa-admins',
    displayName: 'CA003: Require MFA for administrators',
    state: 'enabled',
    conditions: {
      users: {
        includeUsers: [],
        excludeUsers: ['break-glass-admin'],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [
          '62e90394-69f5-4237-9190-012177145e10', // Global Administrator
          '194ae4cb-b126-40b2-bd5b-6091b380977d', // Security Administrator
          'b1be1c3e-b65d-4f19-8427-f6fa0d97feb9', // Conditional Access Administrator
          'e8611ab8-c189-46e8-94e1-60213ab1f814', // Privileged Role Administrator
          'fe930be7-5e62-47db-91af-98c3a49a38b1', // User Administrator
        ],
        excludeRoles: [],
      },
      applications: {
        includeApplications: ['All'],
        excludeApplications: [],
      },
      clientAppTypes: [],
      signInRiskLevels: [],
      userRiskLevels: [],
    },
    grantControls: {
      operator: 'OR',
      builtInControls: ['mfa'],
    },
    sessionControls: null,
  },

  // 4. Require compliant device for all users
  {
    id: 'ca-policy-004-compliant-device',
    displayName: 'CA004: Require compliant device',
    state: 'enabled',
    conditions: {
      users: {
        includeUsers: ['All'],
        excludeUsers: ['break-glass-admin'],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [],
      },
      applications: {
        includeApplications: ['All'],
        excludeApplications: [
          '9cdead84-a403-4b2a-ab4c-a6a50620b2f1', // Azure Virtual Desktop
        ],
      },
      clientAppTypes: ['browser', 'mobileAppsAndDesktopClients'],
      signInRiskLevels: [],
      userRiskLevels: [],
    },
    grantControls: {
      operator: 'OR',
      builtInControls: ['compliantDevice'],
    },
    sessionControls: null,
  },

  // 5. Require MFA for risky sign-ins
  {
    id: 'ca-policy-005-risky-signin-mfa',
    displayName: 'CA005: Require MFA for medium and high risk sign-ins',
    state: 'enabled',
    conditions: {
      users: {
        includeUsers: ['All'],
        excludeUsers: ['break-glass-admin'],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [],
      },
      applications: {
        includeApplications: ['All'],
        excludeApplications: [],
      },
      clientAppTypes: ['browser', 'mobileAppsAndDesktopClients'],
      signInRiskLevels: ['medium', 'high'],
      userRiskLevels: [],
    },
    grantControls: {
      operator: 'OR',
      builtInControls: ['mfa'],
    },
    sessionControls: null,
  },

  // 6. Require password change for high-risk users
  {
    id: 'ca-policy-006-high-risk-user-pwchange',
    displayName: 'CA006: Require password change for high risk users',
    state: 'enabled',
    conditions: {
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
      clientAppTypes: ['browser', 'mobileAppsAndDesktopClients'],
      signInRiskLevels: [],
      userRiskLevels: ['high'],
    },
    grantControls: {
      operator: 'AND',
      builtInControls: ['mfa', 'passwordChange'],
    },
    sessionControls: null,
  },

  // 7. Block untrusted locations for admins
  {
    id: 'ca-policy-007-block-untrusted-admins',
    displayName: 'CA007: Block access from untrusted locations — admins',
    state: 'enabled',
    conditions: {
      users: {
        includeUsers: [],
        excludeUsers: ['break-glass-admin'],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [
          '62e90394-69f5-4237-9190-012177145e10', // Global Administrator
        ],
        excludeRoles: [],
      },
      applications: {
        includeApplications: ['All'],
        excludeApplications: [],
      },
      locations: {
        includeLocations: ['All'],
        excludeLocations: ['AllTrusted'],
      },
      clientAppTypes: ['browser', 'mobileAppsAndDesktopClients'],
      signInRiskLevels: [],
      userRiskLevels: [],
    },
    grantControls: {
      operator: 'OR',
      builtInControls: ['block'],
    },
    sessionControls: null,
  },

  // 8. Require MFA for guest access — Office 365 only (leaves non-O365 apps uncovered)
  {
    id: 'ca-policy-008-mfa-guests',
    displayName: 'CA008: Require MFA for guest users — Office 365',
    state: 'enabled',
    conditions: {
      users: {
        includeUsers: ['GuestsOrExternalUsers'],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [],
        includeGuestsOrExternalUsers: {
          guestOrExternalUserTypes: 'b2bCollaborationGuest,b2bDirectConnectUser,otherExternalUser',
          externalTenants: { membershipKind: 'all' },
        },
      },
      applications: {
        includeApplications: ['Office365'],
        excludeApplications: [],
      },
      clientAppTypes: ['browser', 'mobileAppsAndDesktopClients'],
      signInRiskLevels: [],
      userRiskLevels: [],
    },
    grantControls: {
      operator: 'OR',
      builtInControls: ['mfa'],
    },
    sessionControls: null,
  },

  // 9. No persistent browser session on unmanaged devices
  {
    id: 'ca-policy-009-no-persistent-browser',
    displayName: 'CA009: No persistent browser session',
    state: 'disabled',
    conditions: {
      users: {
        includeUsers: ['All'],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [],
      },
      applications: {
        includeApplications: ['Office365'],
        excludeApplications: [],
      },
      clientAppTypes: ['browser'],
      signInRiskLevels: [],
      userRiskLevels: [],
    },
    grantControls: null,
    sessionControls: {
      persistentBrowser: { isEnabled: true, mode: 'never' },
    },
  },

  // 10. Require app protection policy for mobile
  {
    id: 'ca-policy-010-app-protection-mobile',
    displayName: 'CA010: Require app protection — iOS and Android',
    state: 'enabled',
    conditions: {
      users: {
        includeUsers: ['All'],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [],
      },
      applications: {
        includeApplications: ['Office365'],
        excludeApplications: [],
      },
      platforms: {
        includePlatforms: ['iOS', 'android'],
      },
      clientAppTypes: ['browser', 'mobileAppsAndDesktopClients'],
      signInRiskLevels: [],
      userRiskLevels: [],
    },
    grantControls: {
      operator: 'OR',
      builtInControls: ['approvedApplication', 'compliantApplication'],
    },
    sessionControls: null,
  },

  // 11. Require MFA for Azure management
  {
    id: 'ca-policy-011-mfa-azure-management',
    displayName: 'CA011: Require MFA for Azure management',
    state: 'enabled',
    conditions: {
      users: {
        includeUsers: ['All'],
        excludeUsers: ['break-glass-admin'],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [],
      },
      applications: {
        includeApplications: ['797f4846-ba00-4fd7-ba43-dac1f8f63013'], // Azure Service Management
        excludeApplications: [],
      },
      clientAppTypes: ['browser', 'mobileAppsAndDesktopClients'],
      signInRiskLevels: [],
      userRiskLevels: [],
    },
    grantControls: {
      operator: 'OR',
      builtInControls: ['mfa'],
    },
    sessionControls: null,
  },

  // 12. Phishing-resistant MFA for admins (report-only)
  {
    id: 'ca-policy-012-phishing-resistant-admins',
    displayName: 'CA012: Phishing-resistant MFA for admins (report-only)',
    state: 'enabledForReportingButNotEnforced',
    conditions: {
      users: {
        includeUsers: [],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [
          '62e90394-69f5-4237-9190-012177145e10', // Global Administrator
          '194ae4cb-b126-40b2-bd5b-6091b380977d', // Security Administrator
        ],
        excludeRoles: [],
      },
      applications: {
        includeApplications: ['All'],
        excludeApplications: [],
      },
      clientAppTypes: ['browser', 'mobileAppsAndDesktopClients'],
      signInRiskLevels: [],
      userRiskLevels: [],
    },
    grantControls: {
      operator: 'OR',
      builtInControls: ['mfa'],
      authenticationStrength: { id: '00000000-0000-0000-0000-000000000004', displayName: 'Phishing-resistant MFA' },
    },
    sessionControls: null,
  },

  // 13. Block device code flow for all users
  {
    id: 'ca-policy-013-block-device-code-flow',
    displayName: 'CA013: Block device code flow',
    state: 'enabled',
    conditions: {
      users: {
        includeUsers: ['All'],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: ['group-breakglass'],
        includeRoles: [],
        excludeRoles: [],
      },
      applications: {
        includeApplications: ['All'],
        excludeApplications: [],
      },
      clientAppTypes: ['browser', 'mobileAppsAndDesktopClients'],
      signInRiskLevels: [],
      userRiskLevels: [],
      authenticationFlows: {
        transferMethods: ['deviceCodeFlow'],
      },
    },
    grantControls: {
      operator: 'OR',
      builtInControls: ['block'],
    },
    sessionControls: null,
  },
];

/** Display names for GUIDs referenced in sample policies. */
export const SAMPLE_DISPLAY_NAMES: Record<string, string> = {
  // Apps
  'Office365': 'Office 365',
  'All': 'All Cloud Apps',
  'MicrosoftAdminPortals': 'Microsoft Admin Portals',
  '797f4846-ba00-4fd7-ba43-dac1f8f63013': 'Azure Service Management',
  '9cdead84-a403-4b2a-ab4c-a6a50620b2f1': 'Azure Virtual Desktop',
  // Roles
  '62e90394-69f5-4237-9190-012177145e10': 'Global Administrator',
  '194ae4cb-b126-40b2-bd5b-6091b380977d': 'Security Administrator',
  'b1be1c3e-b65d-4f19-8427-f6fa0d97feb9': 'Conditional Access Administrator',
  'e8611ab8-c189-46e8-94e1-60213ab1f814': 'Privileged Role Administrator',
  'fe930be7-5e62-47db-91af-98c3a49a38b1': 'User Administrator',
  // Groups (referenced in sample personas)
  'group-all-employees': 'All Employees',
  'group-marketing': 'Marketing Team',
  'group-it': 'IT Department',
  'group-service-accounts': 'Service Accounts',
  'group-breakglass': 'Break Glass Accounts',
};
