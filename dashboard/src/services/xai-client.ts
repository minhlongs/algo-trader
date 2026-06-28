/**
 * XAI API Client
 *
 * Client for interacting with AlphaEar Intelligence Sidecar XAI endpoints.
 * Base URL: http://host.docker.internal:8100 (Docker) or environment variable.
 */

const DEFAULT_XAI_BASE_URL = import.meta.env.VITE_XAI_BASE_URL || 'http://localhost:8100';

export interface ExplainPredictionRequest {
  model_type: 'rl' | 'kronos' | 'strategy';
  features: Record<string, number>;
  prediction?: number;
  trade_id?: string;
  generate_visualizations?: boolean;
}

export interface ExplainPredictionResponse {
  explanation: {
    trade_id: string;
    model_type: string;
    prediction: number;
    feature_importance: Record<string, number>;
    shap_values?: Record<string, number>;
    lime_values?: Record<string, number>;
    rationale: string;
    counterfactuals?: Array<{
      feature: string;
      current_value: number;
      counterfactual_value: number;
      required_change: number;
      would_flip_prediction_to: number;
      description: string;
    }>;
    confidence: number;
    generated_at: string;
    visualizations?: Array<{
      chart_type: string;
      data: {
        x?: string[];
        y?: number[];
        r?: number[];
        type: string;
        marker?: Record<string, string>;
      };
      layout?: Record<string, unknown>;
    }>;
  };
  summary: string;
  top_features: Array<{ name: string; importance: number }>;
  visualizations?: Array<{
    chart_type: string;
    data: Record<string, unknown>;
    layout?: Record<string, unknown>;
  }>;
}

export interface StrategyRulesRequest {
  strategy_code: string;
  strategy_name: string;
  use_llm?: boolean;
}

export interface StrategyRulesResponse {
  strategy_name: string;
  rules: Array<{
    rule_id: string;
    type: string;
    indicator?: string;
    condition: string;
    action: string;
    description: string;
    line_number?: number;
  }>;
  num_rules: number;
  extraction_method: string;
}

export interface CounterfactualRequest {
  features: Record<string, number>;
  prediction: number;
  model_type: string;
  target_outcome?: number;
  constraints?: Record<string, { min: number; max: number }>;
  n_counterfactuals?: number;
}

export interface CounterfactualResponse {
  original_prediction: number;
  original_features: Record<string, number>;
  counterfactuals: Array<{
    feature: string;
    current_value: number;
    counterfactual_value: number;
    required_change: number;
    would_flip_prediction_to: number;
    description: string;
  }>;
  num_generated: number;
  constraints_applied: boolean;
}

export interface XAIHealthResponse {
  status: string;
  shap_available: boolean;
  lime_available: boolean;
  llm_enabled: boolean;
  persistence_enabled: boolean;
  timestamp: string;
}

class XAIClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || DEFAULT_XAI_BASE_URL;
  }

  async checkHealth(): Promise<XAIHealthResponse> {
    const response = await fetch(`${this.baseUrl}/xai/health`);
    if (!response.ok) {
      throw new Error(`XAI health check failed: ${response.statusText}`);
    }
    return response.json();
  }

  async explainPrediction(
    req: ExplainPredictionRequest
  ): Promise<ExplainPredictionResponse> {
    const response = await fetch(`${this.baseUrl}/xai/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Explanation failed: ${error}`);
    }

    return response.json();
  }

  async getExplanation(explanationId: string): Promise<ExplainPredictionResponse> {
    const response = await fetch(`${this.baseUrl}/xai/explanation/${explanationId}`);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Explanation not found');
      }
      throw new Error(`Failed to retrieve explanation: ${response.statusText}`);
    }

    return response.json();
  }

  async getFeatureImportance(
    modelType: string,
    limit?: number
  ): Promise<{ model_type: string; features: Array<{ name: string; importance: number; description: string }> }> {
    const url = new URL(`${this.baseUrl}/xai/feature-importance`);
    url.searchParams.append('model_type', modelType);
    if (limit) url.searchParams.append('limit', limit.toString());

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`Feature importance query failed: ${response.statusText}`);
    }

    return response.json();
  }

  async generateCounterfactuals(
    req: CounterfactualRequest
  ): Promise<CounterfactualResponse> {
    const response = await fetch(`${this.baseUrl}/xai/counterfactual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    if (!response.ok) {
      throw new Error(`Counterfactual generation failed: ${response.statusText}`);
    }

    return response.json();
  }

  async extractStrategyRules(
    req: StrategyRulesRequest
  ): Promise<StrategyRulesResponse> {
    const response = await fetch(`${this.baseUrl}/xai/strategy-rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    if (!response.ok) {
      throw new Error(`Rule extraction failed: ${response.statusText}`);
    }

    return response.json();
  }

  async getFeatureImportanceChart(
    features: Record<string, number>,
    title?: string
  ): Promise<{
    data: Array<{ x: string[]; y: number[]; type: string; marker?: Record<string, string> }>;
    layout: Record<string, unknown>;
  }> {
    const url = new URL(`${this.baseUrl}/xai/visualization/feature-importance`);
    url.searchParams.append('features', JSON.stringify(features));
    if (title) url.searchParams.append('title', title);

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`Visualization generation failed: ${response.statusText}`);
    }

    return response.json();
  }
}

// Singleton instance
export const xaiClient = new XAIClient();
