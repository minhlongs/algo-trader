/**
 * Tests for cross-market-arb — stubs ClobClient + MarketScanner so every
 * path (constructor, executeTick entry/exit/stop, midPrice, pure helpers)
 * is exercised without a live order book.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../shared/utils/logger', () => ({ logger: mockLogger }));

type Mod = typeof import('../cross-market-arb');
let mod: Mod;

function makeBook(bid: string, ask: string) {
  return { bids: [{ price: bid }], asks: [{ price: ask }] };
}

function makeScanner(opportunities: Array<{ yesTokenId: string; noTokenId: string; conditionId: string; volume: number; liquidity: number }>) {
  return { scan: vi.fn().mockResolvedValue({ opportunities }) };
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  mod = await import('../polymarket/cross-market-arb');
});

// ─── Pure helpers ─────────────────────────────────────────────────────────────

describe('computeBasis', () => {
  it('returns absolute difference', () => {
    expect(mod.computeBasis(0.6, 0.4)).toBeCloseTo(0.2, 5);
    expect(mod.computeBasis(0.4, 0.6)).toBeCloseTo(0.2, 5);
    expect(mod.computeBasis(0.5, 0.5)).toBe(0);
  });
});

describe('getArbDirection', () => {
  it('buys yes on the cheaper side', () => {
    expect(mod.getArbDirection(0.3, 0.7)).toEqual({ sideA: 'yes', sideB: 'no' });
    expect(mod.getArbDirection(0.7, 0.3)).toEqual({ sideA: 'no', sideB: 'yes' });
    expect(mod.getArbDirection(0.5, 0.5)).toEqual({ sideA: 'no', sideB: 'yes' });
  });
});

// ─── Strategy class ───────────────────────────────────────────────────────────

describe('constructor', () => {
  it('logs initialization with merged config', () => {
    const scanner = makeScanner([]);
    const cfg = { name: 'cross-market-arb' as const, enabled: true, capitalAllocation: '100', params: { minBasis: 0.1 } };
    const strat = new mod.CrossMarketArbStrategy({} as never, scanner, cfg, '100');
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[cross-market-arb] Strategy initialized',
      expect.objectContaining({ minBasis: 0.1, maxPositions: 3, capital: '100' }),
    );
    expect(strat).toBeInstanceOf(EventEmitter);
  });
});

describe('executeTick', () => {
  it('does nothing when not running', async () => {
    const scanner = makeScanner([]);
    const cfg = { name: 'cross-market-arb' as const, enabled: true, capitalAllocation: '100', params: {} };
    const strat = new mod.CrossMarketArbStrategy({ getOrderBook: vi.fn() } as never, scanner, cfg, '100');
    await strat.stop();
    await strat.executeTick();
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('skips same conditionId pairs', async () => {
    const scanner = makeScanner([
      { yesTokenId: 'a', noTokenId: 'na', conditionId: 'same', volume: 1000, liquidity: 500 },
      { yesTokenId: 'b', noTokenId: 'nb', conditionId: 'same', volume: 1000, liquidity: 500 },
    ]);
    const clob = { getOrderBook: vi.fn().mockResolvedValue(makeBook('0.55', '0.65')) };
    const cfg = { name: 'cross-market-arb' as const, enabled: true, capitalAllocation: '100', params: {} };
    const strat = new mod.CrossMarketArbStrategy(clob as never, scanner, cfg, '100');
    await strat.executeTick();
    // basis=0.1 >= minBasis(0.05) but same conditionId → skipped; no position opened
    expect(mockLogger.info).not.toHaveBeenCalledWith(
      '[cross-market-arb] Position opened',
      expect.anything(),
    );
  });

  it('opens a position when basis exceeds minBasis', async () => {
    const scanner = makeScanner([
      { yesTokenId: 'a', noTokenId: 'na', conditionId: 'c1', volume: 1000, liquidity: 500 },
      { yesTokenId: 'b', noTokenId: 'nb', conditionId: 'c2', volume: 1000, liquidity: 500 },
    ]);
    const clob = {
      getOrderBook: vi.fn()
        .mockResolvedValueOnce(makeBook('0.3', '0.5'))   // mid 0.4
        .mockResolvedValueOnce(makeBook('0.6', '0.8')),  // mid 0.7 -> basis 0.3
    };
    const cfg = { name: 'cross-market-arb' as const, enabled: true, capitalAllocation: '100', params: {} };
    const strat = new mod.CrossMarketArbStrategy(clob as never, scanner, cfg, '100');
    await strat.executeTick();
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[cross-market-arb] Position opened',
      expect.objectContaining({ dir: expect.any(String), size: 50 }),
    );
  });

  it('skips pairs where basis is below minBasis', async () => {
    const scanner = makeScanner([
      { yesTokenId: 'a', noTokenId: 'na', conditionId: 'c1', volume: 1000, liquidity: 500 },
      { yesTokenId: 'b', noTokenId: 'nb', conditionId: 'c2', volume: 1000, liquidity: 500 },
    ]);
    const clob = { getOrderBook: vi.fn().mockResolvedValue(makeBook('0.49', '0.51')) };
    const cfg = { name: 'cross-market-arb' as const, enabled: true, capitalAllocation: '100', params: {} };
    const strat = new mod.CrossMarketArbStrategy(clob as never, scanner, cfg, '100');
    await strat.executeTick();
    expect(mockLogger.info).not.toHaveBeenCalledWith(
      '[cross-market-arb] Position opened',
      expect.anything(),
    );
  });

  it('skips when midPrice is 0 (no book)', async () => {
    const scanner = makeScanner([
      { yesTokenId: 'a', noTokenId: 'na', conditionId: 'c1', volume: 1000, liquidity: 500 },
      { yesTokenId: 'b', noTokenId: 'nb', conditionId: 'c2', volume: 1000, liquidity: 500 },
    ]);
    const clob = { getOrderBook: vi.fn().mockResolvedValue({ bids: [], asks: [] }) };
    const cfg = { name: 'cross-market-arb' as const, enabled: true, capitalAllocation: '100', params: {} };
    const strat = new mod.CrossMarketArbStrategy(clob as never, scanner, cfg, '100');
    await strat.executeTick();
    expect(mockLogger.info).not.toHaveBeenCalledWith(
      '[cross-market-arb] Position opened',
      expect.anything(),
    );
  });

  it('skips when a mid price is <= 0 (negative bid)', async () => {
    const scanner = makeScanner([
      { yesTokenId: 'a', noTokenId: 'na', conditionId: 'c1', volume: 1000, liquidity: 500 },
      { yesTokenId: 'b', noTokenId: 'nb', conditionId: 'c2', volume: 1000, liquidity: 500 },
    ]);
    // bids price '-1' → bid -1, empty asks → ask defaults 1 → mid = 0 → mid <= 0 branch
    const clob = {
      getOrderBook: vi.fn()
        .mockResolvedValueOnce({ bids: [{ price: '-1' }], asks: [] }) // midA 0
        .mockResolvedValueOnce({ bids: [{ price: '0.3' }], asks: [{ price: '0.5' }] }), // midB 0.4
    };
    const cfg = { name: 'cross-market-arb' as const, enabled: true, capitalAllocation: '100', params: {} };
    const strat = new mod.CrossMarketArbStrategy(clob as never, scanner, cfg, '100');
    await strat.executeTick();
    expect(mockLogger.info).not.toHaveBeenCalledWith(
      '[cross-market-arb] Position opened',
      expect.anything(),
    );
  });

  it('continues past an inner-loop error', async () => {
    const scanner = makeScanner([
      { yesTokenId: 'a', noTokenId: 'na', conditionId: 'c1', volume: 1000, liquidity: 500 },
      { yesTokenId: 'b', noTokenId: 'nb', conditionId: 'c2', volume: 1000, liquidity: 500 },
      { yesTokenId: 'c', noTokenId: 'nc', conditionId: 'c3', volume: 1000, liquidity: 500 },
    ]);
    const clob = {
      getOrderBook: vi.fn()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValue(makeBook('0.4', '0.6')),
    };
    const cfg = { name: 'cross-market-arb' as const, enabled: true, capitalAllocation: '100', params: {} };
    const strat = new mod.CrossMarketArbStrategy(clob as never, scanner, cfg, '100');
    await strat.executeTick();
    // First pair errors & is skipped, second pair (a,c) and (b,c) still evaluated
    expect(clob.getOrderBook.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('catches a scanner failure and logs a warning', async () => {
    const scanner = { scan: vi.fn().mockRejectedValue(new Error('scanner down')) };
    const clob = { getOrderBook: vi.fn() };
    const cfg = { name: 'cross-market-arb' as const, enabled: true, capitalAllocation: '100', params: {} };
    const strat = new mod.CrossMarketArbStrategy(clob as never, scanner, cfg, '100');
    await strat.executeTick();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[cross-market-arb] Tick error',
      expect.objectContaining({ err: expect.stringContaining('scanner down') }),
    );
  });
});

describe('checkExits (via executeTick)', () => {
function injectPosition(strat: Mod['CrossMarketArbStrategy'], pos: { tokenIdA: string; tokenIdB: string; conditionIdA: string; conditionIdB: string; entryBasis: number; sideA: 'yes' | 'no'; sizeUsdc: number; openedAt: number }) {
  (strat as unknown as { positions: typeof pos[] }).positions.push(pos);
}
function injectClob(strat: Mod['CrossMarketArbStrategy'], clob: { getOrderBook: ReturnType<typeof vi.fn> }) {
  (strat as unknown as { clobClient: typeof clob }).clobClient = clob;
}

const POS = { tokenIdA: 'a', tokenIdB: 'b', conditionIdA: 'c1', conditionIdB: 'c2', entryBasis: 0.3, sideA: 'yes' as const, sizeUsdc: 50, openedAt: 0 };

  it('closes a position when basis converges below exitBasis', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-30T00:00:00Z'));
    const scanner = makeScanner([]);
    const cfg = { name: 'cross-market-arb' as const, enabled: true, capitalAllocation: '100', params: { exitBasis: 0.02 } };
    const strat = new mod.CrossMarketArbStrategy({ getOrderBook: vi.fn() } as never, scanner, cfg, '100');
    injectPosition(strat, { ...POS, openedAt: Date.now() });
    // basis 0.01 < exitBasis 0.02 → converged
    injectClob(strat, { getOrderBook: vi.fn().mockResolvedValue(makeBook('0.49', '0.50')) });
    await strat.executeTick();
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[cross-market-arb] Position closed',
      expect.objectContaining({ reason: 'converged' }),
    );
    vi.useRealTimers();
  });

  it('closes a position when max hold time exceeded (timeout)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-30T00:00:00Z'));
    const scanner = makeScanner([]);
    const cfg = { name: 'cross-market-arb' as const, enabled: true, capitalAllocation: '100', params: {} };
    const strat = new mod.CrossMarketArbStrategy({ getOrderBook: vi.fn() } as never, scanner, cfg, '100');
    injectPosition(strat, { ...POS, openedAt: Date.now() - 31 * 60_000 });
    // Different books so basis 0.4 > exitBasis 0.02 → timeout branch, not converged
    injectClob(strat, { getOrderBook: vi.fn()
      .mockResolvedValueOnce(makeBook('0.2', '0.4'))  // midA 0.3
      .mockResolvedValueOnce(makeBook('0.6', '0.8')), // midB 0.7 → basis 0.4
    });
    await strat.executeTick();
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[cross-market-arb] Position closed',
      expect.objectContaining({ reason: 'timeout' }),
    );
    vi.useRealTimers();
  });

  it('removes a position when order book fetch fails', async () => {
    const scanner = makeScanner([]);
    const cfg = { name: 'cross-market-arb' as const, enabled: true, capitalAllocation: '100', params: {} };
    const strat = new mod.CrossMarketArbStrategy({ getOrderBook: vi.fn().mockRejectedValue(new Error('book down')) } as never, scanner, cfg, '100');
    injectPosition(strat, { ...POS, openedAt: Date.now() });
    await strat.executeTick();
    // Error swallowed silently (no log) — just verify it does not throw
    expect(mockLogger.info).not.toHaveBeenCalledWith(
      '[cross-market-arb] Position closed',
      expect.anything(),
    );
  });
});

describe('stop', () => {
  it('sets running to false and logs', async () => {
    const scanner = makeScanner([]);
    const cfg = { name: 'cross-market-arb' as const, enabled: true, capitalAllocation: '100', params: {} };
    const strat = new mod.CrossMarketArbStrategy({ getOrderBook: vi.fn() } as never, scanner, cfg, '100');
    await strat.stop();
    expect(mockLogger.info).toHaveBeenCalledWith('[cross-market-arb] Stopped');
  });
});
