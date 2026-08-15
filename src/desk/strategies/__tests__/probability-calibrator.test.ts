/**
 * ProbabilityCalibratorStrategy Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProbabilityCalibratorStrategy } from '../probability-calibrator';
import type { BinaryMarket } from '../../arbitrage/types';

describe('ProbabilityCalibratorStrategy', () => {
  let calibrator: ProbabilityCalibratorStrategy;

  beforeEach(() => {
    calibrator = new ProbabilityCalibratorStrategy({
      llmBaseUrl: 'http://127.0.0.1:11434',
      llmModel: 'test-model',
      confidenceThreshold: 0.7,
      maxConcurrentRequests: 2,
    });
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should use default config when no options provided', () => {
      const c = new ProbabilityCalibratorStrategy();
      expect(c).toBeDefined();
    });

    it('should override defaults with provided config', () => {
      const c = new ProbabilityCalibratorStrategy({
        llmBaseUrl: 'http://127.0.0.1:11435',
        llmModel: 'custom-model',
        maxConcurrentRequests: 5,
      });
      expect(c).toBeDefined();
    });
  });

  describe('estimateProbability', () => {
    it('should parse valid LLM response', async () => {
      const mockResponse = {
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    probability: 0.75,
                    confidence: 0.85,
                    reasoning: 'High probability based on market conditions',
                  }),
                },
              },
            ],
          }),
      };
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const result = await calibrator.estimateProbability(
        'Will BTC reach 100k by end of 2026?',
      );
      expect(result.probability).toBe(0.75);
      expect(result.confidence).toBe(0.85);
      expect(result.reasoning).toContain('market conditions');
    });

    it('should pass context to LLM when provided', async () => {
      const mockResponse = {
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    probability: 0.6,
                    confidence: 0.7,
                    reasoning: 'Context considered',
                  }),
                },
              },
            ],
          }),
      };
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const result = await calibrator.estimateProbability(
        'Will ETH surpass $5000?',
        'Current price: $4500, strong fundamentals',
      );
      expect(result.probability).toBe(0.6);

      // Verify the user prompt includes context
      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.messages[1].content).toContain('Current price');
    });

    it('should fall back to default values when LLM response is not parseable', async () => {
      const mockResponse = {
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'not valid json at all' } }],
          }),
      };
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const result = await calibrator.estimateProbability('Test question');
      expect(result.probability).toBe(0.5);
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toContain('Failed to parse');
    });

    it('should extract JSON from mixed text response', async () => {
      const mockResponse = {
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content:
                    'Here is my analysis:\n```json\n{"probability": 0.65, "confidence": 0.72, "reasoning": "Moderate probability"}\n```\nEnd.',
                },
              },
            ],
          }),
      };
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const result = await calibrator.estimateProbability('Test');
      expect(result.probability).toBe(0.65);
      expect(result.confidence).toBe(0.72);
    });

    it('should clamp probability to [0, 1] range', async () => {
      const mockResponse = {
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    probability: 2.5,
                    confidence: -0.5,
                    reasoning: 'Out of range',
                  }),
                },
              },
            ],
          }),
      };
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const result = await calibrator.estimateProbability('Test');
      expect(result.probability).toBe(1);
      expect(result.confidence).toBe(0);
    });

    it('should throw on HTTP error from LLM API', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      });

      await expect(
        calibrator.estimateProbability('Test'),
      ).rejects.toThrow();
    });

    it('should limit concurrent requests', async () => {
      let concurrent = 0;
      let maxConcurrent = 0;

      globalThis.fetch = vi.fn().mockImplementation(async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 10));
        concurrent--;
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      probability: 0.5,
                      confidence: 0.5,
                      reasoning: 'test',
                    }),
                  },
                },
              ],
            }),
        };
      });

      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(calibrator.estimateProbability(`Question ${i}`));
      }
      await Promise.all(promises);
      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });
  });

  describe('scoreSentiment', () => {
    it('should parse valid sentiment response', async () => {
      const mockResponse = {
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    sentiment: 0.8,
                    impact: 'high',
                  }),
                },
              },
            ],
          }),
      };
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const result = await calibrator.scoreSentiment(
        'Major breakthrough announced',
      );
      expect(result.sentiment).toBe(0.8);
      expect(result.impact).toBe('high');
    });

    it('should clamp sentiment to [-1, 1] range', async () => {
      const mockResponse = {
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    sentiment: -5,
                    impact: 'medium',
                  }),
                },
              },
            ],
          }),
      };
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const result = await calibrator.scoreSentiment('Bad news');
      expect(result.sentiment).toBe(-1);
    });

    it('should default to medium impact for unknown impact values', async () => {
      const mockResponse = {
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    sentiment: 0.5,
                    impact: 'critical',
                  }),
                },
              },
            ],
          }),
      };
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const result = await calibrator.scoreSentiment('Some news');
      expect(result.impact).toBe('medium');
    });

    it('should return neutral values on parse failure', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'garbage' } }],
          }),
      });

      const result = await calibrator.scoreSentiment('Bad data');
      expect(result.sentiment).toBe(0);
      expect(result.impact).toBe('low');
    });
  });

  describe('detectMispricing', () => {
    it('should return fair when edge is below threshold', () => {
      const market: BinaryMarket = {
        conditionId: '0x123',
        question: 'Test?',
        yesPrice: 0.5,
        noPrice: 0.5,
        volume: 10000,
        liquidity: 5000,
        endDate: new Date('2026-12-31'),
        resolved: false,
      };
      const result = calibrator.detectMispricing(market, 0.51);
      expect(result.mispriced).toBe(false);
      expect(result.direction).toBe('fair');
      expect(result.edge).toBeCloseTo(0.01);
    });

    it('should detect underpriced-yes when LLM estimate is higher than market', () => {
      const market: BinaryMarket = {
        conditionId: '0x456',
        question: 'Will it happen?',
        yesPrice: 0.4,
        noPrice: 0.6,
        volume: 50000,
        liquidity: 25000,
        endDate: new Date('2026-12-31'),
        resolved: false,
      };
      const result = calibrator.detectMispricing(market, 0.65);
      expect(result.mispriced).toBe(true);
      expect(result.direction).toBe('underpriced-yes');
      expect(result.edge).toBeCloseTo(0.25);
    });

    it('should detect overpriced-yes when LLM estimate is lower than market', () => {
      const market: BinaryMarket = {
        conditionId: '0x789',
        question: 'Outcome?',
        yesPrice: 0.8,
        noPrice: 0.2,
        volume: 100000,
        liquidity: 50000,
        endDate: new Date('2026-12-31'),
        resolved: false,
      };
      const result = calibrator.detectMispricing(market, 0.5);
      expect(result.mispriced).toBe(true);
      expect(result.direction).toBe('overpriced-yes');
      expect(result.edge).toBeCloseTo(0.3);
    });

    it('should handle edge case where estimated prob equals market price', () => {
      const market: BinaryMarket = {
        conditionId: '0xabc',
        question: 'Equal?',
        yesPrice: 0.6,
        noPrice: 0.4,
        volume: 1000,
        liquidity: 500,
        endDate: new Date('2026-12-31'),
        resolved: false,
      };
      const result = calibrator.detectMispricing(market, 0.6);
      expect(result.mispriced).toBe(false);
      expect(result.direction).toBe('fair');
    });
  });
});
