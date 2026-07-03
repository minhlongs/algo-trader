import { useCallback } from 'react';
import { useXAIStore } from '../stores/xai-store';
import { xaiClient, ExplainPredictionRequest, StrategyRulesRequest } from '../services/xai-client';
import { StrategyRules } from '../stores/xai-store';

// Transform backend snake_case to frontend camelCase
function transformExplanation(backendExp: any) {
  return {
    id: backendExp.trade_id,
    tradeId: backendExp.trade_id,
    modelType: backendExp.model_type,
    prediction: backendExp.prediction,
    featureImportance: backendExp.feature_importance,
    rationale: backendExp.rationale,
    confidence: backendExp.confidence,
    timestamp: backendExp.generated_at,
    counterfactuals: backendExp.counterfactuals?.map((cf: any) => ({
      feature: cf.feature,
      currentValue: cf.current_value,
      counterfactualValue: cf.counterfactual_value,
      requiredChange: cf.required_change,
      wouldFlipPredictionTo: cf.would_flip_prediction_to,
      description: cf.description,
    })) || [],
    shapValues: backendExp.shap_values,
    limeValues: backendExp.lime_values,
    visualizations: backendExp.visualizations?.map((viz: any) => ({
      chartType: viz.chart_type,
      data: viz.data,
      layout: viz.layout,
    })),
  };
}

export function useXAI() {
  const {
    explanations,
    currentExplanation,
    selectedTradeId,
    strategyRules,
    isLoading,
    error,
    setCurrentExplanation,
    addExplanation,
    selectTrade,
    setStrategyRules,
    setLoading,
    setError,
  } = useXAIStore();

  const explainPrediction = useCallback(async (
    request: ExplainPredictionRequest
  ) => {
    setLoading(true);
    setError(null);

    try {
      const response = await xaiClient.explainPrediction(request);
      const transformed = transformExplanation(response.explanation);

      // Add to store
      addExplanation(transformed);

      setCurrentExplanation(transformed);
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError, setCurrentExplanation, addExplanation]);

  const fetchExplanation = useCallback(async (explanationId: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await xaiClient.getExplanation(explanationId);
      const transformed = transformExplanation(response.explanation);
      setCurrentExplanation(transformed);
      selectTrade(transformed.tradeId);
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError, setCurrentExplanation, selectTrade]);

  const fetchFeatureImportance = useCallback(async (
    modelType: string,
    limit?: number
  ) => {
    try {
      const response = await xaiClient.getFeatureImportance(modelType, limit);
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    }
  }, [setError]);

  const generateCounterfactuals = useCallback(async (
    request: {
      features: Record<string, number>;
      prediction: number;
      model_type: string;
      target_outcome?: number;
      constraints?: Record<string, { min: number; max: number }>;
    }
  ) => {
    setLoading(true);
    setError(null);

    try {
      const response = await xaiClient.generateCounterfactuals(request);
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError]);

  const extractStrategyRules = useCallback(async (
    request: StrategyRulesRequest
  ) => {
    setLoading(true);
    setError(null);

    try {
      const response = await xaiClient.extractStrategyRules(request);
      const rules: StrategyRules = {
        strategyId: request.strategy_name,
        strategyName: request.strategy_name,
        rules: response.rules.map(r => ({
          ruleId: r.rule_id,
          type: r.type,
          indicator: r.indicator,
          condition: r.condition,
          action: r.action,
          description: r.description,
          lineNumber: r.line_number,
        })),
        extractedAt: response.extraction_method,
      };
      setStrategyRules(rules);
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError, setStrategyRules]);

  const clearError = useCallback(() => {
    setError(null);
  }, [setError]);

  return {
    // State
    explanations,
    currentExplanation,
    selectedTradeId,
    strategyRules,
    isLoading,
    error,

    // Actions
    explainPrediction,
    fetchExplanation,
    fetchFeatureImportance,
    generateCounterfactuals,
    extractStrategyRules,
    selectTrade,
    clearError,
  };
}
