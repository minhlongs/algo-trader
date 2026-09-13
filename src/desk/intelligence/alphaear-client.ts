/**
 * AlphaEar Intelligence Client — calls Python sidecar on host.
 *
 * Sidecar runs bare metal at :8100 (needs Metal GPU for Kronos + FinBERT).
 * CashClaw container connects via host.docker.internal:8100.
 */

import {
  NewsItem, PolymarketDiscovery, SentimentResult, ForecastPoint,
  OhlcvCandle, KronosOhlcvPrediction, SignalEvolution, SidecarHealth,
  ExplainPredictionRequest, ExplainPredictionResult, FeatureImportanceResult,
  CounterfactualRequest, CounterfactualResult, StrategyRulesRequest, StrategyRulesResult,
} from './alphaear-types';
import { postAlphaEar, fetchAlphaEarHealth } from './alphaear-http';

export * from './alphaear-types';
export * from './alphaear-http';

const SIDECAR_URL = process.env['ALPHAEAR_SIDECAR_URL'] || '';

export class AlphaEarClient {
  private baseUrl: string;
  private healthy = false;
  private lastHealthCheck = 0;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || SIDECAR_URL;
  }

  async fetchHotNews(source = 'wallstreetcn', count = 15): Promise<NewsItem[]> {
    const resp = await postAlphaEar<{ items: NewsItem[] }>(this.baseUrl, '/news/hot', { source, count });
    return resp?.items ?? [];
  }

  async discoverPolymarkets(limit = 20): Promise<PolymarketDiscovery[]> {
    const resp = await postAlphaEar<{ markets: PolymarketDiscovery[] }>(this.baseUrl, '/news/polymarket', { limit });
    return resp?.markets ?? [];
  }

  async extractContent(url: string): Promise<string | null> {
    const resp = await postAlphaEar<{ content: string }>(this.baseUrl, '/news/content', { url });
    return resp?.content ?? null;
  }

  async analyzeSentiment(text: string): Promise<SentimentResult | null> {
    return postAlphaEar<SentimentResult>(this.baseUrl, '/sentiment/analyze', { text });
  }

  async batchSentiment(texts: string[]): Promise<SentimentResult[]> {
    const resp = await postAlphaEar<{ results: SentimentResult[] }>(this.baseUrl, '/sentiment/batch', { texts });
    return resp?.results ?? [];
  }

  async forecast(prices: number[], lookback = 60, predLen = 5, newsContext = ''): Promise<ForecastPoint[]> {
    const resp = await postAlphaEar<{ forecast: ForecastPoint[] }>(this.baseUrl, '/predict/forecast', {
      prices, lookback, pred_len: predLen, news_context: newsContext,
    });
    return resp?.forecast ?? [];
  }

  async predictOhlcv(candles: OhlcvCandle[], predLen = 5): Promise<KronosOhlcvPrediction[] | null> {
    const resp = await postAlphaEar<{ predictions?: KronosOhlcvPrediction[] }>(this.baseUrl, '/v1/kronos/predict-ohlcv', {
      candles, pred_len: predLen,
    });
    return resp?.predictions ?? null;
  }

  async trackSignal(
    signalId: string, originalThesis: string, newInfo: string, currentPrice: number, entryPrice: number
  ): Promise<SignalEvolution | null> {
    const resp = await postAlphaEar<{ analysis: string }>(this.baseUrl, '/signal/track', {
      signal_id: signalId, original_thesis: originalThesis, new_information: newInfo,
      current_price: currentPrice, entry_price: entryPrice,
    });
    if (!resp?.analysis) return null;
    try {
      const match = resp.analysis.match(/\{[^}]+\}/);
      return match ? JSON.parse(match[0]) : null;
    } catch {
      return null;
    }
  }

  async checkHealth(): Promise<SidecarHealth | null> {
    const health = await fetchAlphaEarHealth(this.baseUrl);
    if (health) {
      this.healthy = true;
      this.lastHealthCheck = Date.now();
      return health;
    }
    this.healthy = false;
    return null;
  }

  get isHealthy(): boolean {
    if (Date.now() - this.lastHealthCheck > 300_000) return false;
    return this.healthy;
  }

  async explainPrediction(req: ExplainPredictionRequest): Promise<ExplainPredictionResult | null> {
    return postAlphaEar<ExplainPredictionResult>(this.baseUrl, '/xai/explain', req);
  }

  async getFeatureImportance(modelType: 'rl' | 'kronos' | 'strategy', limit = 10): Promise<FeatureImportanceResult | null> {
    return postAlphaEar<FeatureImportanceResult>(this.baseUrl, '/xai/feature-importance', { model_type: modelType, limit });
  }

  async generateCounterfactuals(req: CounterfactualRequest): Promise<CounterfactualResult | null> {
    return postAlphaEar<CounterfactualResult>(this.baseUrl, '/xai/counterfactual', req);
  }

  async extractStrategyRules(req: StrategyRulesRequest): Promise<StrategyRulesResult | null> {
    return postAlphaEar<StrategyRulesResult>(this.baseUrl, '/xai/strategy-rules', req);
  }
}

export const alphaear = new AlphaEarClient();
