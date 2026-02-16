// Test fixtures: reusable SimulationContext builders

import type { SimulationContext } from '../../models/SimulationContext';

/**
 * Creates a default SimulationContext for a standard member user.
 * Override any fields via the partial parameter.
 */
export function createTestContext(overrides?: Partial<SimulationContext>): SimulationContext {
  return {
    user: {
      id: 'user-001',
      displayName: 'Test User',
      userType: 'member',
      memberOfGroupIds: [],
      directoryRoleIds: [],
    },
    application: {
      appId: 'app-001',
      displayName: 'Test App',
    },
    device: {},
    location: {},
    risk: {
      signInRiskLevel: 'none',
      userRiskLevel: 'none',
      insiderRiskLevel: 'none',
    },
    clientAppType: 'browser',
    satisfiedControls: [],
    ...overrides,
  };
}

/** Standard member user with no groups or roles */
export const STANDARD_USER_CONTEXT = createTestContext();

/** Global Admin user */
export const GLOBAL_ADMIN_CONTEXT = createTestContext({
  user: {
    id: 'admin-001',
    displayName: 'Global Admin',
    userType: 'member',
    memberOfGroupIds: ['group-admins'],
    directoryRoleIds: ['62e90394-69f5-4237-9190-012177145e10'], // Global Administrator roleTemplateId
  },
});

/** Guest user (B2B collaboration) */
export const GUEST_USER_CONTEXT = createTestContext({
  user: {
    id: 'guest-001',
    displayName: 'External Guest',
    userType: 'guest',
    guestOrExternalUserTypes: ['b2bCollaborationGuest'],
    memberOfGroupIds: ['group-guests'],
    directoryRoleIds: [],
    homeTenantId: 'external-tenant-001',
  },
});
