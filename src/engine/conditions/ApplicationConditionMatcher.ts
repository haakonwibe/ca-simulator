// engine/conditions/ApplicationConditionMatcher.ts

import type { ConditionMatcher } from './ConditionMatcher';
import type { ApplicationCondition } from '../models/Policy';
import type { ConditionMatchResult } from '../models/EvaluationResult';
import type { SimulationContext } from '../models/SimulationContext';
import { isAppInBundle, getBundleDisplayName } from '@/data/appBundles';

/**
 * Maps policy URN strings to SimulationContext userAction values.
 * Keys are lowercase for case-insensitive matching.
 */
const USER_ACTION_URN_MAP: Record<string, string> = {
  'urn:user:registersecurityinformation': 'registerSecurityInformation',
  'urn:user:registerdevice': 'registerOrJoinDevices',
};

/**
 * Evaluates the application condition of a Conditional Access policy.
 *
 * A policy targets applications in one of three mutually exclusive modes:
 * 1. User actions (includeUserActions) — matches against context.application.userAction
 * 2. Authentication context (includeAuthenticationContextClassReferences) — matches against context.application.authenticationContext
 * 3. Application IDs (includeApplications / excludeApplications) — matches against app ID
 *
 * Modes are checked in the order above. Only one mode is active per policy.
 */
export class ApplicationConditionMatcher implements ConditionMatcher<ApplicationCondition> {
  evaluate(context: SimulationContext, condition: ApplicationCondition): ConditionMatchResult {
    // Alternative targeting mode 1: User actions
    if (condition.includeUserActions && condition.includeUserActions.length > 0) {
      return this.evaluateUserActions(context, condition.includeUserActions);
    }

    // Alternative targeting mode 2: Authentication context class references
    if (
      condition.includeAuthenticationContextClassReferences &&
      condition.includeAuthenticationContextClassReferences.length > 0
    ) {
      return this.evaluateAuthContext(context, condition.includeAuthenticationContextClassReferences);
    }

    // Standard application matching
    // Step 1: Check exclusions first (exclusion always wins)
    const exclusionResult = this.checkExclusions(context, condition);
    if (exclusionResult) {
      return exclusionResult;
    }

    // Step 2: Check inclusions
    return this.checkInclusions(context, condition);
  }

  private evaluateUserActions(context: SimulationContext, includeUserActions: string[]): ConditionMatchResult {
    const contextAction = context.application.userAction;

    if (!contextAction) {
      return {
        conditionType: 'applications',
        matches: false,
        reason: 'Policy targets user actions but scenario has no user action set',
        phase: 'inclusion',
      };
    }

    for (const urn of includeUserActions) {
      const mappedAction = USER_ACTION_URN_MAP[urn.toLowerCase()];
      if (mappedAction && mappedAction === contextAction) {
        return {
          conditionType: 'applications',
          matches: true,
          reason: `User action "${contextAction}" matches policy target "${urn}"`,
          phase: 'inclusion',
          details: { matchedUserAction: urn },
        };
      }
    }

    return {
      conditionType: 'applications',
      matches: false,
      reason: `User action "${contextAction}" does not match any policy user action targets`,
      phase: 'inclusion',
      details: { targetedActions: includeUserActions },
    };
  }

  private evaluateAuthContext(
    context: SimulationContext,
    includeAuthContextRefs: string[],
  ): ConditionMatchResult {
    const contextAuthRef = context.application.authenticationContext;

    if (!contextAuthRef) {
      return {
        conditionType: 'applications',
        matches: false,
        reason: 'Policy targets authentication context but scenario has none set',
        phase: 'inclusion',
      };
    }

    if (includeAuthContextRefs.includes(contextAuthRef)) {
      return {
        conditionType: 'applications',
        matches: true,
        reason: `Authentication context "${contextAuthRef}" matches policy target`,
        phase: 'inclusion',
        details: { matchedAuthContext: contextAuthRef },
      };
    }

    return {
      conditionType: 'applications',
      matches: false,
      reason: `Authentication context "${contextAuthRef}" does not match any policy targets`,
      phase: 'inclusion',
      details: { targetedContexts: includeAuthContextRefs },
    };
  }

  private checkExclusions(context: SimulationContext, condition: ApplicationCondition): ConditionMatchResult | null {
    for (const excluded of condition.excludeApplications) {
      if (this.appMatchesTarget(context, excluded)) {
        return {
          conditionType: 'applications',
          matches: false,
          reason: `Application "${context.application.displayName}" is excluded (target: "${excluded}")`,
          phase: 'exclusion',
          details: { excludedByTarget: excluded },
        };
      }
    }

    return null;
  }

  private checkInclusions(context: SimulationContext, condition: ApplicationCondition): ConditionMatchResult {
    // 'None' → matches nothing
    if (condition.includeApplications.includes('None')) {
      return {
        conditionType: 'applications',
        matches: false,
        reason: 'Policy explicitly targets "None" applications',
        phase: 'inclusion',
      };
    }

    // If the simulation targets "All Cloud Apps", it matches any policy's application condition
    // because the sign-in could be to any app, including those targeted by this policy
    if (context.application.appId === 'All') {
      return {
        conditionType: 'applications',
        matches: true,
        reason: 'Simulation targets "All Cloud Apps" — matches any policy application target',
        phase: 'inclusion',
      };
    }

    // Bundle context matching: when the simulation targets a bundle ID,
    // match policies that target 'All', the same bundle, or individual member apps.
    const bundleMatch = this.checkBundleContext(context, condition);
    if (bundleMatch !== null) {
      return bundleMatch;
    }

    // Check each inclusion target
    for (const target of condition.includeApplications) {
      if (this.appMatchesTarget(context, target)) {
        return {
          conditionType: 'applications',
          matches: true,
          reason: this.buildInclusionReason(context, target),
          phase: 'inclusion',
          details: { matchedByTarget: target },
        };
      }
    }

    // Unconfigured: empty includeApplications → matches all apps (Golden Rule #5)
    if (condition.includeApplications.length === 0) {
      return {
        conditionType: 'applications',
        matches: true,
        reason: 'Application condition is unconfigured — matches all applications by default',
        phase: 'unconfigured',
      };
    }

    return {
      conditionType: 'applications',
      matches: false,
      reason: `Application "${context.application.displayName}" (${context.application.appId}) does not match any inclusion target`,
      phase: 'inclusion',
    };
  }

  /**
   * When the simulation context targets a bundle ID (e.g. 'Office365', 'MicrosoftAdminPortals',
   * 'AzureVirtualDesktop'), match policies that target 'All', the same bundle, or individual
   * member apps of that bundle. Returns null if the context is not a bundle.
   */
  private checkBundleContext(context: SimulationContext, condition: ApplicationCondition): ConditionMatchResult | null {
    const bundleName = context.application.appId;
    const bundleLabel = getBundleDisplayName(bundleName);
    if (!bundleLabel) return null;

    for (const target of condition.includeApplications) {
      if (target === 'All' || target === bundleName || isAppInBundle(target, bundleName)) {
        return {
          conditionType: 'applications',
          matches: true,
          reason: `Simulation targets "${bundleLabel}" bundle — matches policy target "${target}"`,
          phase: 'inclusion',
          details: { matchedByTarget: target },
        };
      }
    }

    if (condition.includeApplications.length === 0) {
      return {
        conditionType: 'applications',
        matches: true,
        reason: 'Application condition is unconfigured — matches all applications by default',
        phase: 'unconfigured',
      };
    }

    return {
      conditionType: 'applications',
      matches: false,
      reason: `Simulation targets "${bundleLabel}" but policy targets other applications`,
      phase: 'inclusion',
    };
  }

  /**
   * Checks whether the simulation context's application matches a single target string.
   * Uses isAppInBundle for bundle membership checks (GUID-only, no display name matching).
   */
  private appMatchesTarget(context: SimulationContext, target: string): boolean {
    if (target === 'All') return true;
    if (isAppInBundle(context.application.appId, target)) return true;
    return context.application.appId === target;
  }

  private buildInclusionReason(context: SimulationContext, target: string): string {
    if (target === 'All') {
      return 'Policy targets "All" cloud applications';
    }
    const bundleLabel = getBundleDisplayName(target);
    if (bundleLabel) {
      return `Application "${context.application.displayName}" is in the ${bundleLabel} bundle`;
    }
    return `Application "${context.application.displayName}" is directly included by app ID`;
  }
}
