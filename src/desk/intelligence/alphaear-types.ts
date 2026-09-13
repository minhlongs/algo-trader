/**
 * AlphaEar Intelligence Types
 * Domain models for news, polymarkets, sentiment, forecast, signals, sidecar health, and XAI.
 */

export interface NewsItem {
  id: string;
  source: string;
  rank: number;
  title: string;
  url: string;
  content?: string;
}

export interface PolymarketDiscovery {
  id: string;
  question: string;
  slug: string;
  outcomes: string[];
  outcomePrices: string[];
  volume: string;
  liquidity: string;
}

export interface SentimentResult {
  score: number;
  label: string;
  reason?: string;
}

export interface ForecastPoint {
  close: number;
  high: number;
  low: number;
}

export interface OhlcvCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface KronosOhlcvPrediction {
  close: number;
  high: number;
  low: number;
  confidence: number;
}

export interface SignalEvolution {
  status: 'STRENGTHENED' | 'WEAKENED' | 'FALSIFIED' | 'UNCHANGED';
  confidence: number;
  reasoning: string;
}

export interface SidecarHealth {
  status: string;
  kronos_loaded: boolean;
  finbert_loaded: boolean;
  news_sources: number;
  polymarket_api: boolean;
}

export interface ExplainPredictionRequest {
  model_type: string;
  features: Record<string, number>;
  prediction: number;
  trade_id?: string;
  generate_visualizations?: boolean;
}

export interface ExplainPredictionResult {
  prediction: number;
  confidence: number;
  feature_importance: Record<string, number>;
  explanation: string;
  visualizations?: Record<string, unknown>;
}

export interface FeatureImportanceResult {
  model_type: string;
  features: Array<{ name: string; importance: number }>;
  generated_at: string;
  metadata: Record<string, unknown>;
}

export interface CounterfactualRequest {
  features: Record<string, number>;
  prediction: number;
  model_type: string;
  target_outcome?: number;
  constraints?: Record<string, { min: number; max: number }>;
  n_counterfactuals?: number;
}

export interface CounterfactualResult {
  original_prediction: number;
  original_features: Record<string, number>;
  counterfactuals: Array<Record<string, unknown>>;
  num_generated: number;
  constraints_applied: boolean;
}

export interface StrategyRulesRequest {
  strategy_code: string;
  strategy_name: string;
  use_llm?: boolean;
}

export interface StrategyRulesResult {
  strategy_name: string;
  rules: Array<{ condition: string; action: string; confidence: number }>;
  summary: string;
  num_rules: number;
  extraction_method: string;
}
