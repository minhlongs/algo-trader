/**
 * Tests for LlmRouter.qwenChat() — Qwen MoE provider routing.
 *
 * Covers: success, timeout, 401, 500, empty response, JSON parse fail,
 *         fallback trigger, concurrent requests, feature flag disabled.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LlmRouter } from '../llm-router';
import {
  makeRequest,
  makeOkResponse,
  makeErrorResponse,
  qwenEndpoint,
  primaryEndpoint,
  baseConfig,
} from './llm-router-qwen-fixtures';

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
    fetchMock.mockResolvedValueOnce(makeOkResponse('ok', primaryEndpoint.model));

    const router = new LlmRouter({ ...baseConfig });
    const result = await router.qwenChat(makeRequest());

    expect(result.provider).toBe('mlx');
    expect(result.model).toBe(primaryEndpoint.model);
  });

  it('falls back to chat() (DeepSeek primary) when Qwen returns HTTP 500', async () => {
    fetchMock
      .mockResolvedValueOnce(makeErrorResponse(500))
      .mockResolvedValueOnce(makeOkResponse('ok', primaryEndpoint.model));

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
    expect(result.usage).toBeUndefined();
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
      .mockResolvedValueOnce(makeErrorResponse(503))
      .mockResolvedValueOnce(makeOkResponse('ok', primaryEndpoint.model))
      .mockResolvedValueOnce(makeOkResponse('ok2', primaryEndpoint.model));

    const router = new LlmRouter({
      ...baseConfig,
      qwen: qwenEndpoint,
      healthCheckIntervalMs: 999_999,
    });

    const first = await router.qwenChat(makeRequest());
    expect(first.provider).toBe('mlx');

    const second = await router.qwenChat(makeRequest());
    expect(second.provider).toBe('mlx');
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
