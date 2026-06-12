// engine/models/Policy.ts
// Mirrors microsoft.graph.conditionalAccessPolicy schema

export type PolicyState = 'enabled' | 'disabled' | 'enabledForReportingButNotEnforced';

export interface ConditionalAccessPolicy {
  id: string;
  displayName: string;
  state: PolicyState;
  conditions: PolicyConditions;
  grantControls: GrantControls | null;
  sessionControls: SessionControls | null;
  // Metadata
  createdDateTime?: string;
  modifiedDateTime?: string;
}

export interface PolicyConditions {
  users: UserCondition;
  applications: ApplicationCondition;
  platforms?: PlatformCondition;
  locations?: LocationCondition;
  clientAppTypes: PolicyClientAppType[];
  signInRiskLevels: RiskLevel[];
  userRiskLevels: RiskLevel[];
  devices?: DeviceFilterCondition;
  authenticationFlows?: AuthenticationFlowCondition;
  servicePrincipalRiskLevels?: RiskLevel[];
  insiderRiskLevels?: InsiderRiskLevel[];
  /** Agent identity / workload identity targeting (beta Graph schema) */
  clientApplications?: ClientApplicationsCondition;
  /** Agent risk condition — Graph wire format is a comma-flagged string; normalized to an array */
  agentIdRiskLevels?: RiskLevel[];
}

/**
 * Special values in user lists: 'AllAgentIdUsers' targets agent user accounts
 * (NOT covered by 'All' per documented Microsoft limitation). Special value in
 * application lists: 'AllAgentIdResources' targets agent resources.
 */
export interface ClientApplicationsCondition {
  includeServicePrincipals: string[];
  excludeServicePrincipals: string[];
  /** ['All'] or specific agent service principal ids */
  includeAgentIdServicePrincipals?: string[];
  excludeAgentIdServicePrincipals?: string[];
  servicePrincipalFilter?: DeviceFilterCondition;
  /** Custom-security-attribute filter — displayed but NOT evaluated (v0.6.6) */
  agentIdServicePrincipalFilter?: DeviceFilterCondition;
}

export interface AuthenticationFlowCondition {
  transferMethods: AuthenticationFlowTransferMethod[];
}

export type AuthenticationFlowTransferMethod = 'deviceCodeFlow' | 'authenticationTransfer' | 'unknownFutureValue';

export interface UserCondition {
  includeUsers: string[];
  excludeUsers: string[];
  includeGroups: string[];
  excludeGroups: string[];
  includeRoles: string[];
  excludeRoles: string[];
  includeGuestsOrExternalUsers?: GuestOrExternalUserCondition;
  excludeGuestsOrExternalUsers?: GuestOrExternalUserCondition;
}

export interface GuestOrExternalUserCondition {
  guestOrExternalUserTypes: string; // Comma-separated: 'b2bCollaborationGuest,internalGuest,...'
  externalTenants?: {
    membershipKind: 'all' | 'enumerated' | 'unknownFutureValue';
    members?: string[]; // Tenant IDs
  };
}

export interface ApplicationCondition {
  includeApplications: string[];
  excludeApplications: string[];
  includeUserActions?: string[];
  includeAuthenticationContextClassReferences?: string[];
}

export interface PlatformCondition {
  includePlatforms: DevicePlatform[];
  excludePlatforms?: DevicePlatform[];
}

export type DevicePlatform = 'android' | 'iOS' | 'windows' | 'macOS' | 'linux' | 'windowsPhone' | 'all';

export interface LocationCondition {
  includeLocations: string[];
  excludeLocations: string[];
}

export interface DeviceFilterCondition {
  mode: 'include' | 'exclude';
  rule: string;
}

export type ClientAppType = 'browser' | 'mobileAppsAndDesktopClients' | 'exchangeActiveSync' | 'other';
/** Policy condition values — Graph returns ['all'] for unconfigured client app types on modern policies. */
export type PolicyClientAppType = ClientAppType | 'all';
export type RiskLevel = 'low' | 'medium' | 'high' | 'none';
export type InsiderRiskLevel = 'minor' | 'moderate' | 'elevated';

export interface GrantControls {
  operator: 'AND' | 'OR';
  builtInControls: BuiltInControl[];
  customAuthenticationFactors?: string[];
  termsOfUse?: string[];
  authenticationStrength?: { id: string; displayName?: string };
}

export type BuiltInControl =
  | 'block'
  | 'mfa'
  | 'compliantDevice'
  | 'domainJoinedDevice'
  | 'approvedApplication'
  | 'compliantApplication'
  | 'passwordChange';

export interface SessionControls {
  applicationEnforcedRestrictions?: { isEnabled: boolean };
  cloudAppSecurity?: { isEnabled: boolean; cloudAppSecurityType: string };
  signInFrequency?: { isEnabled: boolean; value: number; type: 'hours' | 'days'; frequencyInterval: string };
  persistentBrowser?: { isEnabled: boolean; mode: 'always' | 'never' };
  continuousAccessEvaluation?: { mode: string };
  disableResilienceDefaults?: boolean;
  secureSignInSession?: { isEnabled: boolean };
}
