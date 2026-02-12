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
  clientAppTypes: ClientAppType[];
  signInRiskLevels: RiskLevel[];
  userRiskLevels: RiskLevel[];
  devices?: DeviceFilterCondition;
  authenticationFlows?: AuthenticationFlowCondition;
  servicePrincipalRiskLevels?: RiskLevel[];
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
export type RiskLevel = 'low' | 'medium' | 'high' | 'none';

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
}
