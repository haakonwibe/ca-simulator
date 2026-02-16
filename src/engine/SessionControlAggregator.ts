// engine/SessionControlAggregator.ts
// Merges session controls from all applicable policies. Most-restrictive-wins.

import type { PolicyEvaluationResult, TraceEntry, AggregatedSessionControls } from './models/EvaluationResult';

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
        const freq = sc.signInFrequency;
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
        const mode = sc.persistentBrowser;
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

      // Cloud app security: most-restrictive-wins
      if (sc.cloudAppSecurity !== undefined) {
        const securityType = sc.cloudAppSecurity;
        const CAS_RESTRICTIVENESS: Record<string, number> = {
          mcasConfigured: 0,
          monitorOnly: 1,
          blockDownloads: 2,
        };
        const currentLevel = CAS_RESTRICTIVENESS[result.cloudAppSecurity?.cloudAppSecurityType ?? ''] ?? -1;
        const newLevel = CAS_RESTRICTIVENESS[securityType] ?? 0;
        if (!result.cloudAppSecurity || newLevel > currentLevel) {
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
        const mode = sc.continuousAccessEvaluation;
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

      // Token protection (secureSignInSession): any policy enables → enabled
      if (sc.secureSignInSession && !result.secureSignInSession) {
        result.secureSignInSession = {
          isEnabled: true,
          source: policy.policyId,
        };
        trace.push(this.trace(
          `Token protection (secure sign-in session) enabled from policy "${policy.policyName}"`,
          policy.policyId,
        ));
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
