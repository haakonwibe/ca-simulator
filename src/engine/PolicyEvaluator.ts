// engine/PolicyEvaluator.ts
// Evaluates a single ConditionalAccessPolicy against a SimulationContext.

import type { ConditionalAccessPolicy, GrantControls, SessionControls } from './models/Policy';
import type { SimulationContext } from './models/SimulationContext';
import type { PolicyEvaluationResult, ConditionMatchResult, ExtractedSessionControls } from './models/EvaluationResult';
import { UserConditionMatcher } from './conditions/UserConditionMatcher';
import { ApplicationConditionMatcher } from './conditions/ApplicationConditionMatcher';
import { DevicePlatformMatcher } from './conditions/DevicePlatformMatcher';
import { LocationConditionMatcher } from './conditions/LocationConditionMatcher';
import { ClientAppMatcher } from './conditions/ClientAppMatcher';
import { RiskLevelMatcher } from './conditions/RiskLevelMatcher';
import { DeviceFilterMatcher } from './conditions/DeviceFilterMatcher';
import { AuthenticationFlowMatcher } from './conditions/AuthenticationFlowMatcher';
import { InsiderRiskMatcher } from './conditions/InsiderRiskMatcher';
import { isAuthStrengthSatisfied } from './authenticationStrength';

/**
 * Evaluates a single Conditional Access policy against a simulation context.
 *
 * Orchestrates all condition matchers (AND logic — all must match) and evaluates
 * grant control satisfaction. Short-circuits on the first non-matching condition.
 *
 * Does NOT filter by policy state beyond skipping 'disabled'. Both 'enabled' and
 * 'enabledForReportingButNotEnforced' go through the full evaluation pipeline.
 * The CAEngine handles enforced vs report-only distinction at the aggregation level.
 */
export class PolicyEvaluator {
  private readonly userMatcher = new UserConditionMatcher();
  private readonly applicationMatcher = new ApplicationConditionMatcher();
  private readonly platformMatcher = new DevicePlatformMatcher();
  private readonly locationMatcher = new LocationConditionMatcher();
  private readonly clientAppMatcher = new ClientAppMatcher();
  private readonly riskMatcher = new RiskLevelMatcher();
  private readonly deviceFilterMatcher = new DeviceFilterMatcher();
  private readonly authenticationFlowMatcher = new AuthenticationFlowMatcher();
  private readonly insiderRiskMatcher = new InsiderRiskMatcher();

  evaluate(policy: ConditionalAccessPolicy, context: SimulationContext): PolicyEvaluationResult {
    // Skip disabled policies early (Hard-Won Lesson #3)
    if (policy.state === 'disabled') {
      return {
        policyId: policy.id,
        policyName: policy.displayName,
        state: policy.state,
        applies: false,
        conditionResults: [],
      };
    }

    // Evaluate all conditions (AND logic, short-circuit on first failure)
    const conditionResults: ConditionMatchResult[] = [];
    const conditions = policy.conditions;

    // 1. Users (always present)
    const userResult = this.safeEvaluate('users', () => this.userMatcher.evaluate(context, conditions.users));
    conditionResults.push(userResult);
    if (!userResult.matches) {
      return this.buildResult(policy, false, conditionResults);
    }

    // 2. Applications (always present)
    const appResult = this.safeEvaluate('applications', () => this.applicationMatcher.evaluate(context, conditions.applications));
    conditionResults.push(appResult);
    if (!appResult.matches) {
      return this.buildResult(policy, false, conditionResults);
    }

    // 3. Platforms (optional — unconfigured = matches all, Golden Rule #5)
    if (conditions.platforms) {
      const platformResult = this.safeEvaluate('platforms', () => this.platformMatcher.evaluate(context, conditions.platforms!));
      conditionResults.push(platformResult);
      if (!platformResult.matches) {
        return this.buildResult(policy, false, conditionResults);
      }
    }

    // 4. Locations (optional — unconfigured = matches all)
    if (conditions.locations) {
      const locationResult = this.safeEvaluate('locations', () => this.locationMatcher.evaluate(context, conditions.locations!));
      conditionResults.push(locationResult);
      if (!locationResult.matches) {
        return this.buildResult(policy, false, conditionResults);
      }
    }

    // 5. Client app types (always present — empty array = matches all, Hard-Won Lesson #7)
    const clientAppResult = this.safeEvaluate('clientAppTypes', () => this.clientAppMatcher.evaluate(context, conditions.clientAppTypes));
    conditionResults.push(clientAppResult);
    if (!clientAppResult.matches) {
      return this.buildResult(policy, false, conditionResults);
    }

    // 6. Risk levels (empty = unconfigured = matches all)
    const riskResult = this.safeEvaluate('risk', () => this.riskMatcher.evaluate(context, {
      signInRiskLevels: conditions.signInRiskLevels,
      userRiskLevels: conditions.userRiskLevels,
    }));
    conditionResults.push(riskResult);
    if (!riskResult.matches) {
      return this.buildResult(policy, false, conditionResults);
    }

    // 7. Device filter (optional — unconfigured = matches all)
    if (conditions.devices) {
      const deviceResult = this.safeEvaluate('devices', () => this.deviceFilterMatcher.evaluate(context, conditions.devices!));
      conditionResults.push(deviceResult);
      if (!deviceResult.matches) {
        return this.buildResult(policy, false, conditionResults);
      }
    }

    // 8. Authentication flows (optional — unconfigured = matches all)
    if (conditions.authenticationFlows) {
      const authFlowResult = this.safeEvaluate('authenticationFlows', () => this.authenticationFlowMatcher.evaluate(context, conditions.authenticationFlows!));
      conditionResults.push(authFlowResult);
      if (!authFlowResult.matches) {
        return this.buildResult(policy, false, conditionResults);
      }
    }

    // 9. Insider risk levels (optional — unconfigured = matches all)
    if (conditions.insiderRiskLevels?.length) {
      const insiderRiskResult = this.safeEvaluate('insiderRisk', () => this.insiderRiskMatcher.evaluate(context, conditions.insiderRiskLevels!));
      conditionResults.push(insiderRiskResult);
      if (!insiderRiskResult.matches) {
        return this.buildResult(policy, false, conditionResults);
      }
    }

    // All conditions matched — evaluate grant controls and session controls
    const result = this.buildResult(policy, true, conditionResults);

    if (policy.grantControls) {
      result.grantControls = this.evaluateGrantControls(policy.grantControls, context);
    }

    if (policy.sessionControls) {
      result.sessionControls = this.extractSessionControls(policy.sessionControls);
    }

    return result;
  }

  /**
   * Wraps a matcher call in try/catch so a single broken matcher can never crash the pipeline.
   * On error, treats the condition as not configured (default match) and logs the error.
   */
  private safeEvaluate(conditionType: string, fn: () => ConditionMatchResult): ConditionMatchResult {
    try {
      return fn();
    } catch (err) {
      console.error(`[PolicyEvaluator] ${conditionType} matcher threw:`, err);
      return {
        conditionType,
        matches: true,
        reason: `${conditionType} matcher error — treating as not configured`,
        phase: 'notConfigured',
        details: { error: String(err) },
      };
    }
  }

  private buildResult(
    policy: ConditionalAccessPolicy,
    applies: boolean,
    conditionResults: ConditionMatchResult[],
  ): PolicyEvaluationResult {
    return {
      policyId: policy.id,
      policyName: policy.displayName,
      state: policy.state,
      applies,
      conditionResults,
    };
  }

  private evaluateGrantControls(
    grantControls: GrantControls,
    context: SimulationContext,
  ): PolicyEvaluationResult['grantControls'] {
    const controls = grantControls.builtInControls.map(String);
    const satisfied = context.satisfiedControls.map(String);

    const satisfiedControls = controls.filter((c) => satisfied.includes(c));
    const unsatisfiedControls = controls.filter((c) => !satisfied.includes(c));

    // Authentication strength evaluation
    let authStrengthResult: { displayName: string; policyStrengthId: string; satisfied: boolean } | undefined;
    if (grantControls.authenticationStrength) {
      const userLevel = context.authenticationStrengthLevel ?? 0;
      const authSatisfied = isAuthStrengthSatisfied(userLevel, grantControls.authenticationStrength.id, context.customAuthStrengthMap);
      authStrengthResult = {
        displayName: grantControls.authenticationStrength.displayName ?? grantControls.authenticationStrength.id,
        policyStrengthId: grantControls.authenticationStrength.id,
        satisfied: authSatisfied,
      };
    }

    let isSatisfied: boolean;
    if (grantControls.operator === 'AND') {
      // All controls must be satisfied, plus authenticationStrength if present
      isSatisfied = unsatisfiedControls.length === 0 && (authStrengthResult?.satisfied ?? true);
    } else {
      // At least one control OR authStrength must be satisfied
      if (controls.length === 0 && authStrengthResult) {
        isSatisfied = authStrengthResult.satisfied;
      } else if (controls.length === 0 && !authStrengthResult) {
        isSatisfied = true;
      } else {
        isSatisfied = satisfiedControls.length > 0 || (authStrengthResult?.satisfied ?? false);
      }
    }

    return {
      operator: grantControls.operator,
      controls,
      satisfied: isSatisfied,
      satisfiedControls,
      unsatisfiedControls,
      authenticationStrength: authStrengthResult,
    };
  }

  private extractSessionControls(sessionControls: SessionControls): ExtractedSessionControls {
    const result: ExtractedSessionControls = {};

    if (sessionControls.applicationEnforcedRestrictions?.isEnabled) {
      result.applicationEnforcedRestrictions = true;
    }
    if (sessionControls.cloudAppSecurity?.isEnabled) {
      result.cloudAppSecurity = sessionControls.cloudAppSecurity.cloudAppSecurityType;
    }
    if (sessionControls.signInFrequency?.isEnabled) {
      result.signInFrequency = {
        value: sessionControls.signInFrequency.value,
        type: sessionControls.signInFrequency.type,
      };
    }
    if (sessionControls.persistentBrowser?.isEnabled) {
      result.persistentBrowser = sessionControls.persistentBrowser.mode;
    }
    if (sessionControls.continuousAccessEvaluation) {
      result.continuousAccessEvaluation = sessionControls.continuousAccessEvaluation.mode;
    }
    if (sessionControls.disableResilienceDefaults !== undefined) {
      result.disableResilienceDefaults = sessionControls.disableResilienceDefaults;
    }
    if (sessionControls.secureSignInSession?.isEnabled) {
      result.secureSignInSession = true;
    }

    return result;
  }
}
