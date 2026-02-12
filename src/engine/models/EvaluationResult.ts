// engine/models/EvaluationResult.ts

import type { PolicyState } from './Policy';

export interface ConditionMatchResult {
  conditionType: string;
  matches: boolean;
  reason: string;
  /** Which phase decided: inclusion matched, exclusion overrode, or unconfigured (default match) */
  phase: 'inclusion' | 'exclusion' | 'unconfigured' | 'notConfigured';
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
    authenticationStrength?: string;
  };
  sessionControls?: Record<string, unknown>;
}

export interface CAEngineResult {
  finalDecision: 'allow' | 'block' | 'controlsRequired';
  requiredControls: string[];
  satisfiedControls: string[];
  appliedPolicies: PolicyEvaluationResult[];
  skippedPolicies: PolicyEvaluationResult[];
  reportOnlyPolicies: PolicyEvaluationResult[];
  sessionControls: Record<string, unknown>;
  trace: TraceEntry[];
}

export interface TraceEntry {
  timestamp: number;
  phase: 'signalCollection' | 'policyMatching' | 'grantResolution' | 'sessionAggregation';
  policyId?: string;
  message: string;
  details?: Record<string, unknown>;
}
