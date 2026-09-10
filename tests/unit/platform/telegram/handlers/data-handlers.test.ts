/**
 * Tests for data-handlers — /balance, /positions, /pnl, /results.
 *
 * Mocks getRedisClient (ioredis) and userSessionRepo so no real DB/Redis
 * is touched. Covers the "no license keys linked" early-return branch, the
 * empty-positions branch, and the full happy-path formatting.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Context } from 'grammy';

const { mockRedisGet, mockRedisHgetall, mockSessionGetByUserId } = vi.hoisted(() => ({
  mockRedisGet: vi.fn(),
  mockRedisHgetall: vi.fn(),
  mockSessionGetByUserId: vi.fn(),
}));

// Path is relative to the __tests__ directory: ../../../../redis
vi.mock('../../../../../src/redis', () => ({
  getRedisClient: () => ({ get: mockRedisGet, hgetall: mockRedisHgetall }),
}));

vi.mock('../../../../../src/platform/telegram/user-session-repository-d1', () => ({
  userSessionRepo: { getByUserId: mockSessionGetByUserId },
}));

import { handleBalance, handlePositions, handlePnl, handleResults } from '../../../../../src/platform/telegram/handlers/data-handlers';

function makeCtx() {
  return { reply: vi.fn().mockResolvedValue(undefined) } as unknown as Context;
}

describe('data-handlers', () => {
  beforeEach(() => {
    mockRedisGet.mockReset();
    mockRedisHgetall.mockReset();
    mockSessionGetByUserId.mockReset();
  });

  afterEach(() => {
    // vi.hoisted mocks are vi.fn() not vi.spyOn — clear, never restore.
    vi.clearAllMocks();
  });

  describe('handleBalance', () => {
    it('returns early when user has no id', async () => {
      const ctx = { reply: vi.fn() } as unknown as Context;
      await handleBalance({ from: undefined } as unknown as Context);
      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it('prompts to link a key when session is missing', async () => {
      mockSessionGetByUserId.mockResolvedValue(undefined);
      const ctx = makeCtx();
      await handleBalance({ ...ctx, from: { id: 42 } } as unknown as Context);
      const msg = ctx.reply.mock.calls[0][0] as string;
      expect(msg).toContain('No license keys linked');
      expect(msg).toContain('/link');
    });

    it('prompts to link a key when session has no keys', async () => {
      mockSessionGetByUserId.mockResolvedValue({ licenseKeys: [] });
      const ctx = makeCtx();
      await handleBalance({ ...ctx, from: { id: 1 } } as unknown as Context);
      const msg = ctx.reply.mock.calls[0][0] as string;
      expect(msg).toContain('No license keys linked');
    });

    it('formats balance markdown from redis hgetall', async () => {
      mockSessionGetByUserId.mockResolvedValue({ licenseKeys: ['L1'] });
      mockRedisHgetall.mockResolvedValue({ balance: '1000.5', equity: '1100.25' });
      const ctx = makeCtx();
      await handleBalance({ ...ctx, from: { id: 1 } } as unknown as Context);
      const msg = ctx.reply.mock.calls[0][0] as string;
      expect(msg).toContain('$1000.50');
      expect(msg).toContain('$1100.25');
    });

    it('falls back to balance for equity when equity missing', async () => {
      mockSessionGetByUserId.mockResolvedValue({ licenseKeys: ['L1'] });
      mockRedisHgetall.mockResolvedValue({ balance: '500' });
      const ctx = makeCtx();
      await handleBalance({ ...ctx, from: { id: 1 } } as unknown as Context);
      const msg = ctx.reply.mock.calls[0][0] as string;
      expect(msg).toContain('$500.00');
    });
  });

  describe('handlePositions', () => {
    it('prompts to link a key when session is missing', async () => {
      mockSessionGetByUserId.mockResolvedValue(undefined);
      const ctx = makeCtx();
      await handlePositions({ ...ctx, from: { id: 1 } } as unknown as Context);
      const msg = ctx.reply.mock.calls[0][0] as string;
      expect(msg).toContain('No license keys linked');
    });

    it('reports empty positions when no positions stored', async () => {
      mockSessionGetByUserId.mockResolvedValue({ licenseKeys: ['L1'] });
      mockRedisGet.mockResolvedValue(null);
      const ctx = makeCtx();
      await handlePositions({ ...ctx, from: { id: 1 } } as unknown as Context);
      const msg = ctx.reply.mock.calls[0][0] as string;
      expect(msg).toContain('No open positions');
    });

    it('formats each position with symbol, side and P&L', async () => {
      mockSessionGetByUserId.mockResolvedValue({ licenseKeys: ['L1'] });
      mockRedisGet.mockResolvedValue(
        JSON.stringify([
          {
            symbol: 'BTC/USDT',
            side: 'long',
            quantity: 1.5,
            entryPrice: 30000,
            currentPrice: 31000,
            unrealizedPnl: 1500,
          },
        ]),
      );
      const ctx = makeCtx();
      await handlePositions({ ...ctx, from: { id: 1 } } as unknown as Context);
      const msg = ctx.reply.mock.calls[0][0] as string;
      expect(msg).toContain('BTC/USDT');
      expect(msg).toContain('LONG');
      expect(msg).toContain('$1500.00');
    });
  });

  describe('handlePnl', () => {
    it('prompts to link a key when session is missing', async () => {
      mockSessionGetByUserId.mockResolvedValue(undefined);
      const ctx = makeCtx();
      await handlePnl({ ...ctx, from: { id: 1 } } as unknown as Context);
      const msg = ctx.reply.mock.calls[0][0] as string;
      expect(msg).toContain('No license keys linked');
    });

    it('aggregates realized/unrealized/trades/wins across keys', async () => {
      mockSessionGetByUserId.mockResolvedValue({ licenseKeys: ['L1', 'L2'] });
      mockRedisHgetall
        .mockResolvedValueOnce({
          realized: '500',
          unrealized: '100',
          totalTrades: '10',
          winningTrades: '7',
        })
        .mockResolvedValueOnce({
          realized: '200',
          unrealized: '50',
          totalTrades: '5',
          winningTrades: '2',
        });
      const ctx = makeCtx();
      await handlePnl({ ...ctx, from: { id: 1 } } as unknown as Context);
      const msg = ctx.reply.mock.calls[0][0] as string;
      expect(msg).toContain('$700.00');
      expect(msg).toContain('$150.00');
      expect(msg).toContain('$850.00');
      expect(msg).toContain('Trades:* 15');
      expect(msg).toContain('Wins:* 9');
      expect(msg).toContain('Losses:* 6');
      expect(msg).toContain('Win Rate:* 60.0%');
    });

    it('skips keys with no P&L data and reports zero totals', async () => {
      mockSessionGetByUserId.mockResolvedValue({ licenseKeys: ['L1'] });
      mockRedisHgetall.mockResolvedValue({ realized: null });
      const ctx = makeCtx();
      await handlePnl({ ...ctx, from: { id: 1 } } as unknown as Context);
      const msg = ctx.reply.mock.calls[0][0] as string;
      expect(msg).toContain('$0.00');
      expect(msg).toContain('Trades:* 0');
      expect(msg).toContain('Win Rate:* 0%');
    });
  });

  describe('handleResults', () => {
    it('prompts to link a key when session is missing', async () => {
      mockSessionGetByUserId.mockResolvedValue(undefined);
      const ctx = makeCtx();
      await handleResults({ ...ctx, from: { id: 1 } } as unknown as Context);
      const msg = ctx.reply.mock.calls[0][0] as string;
      expect(msg).toContain('No license keys linked');
    });

    it('reports aggregated subscription results across all keys', async () => {
      mockSessionGetByUserId.mockResolvedValue({ licenseKeys: ['L1', 'L2'] });
      mockRedisHgetall
        .mockResolvedValueOnce({
          realized: '300',
          unrealized: '40',
          totalTrades: '8',
          winningTrades: '6',
        })
        .mockResolvedValueOnce({
          realized: '100',
          unrealized: '20',
          totalTrades: '4',
          winningTrades: '1',
        });
      const ctx = makeCtx();
      await handleResults({ ...ctx, from: { id: 1 } } as unknown as Context);
      const msg = ctx.reply.mock.calls[0][0] as string;
      expect(msg).toContain('Subscription Results');
      expect(msg).toContain('Across:* 2 linked key(s)');
      expect(msg).toContain('$400.00');
      expect(msg).toContain('$60.00');
      expect(msg).toContain('$460.00');
      expect(msg).toContain('Trades:* 12');
      expect(msg).toContain('Win Rate:* 58.3%');
    });
  });
});