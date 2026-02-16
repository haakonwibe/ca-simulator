// UserConditionMatcher tests

import { describe, it, expect } from 'vitest';
import { UserConditionMatcher } from '../../conditions/UserConditionMatcher';
import { createTestContext, STANDARD_USER_CONTEXT, GLOBAL_ADMIN_CONTEXT, GUEST_USER_CONTEXT } from '../fixtures/testScenarios';
import { createUserCondition } from '../fixtures/samplePolicies';

const matcher = new UserConditionMatcher();

describe('UserConditionMatcher', () => {
  // ──────────────────────────────────────────────
  // Golden Rule #2: Empty inclusion = matches everyone
  // ──────────────────────────────────────────────
  describe('unconfigured conditions', () => {
    it('matches all users when inclusion is completely empty (Golden Rule #2)', () => {
      const condition = createUserCondition();
      const result = matcher.evaluate(STANDARD_USER_CONTEXT, condition);

      expect(result.matches).toBe(true);
      expect(result.phase).toBe('notConfigured');
    });
  });

  // ──────────────────────────────────────────────
  // "All" inclusion
  // ──────────────────────────────────────────────
  describe('All users inclusion', () => {
    it('matches any member user when includeUsers contains "All"', () => {
      const condition = createUserCondition({ includeUsers: ['All'] });
      const result = matcher.evaluate(STANDARD_USER_CONTEXT, condition);

      expect(result.matches).toBe(true);
      expect(result.phase).toBe('inclusion');
      expect(result.reason).toContain('All');
    });

    it('matches guest users when includeUsers contains "All"', () => {
      const condition = createUserCondition({ includeUsers: ['All'] });
      const result = matcher.evaluate(GUEST_USER_CONTEXT, condition);

      expect(result.matches).toBe(true);
    });

    it('matches admin users when includeUsers contains "All"', () => {
      const condition = createUserCondition({ includeUsers: ['All'] });
      const result = matcher.evaluate(GLOBAL_ADMIN_CONTEXT, condition);

      expect(result.matches).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // "None" inclusion
  // ──────────────────────────────────────────────
  describe('None users inclusion', () => {
    it('does not match any user when includeUsers contains "None"', () => {
      const condition = createUserCondition({ includeUsers: ['None'] });
      const result = matcher.evaluate(STANDARD_USER_CONTEXT, condition);

      expect(result.matches).toBe(false);
      expect(result.reason).toContain('None');
    });
  });

  // ──────────────────────────────────────────────
  // Specific user ID inclusion
  // ──────────────────────────────────────────────
  describe('specific user ID inclusion', () => {
    it('matches when user ID is in includeUsers', () => {
      const condition = createUserCondition({ includeUsers: ['user-001'] });
      const result = matcher.evaluate(STANDARD_USER_CONTEXT, condition);

      expect(result.matches).toBe(true);
      expect(result.phase).toBe('inclusion');
    });

    it('does not match when user ID is not in includeUsers', () => {
      const condition = createUserCondition({ includeUsers: ['user-999'] });
      const result = matcher.evaluate(STANDARD_USER_CONTEXT, condition);

      expect(result.matches).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // Group membership inclusion
  // ──────────────────────────────────────────────
  describe('group membership inclusion', () => {
    it('matches when user belongs to an included group', () => {
      const ctx = createTestContext({
        user: {
          id: 'user-002',
          displayName: 'Group Member',
          userType: 'member',
          memberOfGroupIds: ['group-alpha', 'group-beta'],
          directoryRoleIds: [],
        },
      });
      const condition = createUserCondition({ includeGroups: ['group-beta'] });
      const result = matcher.evaluate(ctx, condition);

      expect(result.matches).toBe(true);
      expect(result.details?.includedByGroup).toBe('group-beta');
    });

    it('does not match when user is not in any included group', () => {
      const condition = createUserCondition({ includeGroups: ['group-gamma'] });
      const result = matcher.evaluate(STANDARD_USER_CONTEXT, condition);

      expect(result.matches).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // Directory role inclusion (roleTemplateId)
  // ──────────────────────────────────────────────
  describe('directory role inclusion', () => {
    const GLOBAL_ADMIN_ROLE_TEMPLATE_ID = '62e90394-69f5-4237-9190-012177145e10';

    it('matches when user has an included directory role (by roleTemplateId)', () => {
      const condition = createUserCondition({ includeRoles: [GLOBAL_ADMIN_ROLE_TEMPLATE_ID] });
      const result = matcher.evaluate(GLOBAL_ADMIN_CONTEXT, condition);

      expect(result.matches).toBe(true);
      expect(result.details?.includedByRole).toBe(GLOBAL_ADMIN_ROLE_TEMPLATE_ID);
    });

    it('does not match when user lacks the required role', () => {
      const condition = createUserCondition({ includeRoles: [GLOBAL_ADMIN_ROLE_TEMPLATE_ID] });
      const result = matcher.evaluate(STANDARD_USER_CONTEXT, condition);

      expect(result.matches).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // GuestsOrExternalUsers inclusion
  // ──────────────────────────────────────────────
  describe('GuestsOrExternalUsers inclusion', () => {
    it('matches guest users when includeUsers contains "GuestsOrExternalUsers"', () => {
      const condition = createUserCondition({ includeUsers: ['GuestsOrExternalUsers'] });
      const result = matcher.evaluate(GUEST_USER_CONTEXT, condition);

      expect(result.matches).toBe(true);
    });

    it('does not match member users when includeUsers contains "GuestsOrExternalUsers"', () => {
      const condition = createUserCondition({ includeUsers: ['GuestsOrExternalUsers'] });
      const result = matcher.evaluate(STANDARD_USER_CONTEXT, condition);

      expect(result.matches).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // Granular guest/external user inclusion
  // ──────────────────────────────────────────────
  describe('granular guest/external user inclusion', () => {
    it('matches when guest type matches includeGuestsOrExternalUsers', () => {
      const condition = createUserCondition({
        includeGuestsOrExternalUsers: {
          guestOrExternalUserTypes: 'b2bCollaborationGuest,internalGuest',
        },
      });
      const result = matcher.evaluate(GUEST_USER_CONTEXT, condition);

      expect(result.matches).toBe(true);
      expect(result.phase).toBe('inclusion');
    });

    it('does not match when guest type does not match', () => {
      const condition = createUserCondition({
        includeGuestsOrExternalUsers: {
          guestOrExternalUserTypes: 'serviceProvider',
        },
      });
      const result = matcher.evaluate(GUEST_USER_CONTEXT, condition);

      expect(result.matches).toBe(false);
    });

    it('does not match member users against guest inclusion', () => {
      const condition = createUserCondition({
        includeGuestsOrExternalUsers: {
          guestOrExternalUserTypes: 'b2bCollaborationGuest',
        },
      });
      const result = matcher.evaluate(STANDARD_USER_CONTEXT, condition);

      expect(result.matches).toBe(false);
    });

    it('matches when external tenant is in enumerated list', () => {
      const condition = createUserCondition({
        includeGuestsOrExternalUsers: {
          guestOrExternalUserTypes: 'b2bCollaborationGuest',
          externalTenants: {
            membershipKind: 'enumerated',
            members: ['external-tenant-001', 'external-tenant-002'],
          },
        },
      });
      const result = matcher.evaluate(GUEST_USER_CONTEXT, condition);

      expect(result.matches).toBe(true);
    });

    it('does not match when external tenant is not in enumerated list', () => {
      const condition = createUserCondition({
        includeGuestsOrExternalUsers: {
          guestOrExternalUserTypes: 'b2bCollaborationGuest',
          externalTenants: {
            membershipKind: 'enumerated',
            members: ['some-other-tenant'],
          },
        },
      });
      const result = matcher.evaluate(GUEST_USER_CONTEXT, condition);

      expect(result.matches).toBe(false);
    });

    it('matches all external tenants when membershipKind is "all"', () => {
      const condition = createUserCondition({
        includeGuestsOrExternalUsers: {
          guestOrExternalUserTypes: 'b2bCollaborationGuest',
          externalTenants: {
            membershipKind: 'all',
          },
        },
      });
      const result = matcher.evaluate(GUEST_USER_CONTEXT, condition);

      expect(result.matches).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // Golden Rule #1: Exclusion ALWAYS wins
  // ──────────────────────────────────────────────
  describe('exclusion overrides inclusion', () => {
    it('excludes user by user ID even when "All" is included', () => {
      const condition = createUserCondition({
        includeUsers: ['All'],
        excludeUsers: ['user-001'],
      });
      const result = matcher.evaluate(STANDARD_USER_CONTEXT, condition);

      expect(result.matches).toBe(false);
      expect(result.phase).toBe('exclusion');
    });

    it('excludes user by group even when directly included by ID', () => {
      const ctx = createTestContext({
        user: {
          id: 'user-002',
          displayName: 'Excluded User',
          userType: 'member',
          memberOfGroupIds: ['group-excluded'],
          directoryRoleIds: [],
        },
      });
      const condition = createUserCondition({
        includeUsers: ['user-002'],
        excludeGroups: ['group-excluded'],
      });
      const result = matcher.evaluate(ctx, condition);

      expect(result.matches).toBe(false);
      expect(result.phase).toBe('exclusion');
      expect(result.details?.excludedByGroup).toBe('group-excluded');
    });

    it('excludes user by role even when included by group', () => {
      const condition = createUserCondition({
        includeGroups: ['group-admins'],
        excludeRoles: ['62e90394-69f5-4237-9190-012177145e10'],
      });
      const result = matcher.evaluate(GLOBAL_ADMIN_CONTEXT, condition);

      expect(result.matches).toBe(false);
      expect(result.phase).toBe('exclusion');
      expect(result.details?.excludedByRole).toBe('62e90394-69f5-4237-9190-012177145e10');
    });

    it('excludes guest user via excludeGuestsOrExternalUsers even when "All" included', () => {
      const condition = createUserCondition({
        includeUsers: ['All'],
        excludeGuestsOrExternalUsers: {
          guestOrExternalUserTypes: 'b2bCollaborationGuest',
        },
      });
      const result = matcher.evaluate(GUEST_USER_CONTEXT, condition);

      expect(result.matches).toBe(false);
      expect(result.phase).toBe('exclusion');
    });
  });

  // ──────────────────────────────────────────────
  // Golden Rule #3: Empty exclusion = nobody excluded
  // ──────────────────────────────────────────────
  describe('empty exclusion', () => {
    it('does not exclude anyone when all exclude arrays are empty', () => {
      const condition = createUserCondition({
        includeUsers: ['All'],
        excludeUsers: [],
        excludeGroups: [],
        excludeRoles: [],
      });
      const result = matcher.evaluate(STANDARD_USER_CONTEXT, condition);

      expect(result.matches).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // Three levels of exclusion
  // ──────────────────────────────────────────────
  describe('three levels of exclusion (user ID, group, role)', () => {
    it('excludes by user ID', () => {
      const condition = createUserCondition({
        includeUsers: ['All'],
        excludeUsers: ['admin-001'],
      });
      const result = matcher.evaluate(GLOBAL_ADMIN_CONTEXT, condition);

      expect(result.matches).toBe(false);
      expect(result.details?.excludedById).toBe('admin-001');
    });

    it('excludes by group membership', () => {
      const condition = createUserCondition({
        includeUsers: ['All'],
        excludeGroups: ['group-admins'],
      });
      const result = matcher.evaluate(GLOBAL_ADMIN_CONTEXT, condition);

      expect(result.matches).toBe(false);
      expect(result.details?.excludedByGroup).toBe('group-admins');
    });

    it('excludes by directory role', () => {
      const condition = createUserCondition({
        includeUsers: ['All'],
        excludeRoles: ['62e90394-69f5-4237-9190-012177145e10'],
      });
      const result = matcher.evaluate(GLOBAL_ADMIN_CONTEXT, condition);

      expect(result.matches).toBe(false);
      expect(result.details?.excludedByRole).toBe('62e90394-69f5-4237-9190-012177145e10');
    });
  });

  // ──────────────────────────────────────────────
  // Combined scenarios
  // ──────────────────────────────────────────────
  describe('combined scenarios', () => {
    it('includes by group, no exclusions → matches', () => {
      const ctx = createTestContext({
        user: {
          id: 'user-010',
          displayName: 'Finance User',
          userType: 'member',
          memberOfGroupIds: ['group-finance'],
          directoryRoleIds: [],
        },
      });
      const condition = createUserCondition({
        includeGroups: ['group-finance', 'group-hr'],
      });
      const result = matcher.evaluate(ctx, condition);

      expect(result.matches).toBe(true);
    });

    it('includes by role + excludes by different group → matches (no group match for exclusion)', () => {
      const condition = createUserCondition({
        includeRoles: ['62e90394-69f5-4237-9190-012177145e10'],
        excludeGroups: ['group-breakglass'],
      });
      const result = matcher.evaluate(GLOBAL_ADMIN_CONTEXT, condition);

      expect(result.matches).toBe(true);
    });

    it('multiple include criteria — first match wins', () => {
      const condition = createUserCondition({
        includeUsers: ['user-001'],
        includeGroups: ['group-alpha'],
        includeRoles: ['some-role'],
      });
      const result = matcher.evaluate(STANDARD_USER_CONTEXT, condition);

      expect(result.matches).toBe(true);
      expect(result.details?.includedById).toBe('user-001');
    });
  });

  // ──────────────────────────────────────────────
  // "None" in includeUsers — additive channel behavior
  // Microsoft treats users, groups, and roles as independent
  // inclusion channels. "None" suppresses only the direct-user
  // channel; groups and roles still match independently.
  // ──────────────────────────────────────────────
  describe('"None" in includeUsers with additive channels', () => {
    it('includeUsers: ["None"] with includeGroups — user in group still matches (groups are additive)', () => {
      const ctx = createTestContext({
        user: {
          id: 'user-020',
          displayName: 'Group Member',
          userType: 'member',
          memberOfGroupIds: ['group-1'],
          directoryRoleIds: [],
        },
      });
      const condition = createUserCondition({
        includeUsers: ['None'],
        includeGroups: ['group-1'],
      });
      const result = matcher.evaluate(ctx, condition);

      expect(result.matches).toBe(true);
      expect(result.phase).toBe('inclusion');
      expect(result.details?.includedByGroup).toBe('group-1');
    });

    it('includeUsers: ["None"] with includeRoles — user with role still matches (roles are additive)', () => {
      const condition = createUserCondition({
        includeUsers: ['None'],
        includeRoles: ['62e90394-69f5-4237-9190-012177145e10'],
      });
      const result = matcher.evaluate(GLOBAL_ADMIN_CONTEXT, condition);

      expect(result.matches).toBe(true);
      expect(result.phase).toBe('inclusion');
      expect(result.details?.includedByRole).toBe('62e90394-69f5-4237-9190-012177145e10');
    });

    it('includeUsers: ["None"] with includeGroups — user NOT in group → no match', () => {
      const condition = createUserCondition({
        includeUsers: ['None'],
        includeGroups: ['group-1'],
      });
      const result = matcher.evaluate(STANDARD_USER_CONTEXT, condition);

      expect(result.matches).toBe(false);
    });

    it('includeUsers: ["None"] with no groups/roles → no match', () => {
      const condition = createUserCondition({
        includeUsers: ['None'],
      });
      const result = matcher.evaluate(STANDARD_USER_CONTEXT, condition);

      expect(result.matches).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // Trace quality: every result has reason
  // ──────────────────────────────────────────────
  describe('trace quality', () => {
    it('always returns conditionType "users"', () => {
      const condition = createUserCondition({ includeUsers: ['All'] });
      const result = matcher.evaluate(STANDARD_USER_CONTEXT, condition);

      expect(result.conditionType).toBe('users');
    });

    it('always returns a non-empty reason string', () => {
      const condition = createUserCondition({ includeUsers: ['nobody'] });
      const result = matcher.evaluate(STANDARD_USER_CONTEXT, condition);

      expect(result.reason).toBeTruthy();
      expect(typeof result.reason).toBe('string');
    });
  });
});
