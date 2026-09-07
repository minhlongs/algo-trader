/**
 * Tests for position-manager — PositionManager class.
 *
 * Covers: constructor, openPosition, closePosition, markToMarket,
 * validatePosition, getPosition, getAllPositions, getExposureSummary,
 * closeAllPositions, updateExposureCache.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../shared/utils/logger', () => ({ logger: mockLogger }));

let mockRedis: Record<string, any>;

const { mockGetRedisClient } = vi.hoisted(() => ({
  mockGetRedisClient: vi.fn(),
}));
vi.mock('../../../redis', () => ({ getRedisClient: mockGetRedisClient }));

const { mockValidateExposureLimits, mockBuildExposureSummary } = vi.hoisted(() => ({
  mockValidateExposureLimits: vi.fn(),
  mockBuildExposureSummary: vi.fn(),
}));
vi.mock('../position-validation', () => ({
  validateExposureLimits: mockValidateExposureLimits,
  buildExposureSummary: mockBuildExposureSummary,
}));

import { PositionManager } from '../position-manager';
import type { ExposureSummary } from '../position-manager-types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeExposure(overrides: Partial<ExposureSummary> = {}): ExposureSummary {
  return {
    totalLong: 0, totalShort: 0, netExposure: 0,
    perSymbol: new Map(), perExchange: new Map(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRedis = {
    hset: vi.fn().mockResolvedValue(1),
    hgetall: vi.fn().mockResolvedValue(null),
    keys: vi.fn().mockResolvedValue([]),
    del: vi.fn().mockResolvedValue(1),
    set: vi.fn().mockResolvedValue('OK'),
  };
  mockGetRedisClient.mockReturnValue(mockRedis);
  mockBuildExposureSummary.mockResolvedValue(makeExposure());
  mockValidateExposureLimits.mockReturnValue({ valid: true, currentExposure: 0, newExposure: 1000 });
});

// ── Constructor ──────────────────────────────────────────────────────────────

describe('constructor', () => {
  it('uses default config values', () => {
    const mgr = new PositionManager();
    expect(mgr).toBeDefined();
  });

  it('applies partial config overrides', () => {
    const mgr = new PositionManager({ maxPositionPerSymbol: 50_000 });
    expect(mgr).toBeDefined();
  });
});

// ── openPosition ─────────────────────────────────────────────────────────────

describe('openPosition', () => {
  it('opens a valid long position', async () => {
    const mgr = new PositionManager();
    const result = await mgr.openPosition('BTC', 'binance', 'long', 1, 60_000);
    expect(result).toBe(true);
    expect(mockRedis.hset).toHaveBeenCalledWith(
      'position:BTC:binance',
      expect.objectContaining({ symbol: 'BTC', exchange: 'binance', side: 'long', amount: '1', entryPrice: '60000' }),
    );
    expect(mockRedis.set).toHaveBeenCalled();
  });

  it('opens a valid short position', async () => {
    const mgr = new PositionManager();
    const result = await mgr.openPosition('ETH', 'kraken', 'short', 2, 4000);
    expect(result).toBe(true);
    expect(mockRedis.hset).toHaveBeenCalledWith(
      'position:ETH:kraken',
      expect.objectContaining({ side: 'short', amount: '2', entryPrice: '4000', currentValue: '8000' }),
    );
  });

  it('rejects when validation fails', async () => {
    mockValidateExposureLimits.mockReturnValue({ valid: false, reason: 'Exceeds limit', currentExposure: 0, newExposure: 0 });
    const mgr = new PositionManager();
    const result = await mgr.openPosition('BTC', 'binance', 'long', 1000, 60_000);
    expect(result).toBe(false);
    expect(mockRedis.hset).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalled();
  });
});

// ── closePosition ────────────────────────────────────────────────────────────

describe('closePosition', () => {
  it('returns 0 when position does not exist', async () => {
    mockRedis.hgetall.mockResolvedValue(null);
    const mgr = new PositionManager();
    expect(await mgr.closePosition('BTC', 'binance', 60_000)).toBe(0);
    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  it('closes long position and returns positive PnL', async () => {
    mockRedis.hgetall.mockResolvedValue({ symbol: 'BTC', exchange: 'binance', side: 'long', amount: '1', entryPrice: '50000', currentValue: '50000', unrealizedPnl: '0', openedAt: '1' });
    const mgr = new PositionManager();
    const pnl = await mgr.closePosition('BTC', 'binance', 55_000);
    expect(pnl).toBe(5000);
    expect(mockRedis.del).toHaveBeenCalledWith('position:BTC:binance');
    expect(mockLogger.info).toHaveBeenCalled();
  });

  it('closes short position with exit price above entry (loss)', async () => {
    mockRedis.hgetall.mockResolvedValue({ symbol: 'ETH', exchange: 'kraken', side: 'short', amount: '2', entryPrice: '4000', currentValue: '8000', unrealizedPnl: '0', openedAt: '1' });
    const mgr = new PositionManager();
    const pnl = await mgr.closePosition('ETH', 'kraken', 4500);
    expect(pnl).toBe(-1000); // (4000-4500)*2 = -1000
  });

  it('closes short position with exit price below entry (profit)', async () => {
    mockRedis.hgetall.mockResolvedValue({ symbol: 'ETH', exchange: 'kraken', side: 'short', amount: '2', entryPrice: '4000', currentValue: '8000', unrealizedPnl: '0', openedAt: '1' });
    const mgr = new PositionManager();
    const pnl = await mgr.closePosition('ETH', 'kraken', 3500);
    expect(pnl).toBe(1000); // (4000-3500)*2 = 1000
  });
});

// ── markToMarket ─────────────────────────────────────────────────────────────

describe('markToMarket', () => {
  it('does nothing when position does not exist', async () => {
    mockRedis.hgetall.mockResolvedValue(null);
    const mgr = new PositionManager();
    await mgr.markToMarket('BTC', 'binance', 60_000);
    expect(mockRedis.hset).not.toHaveBeenCalled();
  });

  it('updates long position unrealized PnL', async () => {
    mockRedis.hgetall.mockResolvedValue({ symbol: 'BTC', exchange: 'binance', side: 'long', amount: '2', entryPrice: '50000', currentValue: '100000', unrealizedPnl: '0', openedAt: '1' });
    const mgr = new PositionManager();
    await mgr.markToMarket('BTC', 'binance', 55_000);
    expect(mockRedis.hset).toHaveBeenCalledWith('position:BTC:binance', {
      currentValue: '110000',
      unrealizedPnl: '10000', // (55000-50000)*2
    });
  });

  it('updates short position unrealized PnL', async () => {
    mockRedis.hgetall.mockResolvedValue({ symbol: 'ETH', exchange: 'kraken', side: 'short', amount: '2', entryPrice: '4000', currentValue: '8000', unrealizedPnl: '0', openedAt: '1' });
    const mgr = new PositionManager();
    await mgr.markToMarket('ETH', 'kraken', 3500);
    expect(mockRedis.hset).toHaveBeenCalledWith('position:ETH:kraken', {
      currentValue: '7000',
      unrealizedPnl: '1000', // (4000-3500)*2
    });
  });
});

// ── validatePosition ─────────────────────────────────────────────────────────

describe('validatePosition', () => {
  it('delegates to validateExposureLimits', async () => {
    const expected = { valid: true, currentExposure: 0, newExposure: 5000 };
    mockValidateExposureLimits.mockReturnValue(expected);
    const mgr = new PositionManager();
    const result = await mgr.validatePosition('BTC', 'binance', 'long', 5000);
    expect(result).toBe(expected);
    expect(mockValidateExposureLimits).toHaveBeenCalledTimes(1);
  });
});

// ── getPosition ──────────────────────────────────────────────────────────────

describe('getPosition', () => {
  it('returns null when no position exists', async () => {
    mockRedis.hgetall.mockResolvedValue(null);
    const mgr = new PositionManager();
    expect(await mgr.getPosition('BTC', 'binance')).toBeNull();
  });

  it('returns null when data has no symbol field', async () => {
    mockRedis.hgetall.mockResolvedValue({ amount: '1' });
    const mgr = new PositionManager();
    expect(await mgr.getPosition('BTC', 'binance')).toBeNull();
  });

  it('returns parsed position', async () => {
    mockRedis.hgetall.mockResolvedValue({ symbol: 'BTC', exchange: 'binance', side: 'long', amount: '1.5', entryPrice: '50000', currentValue: '75000', unrealizedPnl: '5000', openedAt: '1700000000000' });
    const mgr = new PositionManager();
    const pos = await mgr.getPosition('BTC', 'binance');
    expect(pos).toEqual({
      symbol: 'BTC', exchange: 'binance', side: 'long',
      amount: 1.5, entryPrice: 50000, currentValue: 75000,
      unrealizedPnl: 5000, openedAt: 1700000000000,
    });
  });
});

// ── getAllPositions ───────────────────────────────────────────────────────────

describe('getAllPositions', () => {
  it('returns empty array when no position keys exist', async () => {
    mockRedis.keys.mockResolvedValue([]);
    const mgr = new PositionManager();
    expect(await mgr.getAllPositions()).toEqual([]);
  });

  it('returns all positions', async () => {
    mockRedis.keys.mockResolvedValue(['position:BTC:binance', 'position:ETH:kraken']);
    mockRedis.hgetall
      .mockResolvedValueOnce({ symbol: 'BTC', exchange: 'binance', side: 'long', amount: '1', entryPrice: '50000', currentValue: '50000', unrealizedPnl: '0', openedAt: '1' })
      .mockResolvedValueOnce({ symbol: 'ETH', exchange: 'kraken', side: 'short', amount: '2', entryPrice: '4000', currentValue: '8000', unrealizedPnl: '0', openedAt: '2' });
    const mgr = new PositionManager();
    const positions = await mgr.getAllPositions();
    expect(positions).toHaveLength(2);
    expect(positions[0].symbol).toBe('BTC');
    expect(positions[1].symbol).toBe('ETH');
  });

  it('skips keys with no data', async () => {
    mockRedis.keys.mockResolvedValue(['position:BTC:binance']);
    mockRedis.hgetall.mockResolvedValue(null);
    const mgr = new PositionManager();
    expect(await mgr.getAllPositions()).toEqual([]);
  });

  it('skips keys with empty amount', async () => {
    mockRedis.keys.mockResolvedValue(['position:BTC:binance']);
    mockRedis.hgetall.mockResolvedValue({ symbol: 'BTC', exchange: 'binance' }); // no amount
    const mgr = new PositionManager();
    expect(await mgr.getAllPositions()).toEqual([]);
  });
});

// ── getExposureSummary ───────────────────────────────────────────────────────

describe('getExposureSummary', () => {
  it('delegates to buildExposureSummary', async () => {
    const summary = makeExposure({ totalLong: 5000 });
    mockBuildExposureSummary.mockResolvedValue(summary);
    const mgr = new PositionManager();
    const result = await mgr.getExposureSummary();
    expect(result).toBe(summary);
  });
});

// ── closeAllPositions ────────────────────────────────────────────────────────

describe('closeAllPositions', () => {
  it('returns 0 when no positions exist', async () => {
    mockRedis.keys.mockResolvedValue([]);
    const mgr = new PositionManager();
    expect(await mgr.closeAllPositions(new Map())).toBe(0);
  });

  it('closes all positions using provided exit prices', async () => {
    mockRedis.keys.mockResolvedValue(['position:BTC:binance']);
    mockRedis.hgetall.mockResolvedValue({ symbol: 'BTC', exchange: 'binance', side: 'long', amount: '1', entryPrice: '50000', currentValue: '50000', unrealizedPnl: '0', openedAt: '1' });
    const mgr = new PositionManager();
    const totalPnl = await mgr.closeAllPositions(new Map([['BTC:binance', 55000]]));
    expect(totalPnl).toBe(5000);
    expect(mockRedis.del).toHaveBeenCalledWith('position:BTC:binance');
  });

  it('falls back to entryPrice when exit price not provided', async () => {
    mockRedis.keys.mockResolvedValue(['position:ETH:kraken']);
    mockRedis.hgetall.mockResolvedValue({ symbol: 'ETH', exchange: 'kraken', side: 'short', amount: '2', entryPrice: '4000', currentValue: '8000', unrealizedPnl: '0', openedAt: '1' });
    const mgr = new PositionManager();
    const totalPnl = await mgr.closeAllPositions(new Map());
    expect(totalPnl).toBe(0); // exitPrice === entryPrice → 0
  });
});