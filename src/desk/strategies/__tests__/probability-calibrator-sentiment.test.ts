/**
 * ProbabilityCalibratorStrategy Tests — scoreSentiment & detectMispricing.
 *
 * Self-contained sub-suite. Re-declares vi.mock, beforeEach, and imports
 * so it can run independently of probability-calibrator.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProbabilityCalibratorStrategy } from '../probability-calibrator';
import type { BinaryMarket } from '../../arbitrage/types';

describe('ProbabilityCalibratorStrategy — sentiment & mispricing', () => {
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

  describe('scoreSentiment', () => {
    const sentimentResp = (sentiment: number, impact: string) => ({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: JSON.stringify({ sentiment, impact }) } }],
      }),
    });

    it('should parse valid sentiment response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(sentimentResp(0.8, 'high'));
      const result = await calibrator.scoreSentiment('Major breakthrough announced');
      expect(result.sentiment).toBe(0.8);
      expect(result.impact).toBe('high');
    });

    it('should clamp sentiment to [-1, 1] range', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(sentimentResp(-5, 'medium'));
      const result = await calibrator.scoreSentiment('Bad news');
      expect(result.sentiment).toBe(-1);
    });

    it('should default to medium impact for unknown impact values', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(sentimentResp(0.5, 'critical'));
      const result = await calibrator.scoreSentiment('Some news');
      expect(result.impact).toBe('medium');
    });

    it('should return neutral values on parse failure', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true, json: () => Promise.resolve({ choices: [{ message: { content: 'garbage' } }] }),
      });
      const result = await calibrator.scoreSentiment('Bad data');
      expect(result.sentiment).toBe(0);
      expect(result.impact).toBe('low');
    });
  });

  describe('detectMispricing', () => {
    const market = (yesPrice: number): BinaryMarket => ({
      conditionId: '0x' + String(yesPrice).replace('.', ''),
      question: 'Q?', yesPrice, noPrice: 1 - yesPrice,
      volume: 10000, liquidity: 5000,
      endDate: new Date('2026-12-31'), resolved: false,
    });

    it('returns fair when edge is below threshold', () => {
      const r = calibrator.detectMispricing(market(0.5), 0.51);
      expect(r.mispriced).toBe(false);
      expect(r.direction).toBe('fair');
      expect(r.edge).toBeCloseTo(0.01);
    });

    it('detects underpriced-yes when LLM estimate > market', () => {
      const r = calibrator.detectMispricing(market(0.4), 0.65);
      expect(r.mispriced).toBe(true);
      expect(r.direction).toBe('underpriced-yes');
      expect(r.edge).toBeCloseTo(0.25);
    });

    it('detects overpriced-yes when LLM estimate < market', () => {
      const r = calibrator.detectMispricing(market(0.8), 0.5);
      expect(r.mispriced).toBe(true);
      expect(r.direction).toBe('overpriced-yes');
      expect(r.edge).toBeCloseTo(0.3);
    });

    it('handles edge case where estimated prob equals market price', () => {
      const r = calibrator.detectMispricing(market(0.6), 0.6);
      expect(r.mispriced).toBe(false);
      expect(r.direction).toBe('fair');
    });
  });
});
