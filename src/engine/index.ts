// engine/index.ts — public API

export * from './models';
export * from './conditions';
export { PolicyEvaluator } from './PolicyEvaluator';
export { GrantControlResolver } from './GrantControlResolver';
export type { GrantResolutionResult, PolicyBreakdown } from './GrantControlResolver';
export { SessionControlAggregator } from './SessionControlAggregator';
export type { AggregatedSessionControls } from './models/EvaluationResult';
export { CAEngine } from './CAEngine';
