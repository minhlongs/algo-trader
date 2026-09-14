/**
 * Fixtures and helpers for LlmRouter Qwen tests.
 */

import { RouterRequest } from '../llm-router';

export const makeRequest = (overrides: Partial<RouterRequest> = {}): RouterRequest => ({
  messages: [{ role: 'user', content: 'Evaluate signal' }],
  maxTokens: 256,
  temperature: 0.1,
  ...overrides,
});

export const makeOkResponse = (content: string, model = 'mlx-community/Qwen3-30B-A3B-4bit'): Response =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
      usage: { total_tokens: 100 },
      model,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

export const makeErrorResponse = (status: number): Response =>
  new Response(null, { status });

export const qwenEndpoint = {
  url: 'http://127.0.0.1:11437/v1',
  model: 'mlx-community/Qwen3-30B-A3B-4bit',
  priority: 1,
  maxTokens: 4096,
  timeoutMs: 5000,
};

export const primaryEndpoint = {
  url: 'http://127.0.0.1:11435/v1',
  model: 'mlx-community/DeepSeek-R1-Distill-Qwen-32B-4bit',
  priority: 1,
  maxTokens: 2048,
  timeoutMs: 5000,
};

export const fallbackEndpoint = {
  url: 'http://127.0.0.1:11434/v1',
  model: 'deepseek-r1:32b',
  priority: 2,
  maxTokens: 2048,
  timeoutMs: 5000,
};

export const baseConfig = {
  primary: primaryEndpoint,
  fastTriage: { url: 'http://127.0.0.1:11436/v1', model: 'nemotron', priority: 1, maxTokens: 512, timeoutMs: 5000 },
  fallback: fallbackEndpoint,
  healthCheckIntervalMs: 30000,
  cloudDailyBudgetUsd: 100,
};
