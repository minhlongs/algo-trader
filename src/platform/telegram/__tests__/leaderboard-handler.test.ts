/**
 * Tests for the /leaderboard command handler.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Import after mocks
import type { Context } from 'grammy';

const MODULE_PATH = '../leaderboard-handler';

describe('handleLeaderboard', () => {
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
    } as unknown as Context;

    mockFetch.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('should call leaderboard API with Bearer token and correct query params', async () => {
    const { handleLeaderboard } = await import(MODULE_PATH);

    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          strategies: [
            { name: 'AlphaStrategy', winRate: 0.72, sharpe: 1.45 },
            { name: 'BetaTrader', winRate: 0.68, sharpe: 1.22 },
            { name: 'GammaFund', winRate: 0.65, sharpe: 1.35 },
            { name: 'DeltaSys', winRate: 0.61, sharpe: 1.10 },
            { name: 'EpsilonBot', winRate: 0.58, sharpe: 0.95 },
          ],
        }),
    });

    await handleLeaderboard(ctx);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/v1/leaderboard');
    expect(url).toContain('sort=winRate');
    expect(url).toContain('limit=5');
    expect(options.headers.Authorization).toBe('Bearer test-api-key');
  });

  it('should format top 5 strategies as markdown with win rate and sharpe', async () => {
    const { handleLeaderboard } = await import(MODULE_PATH);

    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          strategies: [
            { name: 'AlphaStrategy', winRate: 0.72, sharpe: 1.45 },
            { name: 'BetaTrader', winRate: 0.68, sharpe: 1.22 },
            { name: 'GammaFund', winRate: 0.65, sharpe: 1.35 },
            { name: 'DeltaSys', winRate: 0.61, sharpe: 1.10 },
            { name: 'EpsilonBot', winRate: 0.58, sharpe: 0.95 },
          ],
        }),
    });

    await handleLeaderboard(ctx);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const [message, opts] = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0];

    // Should include the heading
    expect(message).toContain('Top Strategies');

    // Each entry should be numbered and formatted
    expect(message).toContain('1. AlphaStrategy');
    expect(message).toContain('72% win rate');
    expect(message).toContain('Sharpe 1.45');

    expect(message).toContain('5. EpsilonBot');
    expect(message).toContain('58% win rate');
    expect(message).toContain('Sharpe 0.95');

    // Should use MarkdownV2 parse mode
    expect(opts.parse_mode).toBe('MarkdownV2');
  });

  it('should handle empty strategies list', async () => {
    const { handleLeaderboard } = await import(MODULE_PATH);

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ strategies: [] }),
    });

    await handleLeaderboard(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('No strategies found'),
      expect.any(Object),
    );
  });

  it('should handle missing strategies field', async () => {
    const { handleLeaderboard } = await import(MODULE_PATH);

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await handleLeaderboard(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('No strategies found'),
      expect.any(Object),
    );
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
