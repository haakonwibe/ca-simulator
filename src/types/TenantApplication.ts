/** A resolved application available for simulation. */
export interface TenantApplication {
  /** The application (client) ID — this is what CA policies reference */
  appId: string;
  /** Human-readable display name */
  displayName: string;
  /**
   * Where this app was discovered:
   * - 'enterprise' — from servicePrincipals (enterprise apps)
   * - 'registration' — from /applications (app registrations)
   * - 'policy' — only referenced in a CA policy (not found in tenant app lists)
   */
  source: 'enterprise' | 'registration' | 'policy';
}
