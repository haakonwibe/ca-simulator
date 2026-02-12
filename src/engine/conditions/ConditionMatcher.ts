// engine/conditions/ConditionMatcher.ts

import type { ConditionMatchResult } from '../models/EvaluationResult';
import type { SimulationContext } from '../models/SimulationContext';

export interface ConditionMatcher<TCondition> {
  evaluate(context: SimulationContext, condition: TCondition): ConditionMatchResult;
}
