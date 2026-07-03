/**
 * Tests for the /ask command handler.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Import after mocks
// We need to mock process.env before importing ask-handler
// Only import types since we're testing via mock fetch
import type { Context } from 'grammy';

// The module to test
const MODULE_PATH = '../ask-handler';

describe('handleAsk', () => {
  let ctx: Context;
  let originalEnv: NodeJS.ProcessEnv;

  function setEnv(apiKey: string, baseUrl = 'http://localhost:3000'): void {
    process.env.TELEGRAM_COPILOT_API_KEY = apiKey;
    process.env.API_BASE_URL = baseUrl;
  }

  beforeEach(() => {
    originalEnv = { ...process.env };
    setEnv('test-api-key');

    ctx = {
      reply: vi.fn(),
      replyWithChatAction: vi.fn(),
    } as unknown as Context;

    mockFetch.mockReset();

    // Dynamic import to get fresh module state
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('should show help text when query is empty', async () => {
    // This path is handled in bot.ts before calling handleAsk,
    // but handleAsk should handle empty query gracefully
    const { handleAsk } = await import(MODULE_PATH);

    const mockResponse = { answer: 'test', ok: true };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    await handleAsk(ctx, '');
    // Should send to API anyway (bot.ts checks for empty query before calling)
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should call co-pilot API with Bearer token', async () => {
    const { handleAsk } = await import(MODULE_PATH);

    const mockResponse = { answer: 'Your risk score is 3.2/10 (low).' };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    await handleAsk(ctx, 'what is my risk exposure?');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/v1/co-pilot/ask');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer test-api-key');
    expect(options.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(options.body);
    expect(body.query).toBe('what is my risk exposure?');
    expect(body.context.source).toBe('telegram');
  });

  it('should reply with API response formatted as markdown', async () => {
    const { handleAsk } = await import(MODULE_PATH);

    const mockResponse = {
      answer: '**Risk Assessment**\n- Score: 3.2/10 (low)\n- Drawdown: 4.2%',
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    await handleAsk(ctx, 'what is my risk exposure?');

    expect(ctx.reply).toHaveBeenCalledWith(
      mockResponse.answer,
      { parse_mode: 'Markdown' },
    );
  });

  it('should show typing indicator before API call', async () => {
    const { handleAsk } = await import(MODULE_PATH);

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ answer: 'ok' }),
    });

    await handleAsk(ctx, 'test query');

    expect(ctx.replyWithChatAction).toHaveBeenCalledWith('typing');
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

    // Simulate abort
    mockFetch.mockRejectedValue(new DOMException('Aborted', 'AbortError'));

    await handleAsk(ctx, 'test query');

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('timed out'),
    );
  });

  it('should truncate responses over 4000 characters', async () => {
    const { handleAsk } = await import(MODULE_PATH);

    const longAnswer = 'x'.repeat(5000);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ answer: longAnswer }),
    });

    await handleAsk(ctx, 'test');

    // Should be truncated to 4000 chars
    const replyArg = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(replyArg.length).toBeLessThanOrEqual(4003); // 4000 + '...'
    expect(replyArg.endsWith('...')).toBe(true);
  });
});
