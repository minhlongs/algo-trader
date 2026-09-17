/**
 * ProbabilityCalibratorStrategy Tests — estimateProbability edge cases.
 *
 * Self-contained sub-suite. Re-declares vi.mock, beforeEach, and imports
 * so it can run independently of probability-calibrator.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProbabilityCalibratorStrategy } from '../probability-calibrator';

describe('ProbabilityCalibratorStrategy — estimateProbability edge cases', () => {
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

  it('should extract JSON from mixed text response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: {
          content: 'Here is my analysis:\n```json\n{"probability": 0.65, "confidence": 0.72, "reasoning": "Moderate probability"}\n```\nEnd.',
        } }],
      }),
    });
    const result = await calibrator.estimateProbability('Test');
    expect(result.probability).toBe(0.65);
    expect(result.confidence).toBe(0.72);
  });

  it('should clamp probability to [0, 1] range', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: JSON.stringify({ probability: 2.5, confidence: -0.5, reasoning: 'Out of range' }) } }],
      }),
    });
    const result = await calibrator.estimateProbability('Test');
    expect(result.probability).toBe(1);
    expect(result.confidence).toBe(0);
  });

  it('should throw on HTTP error from LLM API', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429, statusText: 'Too Many Requests' });
    await expect(calibrator.estimateProbability('Test')).rejects.toThrow();
  });

  it('should limit concurrent requests', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 10));
      concurrent--;
      return { ok: true, json: () => Promise.resolve({ choices: [{ message: { content: JSON.stringify({ probability: 0.5, confidence: 0.5, reasoning: 'test' }) } }] }) };
    });
    const promises = [];
    for (let i = 0; i < 5; i++) promises.push(calibrator.estimateProbability(`Question ${i}`));
    await Promise.all(promises);
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });
});
