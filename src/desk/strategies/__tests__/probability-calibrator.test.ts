/**
 * ProbabilityCalibratorStrategy Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProbabilityCalibratorStrategy } from '../probability-calibrator';

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
  });
});
