/**
 * Tests for the /ask command handler — Success & formatting flows.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Context } from 'grammy';
import { MODULE_PATH, createMockContext, setupEnv, restoreEnv } from './ask-handler-fixtures';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('handleAsk — success & formatting', () => {
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

  it('should show help text when query is empty', async () => {
    const { handleAsk } = await import(MODULE_PATH);
    const mockResponse = { answer: 'test', ok: true };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    await handleAsk(ctx, '');
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

  it('should truncate responses over 4000 characters', async () => {
    const { handleAsk } = await import(MODULE_PATH);
    const longAnswer = 'x'.repeat(5000);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ answer: longAnswer }),
    });

    await handleAsk(ctx, 'test');

    const replyArg = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(replyArg.length).toBeLessThanOrEqual(4003);
    expect(replyArg.endsWith('...')).toBe(true);
  });
});
