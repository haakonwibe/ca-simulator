// stores/useEvaluationStore.ts — Zustand store for CA evaluation results.

import { create } from 'zustand';
import { CAEngine } from '../engine/CAEngine';
import type { ConditionalAccessPolicy } from '../engine/models/Policy';
import type { SimulationContext } from '../engine/models/SimulationContext';
import type { CAEngineResult } from '../engine/models/EvaluationResult';

interface EvaluationState {
  result: CAEngineResult | null;
  isEvaluating: boolean;
  selectedPolicyId: string | null;
  activeView: 'grid' | 'matrix' | 'sankey' | 'gaps';

  // Actions
  evaluate: (policies: ConditionalAccessPolicy[], context: SimulationContext) => void;
  setSelectedPolicyId: (id: string | null) => void;
  setActiveView: (view: 'grid' | 'matrix' | 'sankey' | 'gaps') => void;
  clear: () => void;
}

const engine = new CAEngine();

export const useEvaluationStore = create<EvaluationState>((set) => ({
  result: null,
  isEvaluating: false,
  selectedPolicyId: null,
  activeView: 'grid',

  evaluate: (policies, context) => {
    set({ isEvaluating: true });
    const result = engine.evaluate(policies, context);
    set({ result, isEvaluating: false });
  },

  setSelectedPolicyId: (id) => {
    set({ selectedPolicyId: id });
  },

  setActiveView: (view) => {
    set({ activeView: view });
  },

  clear: () => {
    set({ result: null, selectedPolicyId: null });
  },
}));
