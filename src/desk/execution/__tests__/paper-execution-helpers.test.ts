/**
 * Paper Execution Helpers Unit Tests
 *
 * Verifies dynamic orderbook depth consumption, VWAP pricing,
 * partial fills, slippage, fees, and scalar price fallback.
 */

import { describe, it, expect } from 'vitest';
import { executeBuy, executeSell } from '../paper-execution-helpers';
import type { PaperAccount, PaperPosition, PaperExecutorConfig, OrderbookSnapshot } from '../paper-position-types';

describe('paper-execution-helpers', () => {
  const config: PaperExecutorConfig = {
    initialBalance: 10_000,
    slippagePercent: 0.001, // 10 bps
    feePercent: 0.002, // 20 bps
    simulateFillRate: 1.0,
  };

  const createAccount = (balance = 10_000): PaperAccount => ({
    balance, equity: balance, cashReserves: balance, marginUsed: 0, marginUtilization: 0,
    unrealizedPnl: 0, realizedPnl: 0, totalTrades: 0, winningTrades: 0, losingTrades: 0,
  });

  describe('executeBuy', () => {
    it('falls back to flat slippage when no orderbook is supplied', () => {
      const account = createAccount(10_000);
      const res = executeBuy('BTC/USDT', 0.1, 50_000, account, [], config);

      expect(res.trade.status).toBe('filled');
      expect(res.trade.requestedPrice).toBe(50_000);
      expect(res.trade.executedPrice).toBeCloseTo(50_050, 2); // 50000 + 10 bps
      expect(res.trade.slippage).toBeCloseTo(50, 2);
      expect(res.trade.quantity).toBe(0.1);
      expect(res.newPositions).toHaveLength(1);
      expect(res.newPositions[0]!.quantity).toBe(0.1);
    });

    it('consumes ascending asks and computes exact VWAP and slippage', () => {
      const account = createAccount(20_000);
      const orderbook: OrderbookSnapshot = {
        symbol: 'BTC/USDT',
        bids: [],
        asks: [
          { price: 50_200, size: 0.06 },
          { price: 50_000, size: 0.04 },
        ],
      };

      const res = executeBuy('BTC/USDT', 0.1, 50_000, account, [], config, orderbook);

      expect(res.trade.status).toBe('filled');
      expect(res.trade.quantity).toBe(0.1);
      expect(res.trade.executedPrice).toBeCloseTo(50_120, 2);
      expect(res.trade.fee).toBeCloseTo(5012 * 0.002, 4);
      expect(res.trade.slippage).toBeCloseTo(120, 2);
      expect(res.newBalance).toBeCloseTo(20_000 - (5012 + 5012 * 0.002), 2);
      expect(res.newPositions[0]!.entryPrice).toBeCloseTo(50_120, 2);
    });

    it('handles partial fills when asks depth is insufficient', () => {
      const account = createAccount(10_000);
      const orderbook: OrderbookSnapshot = { symbol: 'ETH/USDT', bids: [], asks: [{ price: 3_000, size: 0.75 }] };
      const res = executeBuy('ETH/USDT', 1.0, 3_000, account, [], config, orderbook);

      expect(res.trade.status).toBe('partial');
      expect(res.trade.quantity).toBe(0.75);
      expect(res.trade.executedPrice).toBe(3_000);
      expect(res.newPositions[0]!.quantity).toBe(0.75);
    });

    it('rejects order cleanly when book has zero liquidity', () => {
      const account = createAccount(10_000);
      const orderbook: OrderbookSnapshot = { symbol: 'SOL/USDT', bids: [], asks: [] };
      const res = executeBuy('SOL/USDT', 1.0, 100, account, [], config, orderbook);

      expect(res.trade.status).toBe('rejected');
      expect(res.trade.quantity).toBe(0);
      expect(res.newBalance).toBe(10_000);
      expect(res.newPositions).toHaveLength(0);
    });
  });

  describe('executeSell', () => {
    const createPositions = (qty = 0.5): PaperPosition[] => [{
      symbol: 'BTC/USDT', side: 'long', quantity: qty, entryPrice: 48_000,
      currentPrice: 50_000, unrealizedPnl: 1000, openedAt: Date.now() - 1000,
    }];

    it('throws when selling non-existent position', () => {
      const account = createAccount(10_000);
      expect(() => executeSell('ETH/USDT', 1, 3000, account, createPositions(), config)).toThrow(/No position found/);
    });

    it('falls back to flat slippage when no orderbook is supplied', () => {
      const account = createAccount(10_000);
      const res = executeSell('BTC/USDT', 0.2, 50_000, account, createPositions(), config);

      expect(res.trade.status).toBe('filled');
      expect(res.trade.executedPrice).toBeCloseTo(49_950, 2); // 50000 - 10 bps
      expect(res.trade.slippage).toBeCloseTo(50, 2);
      expect(res.trade.quantity).toBe(0.2);
      expect(res.newPositions[0]!.quantity).toBeCloseTo(0.3, 4);
      expect(res.winningTradesDelta).toBe(1);
    });

    it('consumes descending bids and calculates VWAP and realized PnL', () => {
      const account = createAccount(10_000);
      const orderbook: OrderbookSnapshot = {
        symbol: 'BTC/USDT',
        bids: [
          { price: 49_800, size: 0.15 },
          { price: 50_000, size: 0.10 },
        ],
        asks: [],
      };

      const res = executeSell('BTC/USDT', 0.2, 50_000, account, createPositions(), config, orderbook);

      expect(res.trade.status).toBe('filled');
      expect(res.trade.quantity).toBe(0.2);
      expect(res.trade.executedPrice).toBeCloseTo(49_900, 2);
      expect(res.trade.slippage).toBeCloseTo(100, 2);
      const fee = 9980 * 0.002;
      const expectedPnl = (49900 - 48000) * 0.2 - fee;
      expect(res.trade.pnl).toBeCloseTo(expectedPnl, 2);
      expect(res.realizedPnlDelta).toBeCloseTo(expectedPnl, 2);
      expect(res.newPositions[0]!.quantity).toBeCloseTo(0.3, 4);
    });

    it('supports partial sell fills when bids are partially exhausted', () => {
      const account = createAccount(10_000);
      const orderbook: OrderbookSnapshot = { symbol: 'BTC/USDT', bids: [{ price: 51_000, size: 0.1 }], asks: [] };
      const res = executeSell('BTC/USDT', 0.3, 51_000, account, createPositions(), config, orderbook);

      expect(res.trade.status).toBe('partial');
      expect(res.trade.quantity).toBe(0.1);
      expect(res.newPositions[0]!.quantity).toBeCloseTo(0.4, 4);
    });

    it('rejects sell cleanly when bids have 0 liquidity', () => {
      const account = createAccount(10_000);
      const orderbook: OrderbookSnapshot = { symbol: 'BTC/USDT', bids: [], asks: [] };
      const res = executeSell('BTC/USDT', 0.1, 50_000, account, createPositions(), config, orderbook);

      expect(res.trade.status).toBe('rejected');
      expect(res.trade.quantity).toBe(0);
      expect(res.realizedPnlDelta).toBe(0);
    });
  });
});
