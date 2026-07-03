import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Counterfactual {
  feature: string;
  currentValue: number;
  counterfactualValue: number;
  requiredChange: number;
  wouldFlipPredictionTo: number;
  description: string;
}

export interface Visualization {
  chartType: string;
  data: Record<string, unknown>;
  layout?: Record<string, unknown>;
}

export interface Explanation {
  id: string;
  tradeId: string;
  modelType: string;
  prediction: number;
  featureImportance: Record<string, number>;
  rationale: string;
  confidence: number;
  timestamp: string;
  counterfactuals?: Counterfactual[];
  shapValues?: Record<string, number>;
  limeValues?: Record<string, number>;
  visualizations?: Visualization[];
}

export interface StrategyRules {
  strategyId: string;
  strategyName: string;
  rules: Array<{
    ruleId: string;
    type: string;
    indicator?: string;
    condition: string;
    action: string;
    description: string;
    lineNumber?: number;
  }>;
  extractedAt: string;
}

export interface XAIState {
  // Explanations
  explanations: Explanation[];
  currentExplanation: Explanation | null;
  selectedTradeId: string | null;

  // Strategy rules
  strategyRules: Record<string, StrategyRules>;

  // UI state
  isLoading: boolean;
  error: string | null;

  // Actions
  setCurrentExplanation: (explanation: Explanation | null) => void;
  addExplanation: (explanation: Explanation) => void;
  selectTrade: (tradeId: string | null) => void;
  setStrategyRules: (rules: StrategyRules) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearState: () => void;
}

const initialState = {
  explanations: [],
  currentExplanation: null,
  selectedTradeId: null,
  strategyRules: {},
  isLoading: false,
  error: null,
};

export const useXAIStore = create<XAIState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setCurrentExplanation: (explanation) =>
        set({ currentExplanation: explanation }),

      addExplanation: (explanation) =>
        set((state) => ({
          explanations: [explanation, ...state.explanations].slice(0, 100), // Keep last 100
        })),

      selectTrade: (tradeId) =>
        set({
          selectedTradeId: tradeId,
          currentExplanation: tradeId
            ? get().explanations.find(e => e.tradeId === tradeId) || null
            : null,
        }),

      setStrategyRules: (rules) =>
        set((state) => ({
          strategyRules: {
            ...state.strategyRules,
            [rules.strategyId]: rules,
          },
        })),

      setLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error }),

      clearState: () => set(initialState),
    }),
    {
      name: 'xai-storage',
      partialize: (state) => ({
        explanations: state.explanations.slice(0, 20), // Persist only recent 20
        strategyRules: state.strategyRules,
      }),
    }
  )
);
