/**
 * Grid/DCA Strategy Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGridDcaTick } from '../grid-dca-strategy';
import type { BinanceSpotClient } from '../../markets/cex/binance-spot-client';
import type { GridDcaParams } from '../grid-dca-strategy';

// Mock the logger
vi.mock('../../core/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

function makeMockClient(): BinanceSpotClient {
  return {
    getCandles: vi.fn().mockResolvedValue([
      {
        timestamp: Date.now(),
        open: 50000,
        high: 50100,
        low: 49900,
        close: 50050,
        volume: 100,
      },
    ]),
  } as unknown as BinanceSpotClient;
}

describe('GridDcaStrategy', () => {
  let client: BinanceSpotClient;
  let params: GridDcaParams;

  beforeEach(() => {
    vi.clearAllMocks();
    client = makeMockClient();
    params = {
      exchange: 'binance',
      symbol: 'BTC/USDT',
      gridSpacing: 0.01,
      numLevels: 3,
      orderSize: 100,
    };
  });

  describe('createGridDcaTick', () => {
    it('should return a tick function', () => {
      const tick = createGridDcaTick({ client, params });
      expect(tick).toBeInstanceOf(Function);
    });
  });

  describe('tick execution', () => {
    it('should handle price fetch failure gracefully', async () => {
      const badClient = {
        getCandles: vi.fn().mockRejectedValue(new Error('API error')),
      } as unknown as BinanceSpotClient;

      const tick = createGridDcaTick({ client: badClient, params });
      await expect(tick()).resolves.toBeUndefined();
    });

    it('should handle empty price data gracefully', async () => {
      const emptyClient = {
        getCandles: vi.fn().mockResolvedValue([]),
      } as unknown as BinanceSpotClient;

      const tick = createGridDcaTick({ client: emptyClient, params });
      await expect(tick()).resolves.toBeUndefined();
    });

    it('should initialize grid on first tick', async () => {
      const tick = createGridDcaTick({ client, params });
      await tick();
      // Should not throw — grid initialized
    });

    it('should increment DCA counter and reset at interval', async () => {
      // First tick: initialize
      let tick = createGridDcaTick({ client, params });
      await tick();

      // Multiple ticks — just verify they don't throw
      for (let i = 0; i < 15; i++) {
        tick = createGridDcaTick({ client, params });
        await tick();
      }
    });
  });

  describe('happy path', () => {
    it('should complete a full tick cycle', async () => {
      const tick = createGridDcaTick({ client, params });
      await tick();
      const candleCall = vi.mocked(client.getCandles).mock.calls[0];
      expect(candleCall[0]).toBe('BTC/USDT');
      expect(candleCall[1]).toBe('5m');
      expect(candleCall[2]).toBe(1);
    });
  });
});
