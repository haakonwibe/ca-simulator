// stores/useEvaluationStore.ts — Zustand store for CA evaluation results.

import { create } from 'zustand';
import { CAEngine } from '../engine/CAEngine';
import type { ConditionalAccessPolicy } from '../engine/models/Policy';
import type { SimulationContext } from '../engine/models/SimulationContext';
import type { CAEngineResult } from '../engine/models/EvaluationResult';
import { usePolicyStore } from './usePolicyStore';
import { trackEvent, type EventTrigger } from '../lib/analytics';

interface EvaluationState {
  result: CAEngineResult | null;
  /** Context of the last evaluation — lets the sandbox compute a live-vs-sandbox comparison */
  lastContext: SimulationContext | null;
  selectedPolicyId: string | null;
  activeView: 'grid' | 'matrix' | 'sankey' | 'gaps' | 'impact' | 'baseline';

  // Actions
  /**
   * `trigger` is required so every call site declares whether the user asked
   * for this or state changed underneath them — three of the four callers are
   * automatic (each data-source load), and a flat count would conflate them.
   */
  evaluate: (
    policies: ConditionalAccessPolicy[],
    context: SimulationContext,
    trigger: EventTrigger,
  ) => void;
  setSelectedPolicyId: (id: string | null) => void;
  setActiveView: (view: 'grid' | 'matrix' | 'sankey' | 'gaps' | 'impact' | 'baseline') => void;
  clear: () => void;
}

const engine = new CAEngine();

export const useEvaluationStore = create<EvaluationState>((set) => ({
  result: null,
  lastContext: null,
  selectedPolicyId: null,
  activeView: 'grid',

  // Synchronous — the engine is fast enough that no loading state is needed
  evaluate: (policies, context, trigger) => {
    // One-way read of the policy store (it never imports this one, so no cycle).
    // The scenario and the verdict are deliberately NOT sent — only that a
    // simulation ran, in which mode, and who asked for it.
    const { dataSource } = usePolicyStore.getState();
    if (dataSource !== 'none') trackEvent({ name: 'evaluated', props: { mode: dataSource, trigger } });

    set({ result: engine.evaluate(policies, context), lastContext: context });
  },

  setSelectedPolicyId: (id) => {
    set({ selectedPolicyId: id });
  },

  setActiveView: (view) => {
    set({ activeView: view });
  },

  clear: () => {
    set({ result: null, lastContext: null, selectedPolicyId: null });
  },
}));
