// engine/models/SimulationContext.ts

import type { ClientAppType, DevicePlatform, RiskLevel, InsiderRiskLevel } from './Policy';

export interface SimulationContext {
  user: UserContext;
  application: ApplicationContext;
  device: DeviceContext;
  location: LocationContext;
  risk: RiskContext;
  clientAppType: ClientAppType;
  /** Authentication flow type for the sign-in attempt */
  authenticationFlow?: 'none' | 'deviceCodeFlow' | 'authenticationTransfer';
  /** Authentication strength level: 0=none, 1=MFA, 2=Passwordless MFA, 3=Phishing-resistant MFA */
  authenticationStrengthLevel?: number;
  /** Resolved custom authentication strength ID → tier level (1-3) */
  customAuthStrengthMap?: ReadonlyMap<string, number>;
  /** Controls the user has already satisfied (for grant resolution) */
  satisfiedControls: SatisfiedControl[];
}

export interface UserContext {
  id: string;
  displayName: string;
  userType: 'member' | 'guest';
  /** Specific guest types if guest user */
  guestOrExternalUserTypes?: string[];
  /** Group IDs the user is a transitive member of */
  memberOfGroupIds: string[];
  /** Role template IDs assigned to the user */
  directoryRoleIds: string[];
  /** Home tenant ID for external users */
  homeTenantId?: string;
}

export interface ApplicationContext {
  appId: string;
  displayName: string;
  /** User action instead of app access */
  userAction?: 'registerSecurityInformation' | 'registerOrJoinDevices';
  authenticationContext?: string;
}

export interface DeviceContext {
  platform?: DevicePlatform;
  isCompliant?: boolean;
  trustType?: 'azureADJoined' | 'hybridAzureADJoined' | 'azureADRegistered';
  /** Key-value properties for device filter evaluation */
  properties?: Record<string, string>;
}

export interface LocationContext {
  /** Named location ID if resolved */
  namedLocationId?: string;
  isTrustedLocation?: boolean;
  countryCode?: string;
}

export interface RiskContext {
  signInRiskLevel: RiskLevel | 'none';
  userRiskLevel: RiskLevel | 'none';
  insiderRiskLevel: InsiderRiskLevel | 'none';
}

export type SatisfiedControl =
  | 'mfa'
  | 'compliantDevice'
  | 'domainJoinedDevice'
  | 'approvedApplication'
  | 'compliantApplication'
  | 'passwordChange';
