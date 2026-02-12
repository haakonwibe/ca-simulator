// engine/SessionControlAggregator.ts
// Merges session controls from all applicable policies. Most-restrictive-wins.

import type { PolicyEvaluationResult, TraceEntry } from './models/EvaluationResult';

export interface AggregatedSessionControls {
  signInFrequency?: { value: number; type: 'hours' | 'days'; isEnabled: boolean; frequencyInterval: string; source: string };
  persistentBrowser?: { mode: 'always' | 'never'; isEnabled: boolean; source: string };
  cloudAppSecurity?: { isEnabled: boolean; cloudAppSecurityType: string; source: string };
  continuousAccessEvaluation?: { mode: string; source: string };
  applicationEnforcedRestrictions?: { isEnabled: boolean; source: string };
  disableResilienceDefaults?: { value: boolean; source: string };
}

/**
 * Converts a sign-in frequency value to hours for comparison.
 */
function toHours(value: number, type: 'hours' | 'days'): number {
  return type === 'days' ? value * 24 : value;
}

/**
 * Aggregates session controls from all applicable policies.
 * Most-restrictive-wins rules apply for each control type.
 *
 * Session controls don't affect allow/block — they modify the session
 * after access is granted.
 */
export class SessionControlAggregator {
  aggregate(applicablePolicies: PolicyEvaluationResult[]): {
    sessionControls: AggregatedSessionControls;
    trace: TraceEntry[];
  } {
    const result: AggregatedSessionControls = {};
    const trace: TraceEntry[] = [];
    let currentMinFrequencyHours = Infinity;

    for (const policy of applicablePolicies) {
      const sc = policy.sessionControls;
      if (!sc) continue;

      // Sign-in frequency: shortest interval wins
      if (sc.signInFrequency) {
        const freq = sc.signInFrequency as { value: number; type: 'hours' | 'days' };
        const hours = toHours(freq.value, freq.type);

        if (hours < currentMinFrequencyHours) {
          currentMinFrequencyHours = hours;
          result.signInFrequency = {
            value: freq.value,
            type: freq.type,
            isEnabled: true,
            frequencyInterval: 'timeBased',
            source: policy.policyId,
          };
          trace.push(this.trace(
            `Sign-in frequency set to ${freq.value} ${freq.type} (${hours}h) from policy "${policy.policyName}"`,
            policy.policyId,
          ));
        }
      }

      // Persistent browser: 'never' wins over 'always'
      if (sc.persistentBrowser !== undefined) {
        const mode = sc.persistentBrowser as 'always' | 'never';
        if (!result.persistentBrowser || mode === 'never') {
          result.persistentBrowser = {
            mode,
            isEnabled: true,
            source: policy.policyId,
          };
          trace.push(this.trace(
            `Persistent browser set to "${mode}" from policy "${policy.policyName}"`,
            policy.policyId,
          ));
        }
      }

      // Cloud app security: if any policy enables it, it's enabled
      if (sc.cloudAppSecurity !== undefined) {
        const securityType = sc.cloudAppSecurity as string;
        if (!result.cloudAppSecurity) {
          result.cloudAppSecurity = {
            isEnabled: true,
            cloudAppSecurityType: securityType,
            source: policy.policyId,
          };
          trace.push(this.trace(
            `Cloud app security enabled (${securityType}) from policy "${policy.policyName}"`,
            policy.policyId,
          ));
        }
      }

      // Continuous access evaluation: most-restrictive-wins
      if (sc.continuousAccessEvaluation !== undefined) {
        const mode = sc.continuousAccessEvaluation as string;
        const CAE_RESTRICTIVENESS: Record<string, number> = {
          strictEnforcement: 2,
          strictLocation: 1,
          disabled: 0,
        };
        const currentLevel = CAE_RESTRICTIVENESS[result.continuousAccessEvaluation?.mode ?? ''] ?? -1;
        const newLevel = CAE_RESTRICTIVENESS[mode] ?? 0;
        if (!result.continuousAccessEvaluation || newLevel > currentLevel) {
          result.continuousAccessEvaluation = {
            mode,
            source: policy.policyId,
          };
        }
      }

      // Application enforced restrictions: any policy enables → enabled
      if (sc.applicationEnforcedRestrictions === true) {
        if (!result.applicationEnforcedRestrictions) {
          result.applicationEnforcedRestrictions = {
            isEnabled: true,
            source: policy.policyId,
          };
        }
      }

      // Disable resilience defaults: any true → true
      if (sc.disableResilienceDefaults === true) {
        if (!result.disableResilienceDefaults) {
          result.disableResilienceDefaults = {
            value: true,
            source: policy.policyId,
          };
        }
      }
    }

    return { sessionControls: result, trace };
  }

  private trace(message: string, policyId?: string): TraceEntry {
    return {
      timestamp: Date.now(),
      phase: 'sessionAggregation',
      policyId,
      message,
    };
  }
}
