/**
 * Tests for the /ask command handler — Errors & edge cases.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Context } from 'grammy';
import { MODULE_PATH, createMockContext, setupEnv, restoreEnv } from './ask-handler-fixtures';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('handleAsk — errors & edge cases', () => {
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

  it('should handle API error gracefully', async () => {
    const { handleAsk } = await import(MODULE_PATH);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    });

    await handleAsk(ctx, 'what is my risk?');

    expect(ctx.reply).toHaveBeenCalledWith(
      'Sorry, I could not process your request. Please try again later.',
    );
  });

  it('should handle rate limit (429) specifically', async () => {
    const { handleAsk } = await import(MODULE_PATH);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('Too Many Requests'),
    });

    await handleAsk(ctx, 'what is my risk?');

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('rate limit'),
      { parse_mode: 'Markdown' },
    );
  });

  it('should handle tier gate (403) specifically', async () => {
    const { handleAsk } = await import(MODULE_PATH);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve('Forbidden'),
    });

    await handleAsk(ctx, 'what is my risk?');

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('PRO'),
      { parse_mode: 'Markdown' },
    );
  });

  it('should handle missing API key', async () => {
    const { handleAsk } = await import(MODULE_PATH);
    delete process.env.TELEGRAM_COPILOT_API_KEY;

    await handleAsk(ctx, 'test query');

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('not configured'),
      expect.any(Object),
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should handle network errors', async () => {
    const { handleAsk } = await import(MODULE_PATH);
    mockFetch.mockRejectedValue(new Error('Network error'));

    await handleAsk(ctx, 'test query');

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('error occurred'),
    );
  });

  it('should handle request timeout via AbortController', async () => {
    const { handleAsk } = await import(MODULE_PATH);
    mockFetch.mockRejectedValue(new DOMException('Aborted', 'AbortError'));

    await handleAsk(ctx, 'test query');

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('timed out'),
    );
  });
});
