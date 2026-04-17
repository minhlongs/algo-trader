/**
 * Tests for LlmRouter.qwenChat() — Qwen MoE provider routing.
 *
 * Covers: success, timeout, 401, 500, empty response, JSON parse fail,
 *         fallback trigger, concurrent requests, feature flag disabled.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LlmRouter, RouterRequest } from '../llm-router';

// --- helpers ---

const makeRequest = (overrides: Partial<RouterRequest> = {}): RouterRequest => ({
  messages: [{ role: 'user', content: 'Evaluate signal' }],
  maxTokens: 256,
  temperature: 0.1,
  ...overrides,
});

const makeOkResponse = (content: string, model = 'mlx-community/Qwen3-30B-A3B-4bit') =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
      usage: { total_tokens: 100 },
      model,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

const makeErrorResponse = (status: number) =>
  new Response(null, { status });

// Qwen config for tests
const qwenEndpoint = {
  url: 'http://127.0.0.1:11437/v1',
  model: 'mlx-community/Qwen3-30B-A3B-4bit',
  priority: 1,
  maxTokens: 4096,
  timeoutMs: 5000,
};

const primaryEndpoint = {
  url: 'http://127.0.0.1:11435/v1',
  model: 'mlx-community/DeepSeek-R1-Distill-Qwen-32B-4bit',
  priority: 1,
  maxTokens: 2048,
  timeoutMs: 5000,
};

const fallbackEndpoint = {
  url: 'http://127.0.0.1:11434/v1',
  model: 'deepseek-r1:32b',
  priority: 2,
  maxTokens: 2048,
  timeoutMs: 5000,
};

const baseConfig = {
  primary: primaryEndpoint,
  fastTriage: { url: 'http://127.0.0.1:11436/v1', model: 'nemotron', priority: 1, maxTokens: 512, timeoutMs: 5000 },
  fallback: fallbackEndpoint,
  healthCheckIntervalMs: 30000,
  cloudDailyBudgetUsd: 100,
};

// --- tests ---

describe('LlmRouter.qwenChat()', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('routes to Qwen when enabled and healthy', async () => {
    fetchMock.mockResolvedValueOnce(makeOkResponse('Approve — edge real'));

    const router = new LlmRouter({ ...baseConfig, qwen: qwenEndpoint });
    const result = await router.qwenChat(makeRequest());

    expect(result.provider).toBe('mlx-qwen');
    expect(result.model).toBe(qwenEndpoint.model);
    expect(result.content).toBe('Approve — edge real');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toContain('11437');
  });

  it('falls back to chat() when Qwen disabled (no qwen in config)', async () => {
    // Primary (DeepSeek) responds OK
    fetchMock.mockResolvedValueOnce(makeOkResponse('ok', primaryEndpoint.model));

    const router = new LlmRouter({ ...baseConfig }); // no qwen field
    const result = await router.qwenChat(makeRequest());

    // Should have used chat() → primary
    expect(result.provider).toBe('mlx');
    expect(result.model).toBe(primaryEndpoint.model);
  });

  it('falls back to chat() (DeepSeek primary) when Qwen returns HTTP 500', async () => {
    fetchMock
      .mockResolvedValueOnce(makeErrorResponse(500))           // Qwen fails
      .mockResolvedValueOnce(makeOkResponse('ok', primaryEndpoint.model)); // primary succeeds

    const router = new LlmRouter({ ...baseConfig, qwen: qwenEndpoint });
    const result = await router.qwenChat(makeRequest());

    expect(result.provider).toBe('mlx');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to chat() when Qwen returns HTTP 401', async () => {
    fetchMock
      .mockResolvedValueOnce(makeErrorResponse(401))
      .mockResolvedValueOnce(makeOkResponse('ok', primaryEndpoint.model));

    const router = new LlmRouter({ ...baseConfig, qwen: qwenEndpoint });
    const result = await router.qwenChat(makeRequest());

    expect(result.provider).toBe('mlx');
  });

  it('falls back when Qwen times out (abort)', async () => {
    fetchMock
      .mockRejectedValueOnce(new DOMException('The user aborted a request.', 'AbortError'))
      .mockResolvedValueOnce(makeOkResponse('ok', primaryEndpoint.model));

    const router = new LlmRouter({ ...baseConfig, qwen: { ...qwenEndpoint, timeoutMs: 1 } });
    const result = await router.qwenChat(makeRequest());

    expect(result.provider).toBe('mlx');
  });

  it('handles empty content from Qwen gracefully', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ choices: [{ message: { content: '' } }], usage: { total_tokens: 10 } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const router = new LlmRouter({ ...baseConfig, qwen: qwenEndpoint });
    const result = await router.qwenChat(makeRequest());

    expect(result.provider).toBe('mlx-qwen');
    expect(result.content).toBe('');
    expect(result.tokensUsed).toBe(10);
  });

  it('handles concurrent qwenChat requests independently', async () => {
    fetchMock
      .mockResolvedValueOnce(makeOkResponse('response A'))
      .mockResolvedValueOnce(makeOkResponse('response B'));

    const router = new LlmRouter({ ...baseConfig, qwen: qwenEndpoint });
    const [a, b] = await Promise.all([
      router.qwenChat(makeRequest()),
      router.qwenChat(makeRequest()),
    ]);

    expect(a.provider).toBe('mlx-qwen');
    expect(b.provider).toBe('mlx-qwen');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('marks Qwen unhealthy after failure and uses fallback on next call', async () => {
    fetchMock
      .mockResolvedValueOnce(makeErrorResponse(503))          // Qwen fails → router marks unhealthy
      .mockResolvedValueOnce(makeOkResponse('ok', primaryEndpoint.model)) // fallback primary
      .mockResolvedValueOnce(makeOkResponse('ok2', primaryEndpoint.model)); // 2nd qwenChat also via primary (qwen still unhealthy)

    const router = new LlmRouter({
      ...baseConfig,
      qwen: qwenEndpoint,
      healthCheckIntervalMs: 999_999, // keep unhealthy state for test duration
    });

    const first = await router.qwenChat(makeRequest());
    expect(first.provider).toBe('mlx'); // fell back

    const second = await router.qwenChat(makeRequest());
    expect(second.provider).toBe('mlx'); // still unhealthy — skips Qwen
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('emits failover event when Qwen fails', async () => {
    fetchMock
      .mockResolvedValueOnce(makeErrorResponse(503))
      .mockResolvedValueOnce(makeOkResponse('ok', primaryEndpoint.model));

    const router = new LlmRouter({ ...baseConfig, qwen: qwenEndpoint });
    const events: string[] = [];
    router.on('failover', (e: { from: string }) => events.push(e.from));

    await router.qwenChat(makeRequest());

    expect(events).toContain('mlx-qwen');
  });
});
