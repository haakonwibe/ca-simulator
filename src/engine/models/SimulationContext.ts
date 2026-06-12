// engine/models/SimulationContext.ts

import type { ClientAppType, DevicePlatform, RiskLevel, InsiderRiskLevel } from './Policy';

export interface SimulationContext {
  user: UserContext;
  application: ApplicationContext;
  device: DeviceContext;
  location: LocationContext;
  risk: RiskContext;
  clientAppType: ClientAppType;
  /**
   * Identity type for the sign-in (default 'user').
   * - 'agentIdentity': agent acting as itself — only policies with agent
   *   targeting (clientApplications.includeAgentIdServicePrincipals) apply;
   *   the users condition is skipped.
   * - 'agentUser': agent's user account — matched only by 'AllAgentIdUsers'
   *   or its own id; 'All' and groups do NOT match (documented limitations).
   */
  identityType?: 'user' | 'agentUser' | 'agentIdentity';
  /** Agent details for agentIdentity sign-ins */
  agent?: AgentContext;
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
  /** Target is an agent resource — matched by 'AllAgentIdResources' in app lists */
  isAgentResource?: boolean;
}

export interface AgentContext {
  /** The agent identity's service principal id */
  servicePrincipalId: string;
  displayName: string;
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
}

export interface RiskContext {
  signInRiskLevel: RiskLevel | 'none';
  userRiskLevel: RiskLevel | 'none';
  insiderRiskLevel: InsiderRiskLevel | 'none';
  /** Agent risk (ID Protection for agents) — only meaningful for agentIdentity sign-ins */
  agentRiskLevel?: RiskLevel | 'none';
}

export type SatisfiedControl =
  | 'mfa'
  | 'compliantDevice'
  | 'domainJoinedDevice'
  | 'approvedApplication'
  | 'compliantApplication'
  | 'passwordChange';
