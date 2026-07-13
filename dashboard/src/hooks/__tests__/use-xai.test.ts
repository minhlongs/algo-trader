import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useXAI } from '../use-xai';

// Mock useXAIStore — hook calls it without selector and destructures result directly
const mockSetCurrentExplanation = vi.fn();
const mockAddExplanation = vi.fn();
const mockSelectTrade = vi.fn();
const mockSetStrategyRules = vi.fn();
const mockSetLoading = vi.fn();
const mockSetError = vi.fn();

const createMockStore = () => ({
  explanations: [] as unknown[],
  currentExplanation: null,
  selectedTradeId: null,
  strategyRules: null,
  isLoading: false,
  error: null,
  setCurrentExplanation: mockSetCurrentExplanation,
  addExplanation: mockAddExplanation,
  selectTrade: mockSelectTrade,
  setStrategyRules: mockSetStrategyRules,
  setLoading: mockSetLoading,
  setError: mockSetError,
});

vi.mock('../../stores/xai-store', () => ({
  useXAIStore: (_selector?: (s: Record<string, unknown>) => unknown) => createMockStore(),
}));

// Mock xai-client with named exports
const mockExplainPrediction = vi.fn();
const mockGetExplanation = vi.fn();
const mockGetFeatureImportance = vi.fn();
const mockGenerateCounterfactuals = vi.fn();
const mockExtractStrategyRules = vi.fn();

vi.mock('../../services/xai-client', () => ({
  xaiClient: {
    explainPrediction: (...args: unknown[]) => mockExplainPrediction(...args),
    getExplanation: (...args: unknown[]) => mockGetExplanation(...args),
    getFeatureImportance: (...args: unknown[]) => mockGetFeatureImportance(...args),
    generateCounterfactuals: (...args: unknown[]) => mockGenerateCounterfactuals(...args),
    extractStrategyRules: (...args: unknown[]) => mockExtractStrategyRules(...args),
  },
  ExplainPredictionRequest: {},
  StrategyRulesRequest: {},
}));

describe('useXAI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExplainPrediction.mockReset();
    mockGetExplanation.mockReset();
    mockGetFeatureImportance.mockReset();
    mockGenerateCounterfactuals.mockReset();
    mockExtractStrategyRules.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns initial state and all action functions', () => {
    const { result } = renderHook(() => useXAI());
    expect(result.current.explanations).toEqual([]);
    expect(result.current.currentExplanation).toBeNull();
    expect(result.current.selectedTradeId).toBeNull();
    expect(result.current.strategyRules).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.explainPrediction).toBe('function');
    expect(typeof result.current.fetchExplanation).toBe('function');
    expect(typeof result.current.fetchFeatureImportance).toBe('function');
    expect(typeof result.current.generateCounterfactuals).toBe('function');
    expect(typeof result.current.extractStrategyRules).toBe('function');
    expect(typeof result.current.selectTrade).toBe('function');
    expect(typeof result.current.clearError).toBe('function');
  });

  it('explainPrediction — success sets loading and updates store', async () => {
    mockExplainPrediction.mockResolvedValue({
      explanation: {
        trade_id: 'trade-1',
        model_type: 'xgboost',
        prediction: 1,
        feature_importance: { feature_a: 0.8 },
        rationale: 'Strong signal',
        confidence: 0.9,
        generated_at: '2024-01-01T00:00:00Z',
        counterfactuals: [],
        shap_values: {},
        lime_values: {},
        visualizations: {},
      },
    });

    const { result } = renderHook(() => useXAI());

    await act(async () => {
      await result.current.explainPrediction({
        trade_id: 'trade-1',
        model_type: 'xgboost',
        features: {},
      });
    });

    expect(mockSetLoading).toHaveBeenCalledWith(true);
    expect(mockSetLoading).toHaveBeenCalledWith(false);
    expect(mockAddExplanation).toHaveBeenCalled();
    expect(mockSetCurrentExplanation).toHaveBeenCalled();
  });

  it('explainPrediction — error sets error and resets loading', async () => {
    mockExplainPrediction.mockRejectedValue(new Error('API down'));

    const { result } = renderHook(() => useXAI());

    await act(async () => {
      try {
        await result.current.explainPrediction({
          trade_id: 'trade-1',
          model_type: 'xgboost',
          features: {},
        });
      } catch {
        // expected
      }
    });

    expect(mockSetError).toHaveBeenCalledWith('API down');
    expect(mockSetLoading).toHaveBeenCalledWith(false);
  });

  it('fetchExplanation — success sets current explanation and selects trade', async () => {
    mockGetExplanation.mockResolvedValue({
      explanation: {
        trade_id: 'trade-2',
        model_type: 'rf',
        prediction: 0,
        feature_importance: {},
        rationale: 'Neutral',
        confidence: 0.5,
        generated_at: '2024-01-02T00:00:00Z',
        counterfactuals: [],
        shap_values: {},
        lime_values: {},
        visualizations: {},
      },
    });

    const { result } = renderHook(() => useXAI());

    await act(async () => {
      await result.current.fetchExplanation('trade-2');
    });

    expect(mockSetCurrentExplanation).toHaveBeenCalled();
    expect(mockSelectTrade).toHaveBeenCalledWith('trade-2');
  });

  it('fetchExplanation — error sets error', async () => {
    mockGetExplanation.mockRejectedValue(new Error('Not found'));

    const { result } = renderHook(() => useXAI());

    await act(async () => {
      try {
        await result.current.fetchExplanation('trade-999');
      } catch {
        // expected
      }
    });

    expect(mockSetError).toHaveBeenCalledWith('Not found');
  });

  it('fetchFeatureImportance delegates to xaiClient', async () => {
    mockGetFeatureImportance.mockResolvedValue({ features: [{ name: 'x', importance: 0.5 }] });

    const { result } = renderHook(() => useXAI());

    let data: unknown;
    await act(async () => {
      data = await result.current.fetchFeatureImportance('xgboost', 10);
    });

    expect(mockGetFeatureImportance).toHaveBeenCalledWith('xgboost', 10);
    expect(data).toEqual({ features: [{ name: 'x', importance: 0.5 }] });
  });

  it('clearError resets the error state', () => {
    const { result } = renderHook(() => useXAI());

    act(() => {
      result.current.clearError();
    });

    expect(mockSetError).toHaveBeenCalledWith(null);
  });
});
