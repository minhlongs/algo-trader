import { describe, it, expect, vi } from 'vitest';
import { calcEventDeviation, findMostMispriced, calcHedgeSize, shouldEnterHedge, createMultiLegHedgeTick } from '../multi-leg-hedge';
import { scanEntriesFor } from '../multi-leg-hedge-entries';
import { checkExitsFor } from '../multi-leg-hedge-exits';
import { DEFAULT_CONFIG } from '../multi-leg-hedge-config';

describe('multi-leg-hedge::calcEventDeviation', () => {
  it('is a defined function', () => {
    expect(typeof calcEventDeviation).toBe('function');
  });
});

describe('multi-leg-hedge::findMostMispriced', () => {
  it('is a defined function', () => {
    expect(typeof findMostMispriced).toBe('function');
  });
});

describe('multi-leg-hedge::calcHedgeSize', () => {
  it('is a defined function', () => {
    expect(typeof calcHedgeSize).toBe('function');
  });
});

describe('multi-leg-hedge::shouldEnterHedge', () => {
  it('is a defined function', () => {
    expect(typeof shouldEnterHedge).toBe('function');
  });
});

describe('multi-leg-hedge::createMultiLegHedgeTick', () => {
  it('is a defined function', () => {
    expect(typeof createMultiLegHedgeTick).toBe('function');
  });

  it('emits CLOB V2 quadratic taker fees on entry and exit instead of hardcoded 0', async () => {
    const trades: Array<{ fees: string }> = [];
    const ctx = {
      positions: [],
      cooldowns: new Map<string, number>(),
      cfg: { ...DEFAULT_CONFIG, minMarkets: 2, maxMarkets: 5, deviationThreshold: 0.05, takeProfitPct: 0.05 },
      clob: {
        getOrderBook: vi.fn(async () => ({
          bids: [{ price: '0.39', size: '500' }],
          asks: [{ price: '0.41', size: '500' }],
          timestamp: Date.now(),
        })),
      } as never,
      orderManager: { placeOrder: vi.fn(async () => ({ id: 'mlh-ord-1' })) } as never,
      eventBus: { emit: vi.fn((_e: string, p: { trade: { fees: string } }) => trades.push(p.trade)) } as never,
    };
    const events = [{
      id: 'ev-crypto-1',
      title: 'Bitcoin price target',
      markets: [
        { conditionId: 'btc-crypto-1', question: 'BTC 100k', yesTokenId: 'y1', noTokenId: 'n1', yesPrice: 0.4, active: true, closed: false, resolved: false },
        { conditionId: 'btc-crypto-2', question: 'BTC 90k', yesTokenId: 'y2', noTokenId: 'n2', yesPrice: 0.4, active: true, closed: false, resolved: false },
      ],
    }];
    await scanEntriesFor(ctx, events as never);
    expect(trades).toHaveLength(1);
    expect(Number(trades[0]!.fees)).toBeGreaterThan(0);

    // Trigger take-profit exit
    ctx.clob.getOrderBook = vi.fn(async () => ({
      bids: [{ price: '0.75', size: '500' }],
      asks: [{ price: '0.77', size: '500' }],
      timestamp: Date.now(),
    })) as never;
    await checkExitsFor(ctx, events as never);
    expect(trades).toHaveLength(2);
    expect(Number(trades[1]!.fees)).toBeGreaterThan(0);
  });
});
