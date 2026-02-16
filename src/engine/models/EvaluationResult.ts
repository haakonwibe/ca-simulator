// engine/models/EvaluationResult.ts

import type { PolicyState } from './Policy';

/** Shape produced by PolicyEvaluator.extractSessionControls() — typed boundary between extraction and aggregation. */
export interface ExtractedSessionControls {
  signInFrequency?: { value: number; type: 'hours' | 'days' };
  persistentBrowser?: 'always' | 'never';
  cloudAppSecurity?: string;
  continuousAccessEvaluation?: string;
  applicationEnforcedRestrictions?: boolean;
  disableResilienceDefaults?: boolean;
  secureSignInSession?: boolean;
}

/** Output of SessionControlAggregator — most-restrictive-wins merging with source tracking. */
export interface AggregatedSessionControls {
  signInFrequency?: { value: number; type: 'hours' | 'days'; isEnabled: boolean; frequencyInterval: string; source: string };
  persistentBrowser?: { mode: 'always' | 'never'; isEnabled: boolean; source: string };
  cloudAppSecurity?: { isEnabled: boolean; cloudAppSecurityType: string; source: string };
  continuousAccessEvaluation?: { mode: string; source: string };
  applicationEnforcedRestrictions?: { isEnabled: boolean; source: string };
  disableResilienceDefaults?: { value: boolean; source: string };
  secureSignInSession?: { isEnabled: boolean; source: string };
}

export interface ConditionMatchResult {
  conditionType: string;
  matches: boolean;
  reason: string;
  /** Which phase decided: inclusion matched, exclusion overrode, or unconfigured (default match) */
  phase: 'inclusion' | 'exclusion' | 'notConfigured';
  details?: Record<string, unknown>;
}

export interface PolicyEvaluationResult {
  policyId: string;
  policyName: string;
  state: PolicyState;
  applies: boolean;
  conditionResults: ConditionMatchResult[];
  grantControls?: {
    operator: 'AND' | 'OR';
    controls: string[];
    satisfied: boolean;
    satisfiedControls: string[];
    unsatisfiedControls: string[];
    authenticationStrength?: {
      displayName: string;
      policyStrengthId: string;
      satisfied: boolean;
    };
  };
  sessionControls?: ExtractedSessionControls;
}

export interface CAEngineResult {
  finalDecision: 'allow' | 'block' | 'controlsRequired';
  requiredControls: string[];
  satisfiedControls: string[];
  appliedPolicies: PolicyEvaluationResult[];
  skippedPolicies: PolicyEvaluationResult[];
  reportOnlyPolicies: PolicyEvaluationResult[];
  sessionControls: AggregatedSessionControls;
  trace: TraceEntry[];
}

export interface TraceEntry {
  timestamp: number;
  phase: 'signalCollection' | 'policyMatching' | 'grantResolution' | 'sessionAggregation';
  policyId?: string;
  message: string;
  details?: Record<string, unknown>;
}
