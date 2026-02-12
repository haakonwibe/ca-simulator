// engine/conditions/UserConditionMatcher.ts

import type { ConditionMatcher } from './ConditionMatcher';
import type { UserCondition } from '../models/Policy';
import type { ConditionMatchResult } from '../models/EvaluationResult';
import type { SimulationContext } from '../models/SimulationContext';

/**
 * Evaluates the user condition of a Conditional Access policy.
 *
 * Implements the Five Golden Rules:
 * 1. Exclusion ALWAYS wins over inclusion
 * 2. Empty inclusion = not configured = matches everyone
 * 3. Empty exclusion = nobody excluded
 * 4. ALL conditions must match (handled by PolicyEvaluator)
 * 5. Unconfigured conditions match by default
 *
 * Handles three levels of exclusion:
 * - User ID level
 * - Group membership level
 * - Directory role level
 *
 * Critical: Uses roleTemplateId (not role instance id) for role matching.
 */
export class UserConditionMatcher implements ConditionMatcher<UserCondition> {
  evaluate(context: SimulationContext, condition: UserCondition): ConditionMatchResult {
    const user = context.user;

    // Step 1: Check exclusions first (exclusion always wins)
    const exclusionResult = this.checkExclusions(context, condition);
    if (exclusionResult) {
      return exclusionResult;
    }

    // Step 2: Check inclusions
    const inclusionResult = this.checkInclusions(context, condition);
    return inclusionResult;
  }

  private checkExclusions(context: SimulationContext, condition: UserCondition): ConditionMatchResult | null {
    const user = context.user;

    // Exclude by user ID
    if (condition.excludeUsers.includes(user.id)) {
      return {
        conditionType: 'users',
        matches: false,
        reason: `User "${user.displayName}" is directly excluded by user ID`,
        phase: 'exclusion',
        details: { excludedById: user.id },
      };
    }

    // Exclude by group membership
    for (const excludedGroupId of condition.excludeGroups) {
      if (user.memberOfGroupIds.includes(excludedGroupId)) {
        return {
          conditionType: 'users',
          matches: false,
          reason: `User "${user.displayName}" is excluded via group membership (group: ${excludedGroupId})`,
          phase: 'exclusion',
          details: { excludedByGroup: excludedGroupId },
        };
      }
    }

    // Exclude by directory role (using roleTemplateId)
    for (const excludedRoleId of condition.excludeRoles) {
      if (user.directoryRoleIds.includes(excludedRoleId)) {
        return {
          conditionType: 'users',
          matches: false,
          reason: `User "${user.displayName}" is excluded via directory role (roleTemplateId: ${excludedRoleId})`,
          phase: 'exclusion',
          details: { excludedByRole: excludedRoleId },
        };
      }
    }

    // Exclude by guest/external user type
    if (condition.excludeGuestsOrExternalUsers) {
      if (this.matchesGuestOrExternalUser(context, condition.excludeGuestsOrExternalUsers)) {
        return {
          conditionType: 'users',
          matches: false,
          reason: `User "${user.displayName}" is excluded as guest/external user`,
          phase: 'exclusion',
          details: { excludedAsGuestType: condition.excludeGuestsOrExternalUsers.guestOrExternalUserTypes },
        };
      }
    }

    // No exclusion matched
    return null;
  }

  private checkInclusions(context: SimulationContext, condition: UserCondition): ConditionMatchResult {
    const user = context.user;

    // "All" matches everyone — members, guests, external users, service accounts
    if (condition.includeUsers.includes('All')) {
      return {
        conditionType: 'users',
        matches: true,
        reason: 'Policy targets "All" users',
        phase: 'inclusion',
      };
    }

    // Check "GuestsOrExternalUsers" simple flag in includeUsers
    if (condition.includeUsers.includes('GuestsOrExternalUsers')) {
      if (user.userType === 'guest') {
        return {
          conditionType: 'users',
          matches: true,
          reason: `User "${user.displayName}" matches "GuestsOrExternalUsers" inclusion (userType: guest)`,
          phase: 'inclusion',
        };
      }
    }

    // Check granular guest/external user inclusion
    if (condition.includeGuestsOrExternalUsers) {
      if (this.matchesGuestOrExternalUser(context, condition.includeGuestsOrExternalUsers)) {
        return {
          conditionType: 'users',
          matches: true,
          reason: `User "${user.displayName}" matches granular guest/external user inclusion`,
          phase: 'inclusion',
          details: { matchedGuestType: condition.includeGuestsOrExternalUsers.guestOrExternalUserTypes },
        };
      }
    }

    // Check specific user ID
    if (condition.includeUsers.includes(user.id)) {
      return {
        conditionType: 'users',
        matches: true,
        reason: `User "${user.displayName}" is directly included by user ID`,
        phase: 'inclusion',
        details: { includedById: user.id },
      };
    }

    // Check group membership
    for (const includedGroupId of condition.includeGroups) {
      if (user.memberOfGroupIds.includes(includedGroupId)) {
        return {
          conditionType: 'users',
          matches: true,
          reason: `User "${user.displayName}" is included via group membership (group: ${includedGroupId})`,
          phase: 'inclusion',
          details: { includedByGroup: includedGroupId },
        };
      }
    }

    // Check directory role (using roleTemplateId)
    for (const includedRoleId of condition.includeRoles) {
      if (user.directoryRoleIds.includes(includedRoleId)) {
        return {
          conditionType: 'users',
          matches: true,
          reason: `User "${user.displayName}" is included via directory role (roleTemplateId: ${includedRoleId})`,
          phase: 'inclusion',
          details: { includedByRole: includedRoleId },
        };
      }
    }

    // 'None' in includeUsers means "no users targeted by direct ID".
    // Per Microsoft behavior, this only suppresses the direct-user channel.
    // Groups and roles are additive inclusion channels — if the user matched
    // via group or role above, we already returned true before reaching here.
    // Reaching this point with 'None' means no other channel matched either.
    if (condition.includeUsers.includes('None')) {
      return {
        conditionType: 'users',
        matches: false,
        reason: 'Policy targets "None" direct users and no group/role inclusion matched',
        phase: 'inclusion',
      };
    }

    // If no inclusion criteria matched, user does not match
    // Note: truly unconfigured conditions (empty everything) should not reach here
    // because policies always have user conditions configured in practice.
    // But if they do, a fully empty condition is treated as "no one targeted".
    const hasAnyInclusion =
      condition.includeUsers.length > 0 ||
      condition.includeGroups.length > 0 ||
      condition.includeRoles.length > 0 ||
      condition.includeGuestsOrExternalUsers !== undefined;

    if (!hasAnyInclusion) {
      // Truly unconfigured — matches everyone per Golden Rule #2
      return {
        conditionType: 'users',
        matches: true,
        reason: 'User condition is unconfigured — matches all users by default',
        phase: 'unconfigured',
      };
    }

    return {
      conditionType: 'users',
      matches: false,
      reason: `User "${user.displayName}" does not match any inclusion criteria`,
      phase: 'inclusion',
    };
  }

  private matchesGuestOrExternalUser(
    context: SimulationContext,
    guestCondition: { guestOrExternalUserTypes: string; externalTenants?: { membershipKind: string; members?: string[] } },
  ): boolean {
    const user = context.user;

    // User must be a guest to match guest/external user conditions
    if (user.userType !== 'guest') {
      return false;
    }

    // Parse the comma-separated guest types from the condition
    const requiredTypes = guestCondition.guestOrExternalUserTypes
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    // Check if the user's guest types overlap with any required type
    const userGuestTypes = user.guestOrExternalUserTypes ?? [];
    const typeMatches = requiredTypes.some((requiredType) => userGuestTypes.includes(requiredType));

    if (!typeMatches) {
      return false;
    }

    // If external tenant filtering is specified, check it
    if (guestCondition.externalTenants) {
      const tenantCondition = guestCondition.externalTenants;

      if (tenantCondition.membershipKind === 'all') {
        // Matches all external tenants
        return true;
      }

      if (tenantCondition.membershipKind === 'enumerated') {
        // Must be from one of the listed tenants
        if (!user.homeTenantId) {
          return false;
        }
        return tenantCondition.members?.includes(user.homeTenantId) ?? false;
      }
    }

    return true;
  }
}
