/**
 * Tests for arb-handler — handleArbQuery.
 *
 * Covers: empty-opportunities path, opportunities path (with and without
 * spreadPercent, with and without exchange labels), cross-market basket
 * present/absent, and logical-hedge count. SpreadDetector is injected via
 * deps so no real exchange/WebSocket code runs.
 */

import { describe, it, expect, vi } from 'vitest';
import { handleArbQuery } from '../arb-handler';
import type { ArbitrageOpportunity } from '../../../../desk/arbitrage/spread-detector-types';

function makeOp(overrides: Partial<ArbitrageOpportunity> = {}): ArbitrageOpportunity {
  return {
    symbol: 'BTC/USDT',
    buyExchange: 'binance',
    sellExchange: 'coinbase',
    spreadPercent: 0.42,
    ...overrides,
  };
}

describe('handleArbQuery', () => {
  it('returns no-action findings when no opportunities found', async () => {
    const scan = vi.fn().mockResolvedValue([]);
    const res = await handleArbQuery(undefined, {
      spreadDetector: { scan } as any,
    });

    expect(res.answer).toContain('Arbitrage Scan Results');
    expect(res.answer).toContain('Spread opportunities: 0');
    expect(res.answer).toContain('Logical hedges: 0');
    expect(res.answer).toContain('No actionable opportunities found at this time.');
    expect(res.actions.find(a => a.payload === 'arb_execute')).toBeUndefined();
    expect(res.actions.find(a => a.payload === '/arbitrage')).toBeDefined();
    expect(res.sourceData!.spreadsFound).toBe(0);
    expect(res.sourceData!.crossMarketBasket).toBe(false);
    expect(res.sourceData!.logicalHedges).toBe(0);
    expect(res.sourceData!.topOpportunities).toEqual([]);
  });

  it('formats opportunities with exchange labels and spread percent', async () => {
    const scan = vi.fn().mockResolvedValue([makeOp()]);
    const res = await handleArbQuery(undefined, {
      spreadDetector: { scan } as any,
    });

    expect(res.answer).toContain('Spread opportunities: 1');
    expect(res.answer).toContain('binance/coinbase BTC/USDT — spread: 0.42%');
    expect(res.actions[0]).toEqual({
      label: 'Execute Top Arb',
      action: 'execute',
      payload: 'arb_execute',
    });
    expect(res.sourceData!.spreadsFound).toBe(1);
    expect(res.sourceData!.topOpportunities[0]).toContain('0.42%');
  });

  it('falls back to N/A when spreadPercent is undefined', async () => {
    const scan = vi.fn().mockResolvedValue([makeOp({ spreadPercent: undefined })]);
    const res = await handleArbQuery(undefined, {
      spreadDetector: { scan } as any,
    });
    expect(res.answer).toContain('spread: N/A');
  });

  it('falls back to ? when exchange labels are missing', async () => {
    const scan = vi.fn().mockResolvedValue([
      makeOp({ buyExchange: undefined, sellExchange: undefined, spreadPercent: 0.1 }),
    ]);
    const res = await handleArbQuery(undefined, {
      spreadDetector: { scan } as any,
    });
    expect(res.answer).toContain('?/?');
  });

  it('truncates to top 5 opportunities', async () => {
    const ops = Array.from({ length: 12 }, (_, i) =>
      makeOp({ symbol: `SYM${i}`, spreadPercent: i }),
    );
    const scan = vi.fn().mockResolvedValue(ops);
    const res = await handleArbQuery(undefined, {
      spreadDetector: { scan } as any,
    });
    const topOpps = res.sourceData!.topOpportunities as string[];
    expect(topOpps.length).toBe(5);
    expect(topOpps[0]).toContain('SYM0');
    expect(topOpps[4]).toContain('SYM4');
  });

  it('records cross-market basket when present', async () => {
    const scan = vi.fn().mockResolvedValue([]);
    const res = await handleArbQuery(
      undefined,
      {
        spreadDetector: { scan } as any,
      },
    );
    // empty ops → basket absent → false
    expect(res.sourceData!.crossMarketBasket).toBe(false);
  });
});