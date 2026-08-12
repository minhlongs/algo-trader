/**
 * Tests for LlmRouter constructor — OmniRoute enforcement.
 *
 * Verifies:
 * - Non-OmniRoute, non-loopback endpoint URL throws on construction
 * - OmniRoute URL passes
 * - Loopback (localhost/127.0.0.1/0.0.0.0) legacy fixtures still pass
 */

import { describe, it, expect } from 'vitest';
import { LlmRouter, OMNIROUTE_URL } from '../llm-router';

const makeOkResponse = (content: string, model = 'mlx-community/DeepSeek-R1-Distill-Qwen-32B-4bit') =>
  new Response(
    JSON.stringify({ choices: [{ message: { content } }], usage: { total_tokens: 100 }, model }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

describe('LlmRouter — OmniRoute enforcement (constructor)', () => {
  it('constructs normally with OmniRoute base URL', async () => {
    const router = new LlmRouter({
      primary: { url: OMNIROUTE_URL, model: 'deepseek-r1', priority: 1, maxTokens: 2048, timeoutMs: 5000 },
      fastTriage: { url: OMNIROUTE_URL, model: 'nemotron', priority: 1, maxTokens: 512, timeoutMs: 10000 },
      fallback: { url: OMNIROUTE_URL, model: 'ollama-model', priority: 2, maxTokens: 2048, timeoutMs: 30000 },
      healthCheckIntervalMs: 30000,
      cloudDailyBudgetUsd: 100,
    });
    expect(router).toBeInstanceOf(LlmRouter);
  });

  it('allows loopback legacy fixtures without OmniRoute (backward compatibility)', async () => {
    expect(() => {
      new LlmRouter({
        primary: { url: 'http://127.0.0.1:11435/v1', model: 'deepseek-r1', priority: 1, maxTokens: 2048, timeoutMs: 5000 },
        fastTriage: { url: 'http://127.0.0.1:11436/v1', model: 'nemotron', priority: 1, maxTokens: 512, timeoutMs: 10000 },
        fallback: { url: 'http://127.0.0.1:11434/v1', model: 'ollama-model', priority: 2, maxTokens: 2048, timeoutMs: 30000 },
        healthCheckIntervalMs: 30000,
        cloudDailyBudgetUsd: 100,
      });
    }).not.toThrow();
  });

  it('allows localhost legacy fixtures without OmniRoute (backward compatibility)', async () => {
    expect(() => {
      new LlmRouter({
        primary: { url: 'http://localhost:11435/v1', model: 'deepseek-r1', priority: 1, maxTokens: 2048, timeoutMs: 5000 },
        fallback: { url: 'http://localhost:11434/v1', model: 'ollama-model', priority: 2, maxTokens: 2048, timeoutMs: 30000 },
        healthCheckIntervalMs: 30000,
        cloudDailyBudgetUsd: 100,
      });
    }).not.toThrow();
  });

  it('throws on non-OmniRoute, non-loopback endpoint URL', async () => {
    expect(() => {
      new LlmRouter({
        primary: { url: 'http://evil.example.com:20128/v1', model: 'deepseek-r1', priority: 1, maxTokens: 2048, timeoutMs: 5000 },
        fastTriage: { url: 'http://127.0.0.1:11436/v1', model: 'nemotron', priority: 1, maxTokens: 512, timeoutMs: 10000 },
        fallback: { url: 'http://127.0.0.1:11434/v1', model: 'ollama-model', priority: 2, maxTokens: 2048, timeoutMs: 30000 },
        healthCheckIntervalMs: 30000,
        cloudDailyBudgetUsd: 100,
      });
    }).toThrow(/OmniRoute violation/);
  });

  it('throws on non-OmniRoute fallback URL', async () => {
    expect(() => {
      new LlmRouter({
        primary: { url: OMNIROUTE_URL, model: 'deepseek-r1', priority: 1, maxTokens: 2048, timeoutMs: 5000 },
        fallback: { url: 'http://10.0.0.5:11434/v1', model: 'ollama-model', priority: 2, maxTokens: 2048, timeoutMs: 30000 },
        healthCheckIntervalMs: 30000,
        cloudDailyBudgetUsd: 100,
      });
    }).toThrow(/OmniRoute violation.*fallback/);
  });

  it('OMNIROUTE_URL constant is exactly http://omnimbp.local:20128/v1', async () => {
    expect(OMNIROUTE_URL).toBe('http://omnimbp.local:20128/v1');
  });

});
