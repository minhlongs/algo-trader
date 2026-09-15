/**
 * Tests for the /leaderboard command handler — Success & formatting.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Context } from 'grammy';
import {
  MODULE_PATH,
  createMockContext,
  setupEnv,
  restoreEnv,
  getSampleStrategiesPayload,
} from './leaderboard-handler-fixtures';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('handleLeaderboard — success & formatting', () => {
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

  it('should call leaderboard API with Bearer token and correct query params', async () => {
    const { handleLeaderboard } = await import(MODULE_PATH);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(getSampleStrategiesPayload()),
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
      json: () => Promise.resolve(getSampleStrategiesPayload()),
    });

    await handleLeaderboard(ctx);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const [message, opts] = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0];

    expect(message).toContain('Top Strategies');
    expect(message).toContain('1. AlphaStrategy');
    expect(message).toContain('72% win rate');
    expect(message).toContain('Sharpe 1.45');
    expect(message).toContain('5. EpsilonBot');
    expect(message).toContain('58% win rate');
    expect(message).toContain('Sharpe 0.95');
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
});
