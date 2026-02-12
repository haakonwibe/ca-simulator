// Test fixtures: reusable UserCondition builders

import type { UserCondition } from '../../models/Policy';

/** Creates a default empty UserCondition. Override fields as needed. */
export function createUserCondition(overrides?: Partial<UserCondition>): UserCondition {
  return {
    includeUsers: [],
    excludeUsers: [],
    includeGroups: [],
    excludeGroups: [],
    includeRoles: [],
    excludeRoles: [],
    ...overrides,
  };
}
