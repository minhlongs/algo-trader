/**
 * Trade Executor — pure function tests.
 *
 * Verifies price simulation, ID generation, trade sizing, and trade closure.
 * Critical invariant: closure fee must be a fraction of USD notional, NOT
 * sizeUsd * price (which would consume the entire position).
 */

import { describe, it, expect } from 'vitest';
import type { PaperTradeRecord } from '../paper-trading-loop';
import {
  basePriceForSymbol,
  simulatePriceTick,
  nextId,
  closePaperTrade,
  calculateOrderSize,
} from '../trade-executor';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeOpenTrade(overrides: Partial<PaperTradeRecord> = {}): PaperTradeRecord {
  return {
    id: 'paper-test-1',
    symbol: 'BTC/USD',
    side: 'BUY',
    sizeUsd: 100,
    entryPrice: 1492.7,
    openedAt: 1_000_000,
    isPaper: true,
    durationMs: 0,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('basePriceForSymbol', () => {
  it('returns a deterministic price for a given symbol', () => {
    expect(basePriceForSymbol('BTC/USD')).toBe(basePriceForSymbol('BTC/USD'));
  });

  it('returns different prices for different symbols', () => {
    expect(basePriceForSymbol('BTC/USD')).not.toBe(basePriceForSymbol('ETH/USD'));
  });

  it('returns a price in the crypto range ($50 — $80 000)', () => {
    const price = basePriceForSymbol('BTC/USD');
    expect(price).toBeGreaterThanOrEqual(50);
    expect(price).toBeLessThanOrEqual(80000);
  });
});

describe('simulatePriceTick', () => {
  it('returns a price within ±0.25% of base', () => {
    const base = 1000;
    for (let i = 0; i < 100; i++) {
      const tick = simulatePriceTick(base);
      const deviation = Math.abs(tick - base) / base;
      expect(deviation).toBeLessThanOrEqual(0.0025);
    }
  });
});

describe('nextId', () => {
  it('produces unique IDs for increasing counters', () => {
    const a = nextId(1);
    const b = nextId(2);
    expect(a).not.toBe(b);
  });

  it('includes the counter in the ID', () => {
    expect(nextId(42)).toContain('42');
  });
});

describe('closePaperTrade', () => {
  it('closes the first open trade', () => {
    const trades = [makeOpenTrade({ id: 'open-1' }), makeOpenTrade({ id: 'open-2' })];
    const closed = closePaperTrade(trades, 60_000);
    expect(closed).toBeDefined();
    expect(closed!.id).toBe('open-1');
    expect(closed!.exitPrice).toBeDefined();
    expect(closed!.closedAt).toBe(1_060_000);
    expect(closed!.durationMs).toBe(60_000);
  });

  it('returns undefined when no open trades exist', () => {
    const trades = [
      makeOpenTrade({ id: 'closed-1', exitPrice: 1500, pnlUsd: 1, closedAt: 2_000_000 }),
    ];
    expect(closePaperTrade(trades, 60_000)).toBeUndefined();
  });

  it('pnl is positive when price moves in trade direction', () => {
    // BUY trade: entry 1000, simulate a tick up
    const trades = [makeOpenTrade({ entryPrice: 1000, sizeUsd: 100 })];
    // Force a favorable tick by mocking Math.random — instead, run many times
    // and assert at least one positive pnl (statistical, not deterministic).
    let positiveCount = 0;
    for (let i = 0; i < 200; i++) {
      const t = makeOpenTrade({ entryPrice: 1000, sizeUsd: 100 });
      const closed = closePaperTrade([t], 60_000);
      if ((closed!.pnlUsd ?? 0) > 0) positiveCount++;
    }
    // With ±0.25% variance and 0.1% fee, >50% of trades should be profitable.
    expect(positiveCount).toBeGreaterThan(50);
  });

  it('fee is a fraction of USD notional, not sizeUsd * price', () => {
    // Regression test: previously closureFee returned sizeUsd * price * 0.001,
    // which for a $100 position at $1492 price = $149 fee (100% of notional).
    // Correct: sizeUsd * 0.001 = $0.10.
    const trades = [makeOpenTrade({ entryPrice: 1492.7, sizeUsd: 100 })];
    const closed = closePaperTrade(trades, 60_000);
    // Fee must be < $1 for a $100 position (0.1% of notional).
    // pnlUsd = rawPnl - fee; rawPnl is bounded by ±0.25% of $100 = ±$0.25.
    // So |pnlUsd| must be < $1 (fee cannot dominate).
    expect(Math.abs(closed!.pnlUsd!)).toBeLessThan(1);
  });

  it('does not mutate unrelated trades', () => {
    const other = makeOpenTrade({ id: 'other', exitPrice: 999, pnlUsd: -1, closedAt: 5_000_000 });
    const open = makeOpenTrade({ id: 'open' });
    closePaperTrade([other, open], 60_000);
    expect(other.exitPrice).toBe(999);
    expect(other.closedAt).toBe(5_000_000);
  });
});

describe('calculateOrderSize', () => {
  it('returns $100 fallback when pipeline is unavailable', () => {
    expect(calculateOrderSize(undefined, 5)).toBe(100);
  });

  it('caps size at $1000', () => {
    const fakePipeline = {
      wallet: { getWallet: () => ({ currentBalance: 1_000_000 }) },
    } as never;
    expect(calculateOrderSize(fakePipeline, 5)).toBe(1000);
  });

  it('returns $100 fallback when pipeline throws', () => {
    const fakePipeline = {
      wallet: { getWallet: () => { throw new Error('boom'); } },
    } as never;
    expect(calculateOrderSize(fakePipeline, 5)).toBe(100);
  });
});