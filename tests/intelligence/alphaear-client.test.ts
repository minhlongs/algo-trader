import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AlphaEarClient } from '../../src/desk/intelligence/alphaear-client';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

describe('AlphaEarClient', () => {
  let client: AlphaEarClient;

  beforeEach(() => {
    fetchMock.mockReset();
    client = new AlphaEarClient('http://localhost:8100');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchHotNews', () => {
    it('returns news items from sidecar', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        items: [{ id: '1', source: 'wsj', rank: 1, title: 'Fed Cuts Rates', url: 'http://wsj.com/1' }],
        count: 1, source: 'wallstreetcn',
      }), { status: 200 }));

      const items = await client.fetchHotNews('wallstreetcn', 5);
      expect(items).toHaveLength(1);
      expect(items[0]!.title).toBe('Fed Cuts Rates');
    });

    it('returns empty array when sidecar unavailable', async () => {
      fetchMock.mockRejectedValueOnce(new Error('connection refused'));
      const items = await client.fetchHotNews();
      expect(items).toEqual([]);
    });
  });

  describe('discoverPolymarkets', () => {
    it('returns Polymarket markets', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        markets: [{ id: 'm1', question: 'Will BTC hit 100k?', slug: 'btc-100k' }],
        count: 1,
      }), { status: 200 }));

      const markets = await client.discoverPolymarkets(10);
      expect(markets).toHaveLength(1);
      expect(markets[0]!.question).toContain('BTC');
    });
  });

  describe('analyzeSentiment', () => {
    it('returns FinBERT sentiment result', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        score: 0.85, label: 'positive', reason: 'bullish tone',
      }), { status: 200 }));

      const result = await client.analyzeSentiment('Bitcoin rally continues');
      expect(result).not.toBeNull();
      expect(result!.label).toBe('positive');
      expect(result!.score).toBe(0.85);
    });

    it('returns null on 503', async () => {
      fetchMock.mockResolvedValueOnce(new Response('service unavailable', { status: 503 }));
      const result = await client.analyzeSentiment('test');
      expect(result).toBeNull();
    });
  });

  describe('batchSentiment', () => {
    it('returns batch results', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        results: [
          { score: 0.9, label: 'positive' },
          { score: -0.7, label: 'negative' },
        ],
        count: 2,
      }), { status: 200 }));

      const results = await client.batchSentiment(['good news', 'bad news']);
      expect(results).toHaveLength(2);
      expect(results[0]!.label).toBe('positive');
      expect(results[1]!.label).toBe('negative');
    });
  });

  describe('forecast', () => {
    it('returns Kronos forecast points', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        forecast: [
          { close: 0.62, high: 0.65, low: 0.59 },
          { close: 0.63, high: 0.66, low: 0.60 },
        ],
        model: 'kronos', device: 'mps',
      }), { status: 200 }));

      const prices = Array.from({ length: 60 }, (_, i) => 0.5 + i * 0.002);
      const forecast = await client.forecast(prices, 60, 2);
      expect(forecast).toHaveLength(2);
      expect(forecast[0]!.close).toBe(0.62);
    });

    it('returns empty array when sidecar down', async () => {
      fetchMock.mockRejectedValueOnce(new Error('timeout'));
      const forecast = await client.forecast([0.5, 0.51, 0.52]);
      expect(forecast).toEqual([]);
    });
  });

  describe('trackSignal', () => {
    it('parses signal evolution JSON from LLM response', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        analysis: 'The signal has been confirmed. {"status": "STRENGTHENED", "confidence": 0.8, "reasoning": "Price moved in expected direction"}',
        model: 'nemotron-nano',
      }), { status: 200 }));

      const result = await client.trackSignal('sig-1', 'BTC will rise', 'ETF approved', 0.65, 0.55);
      expect(result).not.toBeNull();
      expect(result!.status).toBe('STRENGTHENED');
      expect(result!.confidence).toBe(0.8);
    });

    it('returns null on unparseable response', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        analysis: 'I cannot determine the signal status.',
        model: 'nemotron-nano',
      }), { status: 200 }));

      const result = await client.trackSignal('sig-2', 'test', 'test', 0.5, 0.5);
      expect(result).toBeNull();
    });
  });

  describe('checkHealth', () => {
    it('returns health status and marks healthy', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        status: 'healthy', kronos_loaded: true, finbert_loaded: true,
        news_sources: 14, polymarket_api: true,
      }), { status: 200 }));

      const health = await client.checkHealth();
      expect(health).not.toBeNull();
      expect(health!.kronos_loaded).toBe(true);
      expect(client.isHealthy).toBe(true);
    });

    it('marks unhealthy on failure', async () => {
      fetchMock.mockRejectedValueOnce(new Error('refused'));
      const health = await client.checkHealth();
      expect(health).toBeNull();
      expect(client.isHealthy).toBe(false);
    });
  });

  describe('isHealthy staleness', () => {
    it('returns false when the last health check is older than 300s', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        status: 'healthy', kronos_loaded: true, finbert_loaded: true,
        news_sources: 14, polymarket_api: true,
      }), { status: 200 }));
      await client.checkHealth();
      // Force the stored timestamp to exceed the 300_000 ms staleness window.
      (client as unknown as { lastHealthCheck: number }).lastHealthCheck = Date.now() - 400_000;
      expect(client.isHealthy).toBe(false);
    });
  });

  describe('extractContent', () => {
    it('returns extracted article content', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        content: 'Full article text here',
      }), { status: 200 }));

      const result = await client.extractContent('http://wsj.com/1');
      expect(result).toBe('Full article text here');
    });

    it('returns null when sidecar is unavailable', async () => {
      fetchMock.mockRejectedValueOnce(new Error('connection refused'));
      const result = await client.extractContent('http://wsj.com/1');
      expect(result).toBeNull();
    });
  });

  describe('predictOhlcv', () => {
    it('returns Kronos OHLCV predictions', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        predictions: [
          { close: 0.62, high: 0.65, low: 0.59, confidence: 0.8 },
          { close: 0.63, high: 0.66, low: 0.60, confidence: 0.75 },
        ],
      }), { status: 200 }));

      const candles = [
        { timestamp: 1, open: 0.5, high: 0.55, low: 0.48, close: 0.52, volume: 100 },
      ];
      const result = await client.predictOhlcv(candles, 2);
      expect(result).not.toBeNull();
      expect(result!).toHaveLength(2);
      expect(result![0]!.confidence).toBe(0.8);
    });

    it('returns null when response has no predictions', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
      const result = await client.predictOhlcv([], 5);
      expect(result).toBeNull();
    });
  });

  describe('trackSignal JSON.parse error', () => {
    it('returns null when the matched JSON fragment is malformed', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        analysis: 'Result: {invalid json fragment}',
      }), { status: 200 }));

      const result = await client.trackSignal('sig-3', 'thesis', 'info', 0.5, 0.5);
      expect(result).toBeNull();
    });
  });

  describe('explainPrediction', () => {
    it('returns explanation with feature importance', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        prediction: 0.7, confidence: 0.85,
        feature_importance: { rsi: 0.4, volume: 0.2 },
        explanation: 'Movement driven by RSI divergence',
      }), { status: 200 }));

      const result = await client.explainPrediction({
        model_type: 'rl',
        features: { rsi: 0.6, volume: 0.8 },
        prediction: 0.7,
      });
      expect(result).not.toBeNull();
      expect(result!.explanation).toBe('Movement driven by RSI divergence');
      expect(result!.feature_importance.rsi).toBe(0.4);
    });
  });

  describe('getFeatureImportance', () => {
    it('returns ranked features for a model', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        model_type: 'kronos',
        features: [{ name: 'rsi', importance: 0.5 }, { name: 'macd', importance: 0.3 }],
        generated_at: '2026-01-01T00:00:00Z',
        metadata: { window: 60 },
      }), { status: 200 }));

      const result = await client.getFeatureImportance('kronos', 10);
      expect(result).not.toBeNull();
      expect(result!).toHaveProperty('model_type', 'kronos');
      expect(result!.features[0].name).toBe('rsi');
    });
  });

  describe('generateCounterfactuals', () => {
    it('returns counterfactual scenarios', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        original_prediction: 0.6,
        original_features: { rsi: 0.5 },
        counterfactuals: [{ rsi: 0.2 }, { rsi: 0.8 }],
        num_generated: 2,
        constraints_applied: true,
      }), { status: 200 }));

      const result = await client.generateCounterfactuals({
        features: { rsi: 0.5 },
        prediction: 0.6,
        model_type: 'rl',
      });
      expect(result).not.toBeNull();
      expect(result!.num_generated).toBe(2);
      expect(result!.constraints_applied).toBe(true);
    });
  });

  describe('extractStrategyRules', () => {
    it('returns parsed strategy rules', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        strategy_name: 'momentum',
        rules: [{ condition: 'rsi < 30', action: 'buy', confidence: 0.9 }],
        summary: 'Mean reversion on oversold signals',
        num_rules: 1,
        extraction_method: 'llm',
      }), { status: 200 }));

      const result = await client.extractStrategyRules({
        strategy_code: 'def run(): pass',
        strategy_name: 'momentum',
      });
      expect(result).not.toBeNull();
      expect(result!.rules[0].action).toBe('buy');
      expect(result!.extraction_method).toBe('llm');
    });
  });
});
