/**
 * Tests for the /leaderboard command handler — Errors & edge cases.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Context } from 'grammy';
import {
  MODULE_PATH,
  createMockContext,
  setupEnv,
  restoreEnv,
} from './leaderboard-handler-fixtures';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('handleLeaderboard — errors & edge cases', () => {
  let ctx: Context;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    setupEnv('test-api-key');
    const mockCtx = createMockContext();
    ctx = mockCtx.ctx;
    mockFetch.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    restoreEnv(originalEnv);
    vi.restoreAllMocks();
  });

  it('should handle missing API key', async () => {
    const { handleLeaderboard } = await import(MODULE_PATH);
    delete process.env.TELEGRAM_COPILOT_API_KEY;

    await handleLeaderboard(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('not available'),
      expect.any(Object),
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should handle API error (500) gracefully', async () => {
    const { handleLeaderboard } = await import(MODULE_PATH);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    });

    await handleLeaderboard(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('could not fetch'),
    );
  });

  it('should handle rate limit (429) specifically', async () => {
    const { handleLeaderboard } = await import(MODULE_PATH);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('Too Many Requests'),
    });

    await handleLeaderboard(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Too many requests'),
      expect.any(Object),
    );
  });

  it('should handle tier gate (403) specifically', async () => {
    const { handleLeaderboard } = await import(MODULE_PATH);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve('Forbidden'),
    });

    await handleLeaderboard(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('PRO'),
      expect.any(Object),
    );
  });

  it('should handle network errors', async () => {
    const { handleLeaderboard } = await import(MODULE_PATH);
    mockFetch.mockRejectedValue(new Error('Network error'));

    await handleLeaderboard(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('error occurred'),
    );
  });

  it('should handle request timeout via AbortController', async () => {
    const { handleLeaderboard } = await import(MODULE_PATH);
    mockFetch.mockRejectedValue(new DOMException('Aborted', 'AbortError'));

    await handleLeaderboard(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('timed out'),
    );
  });
});
