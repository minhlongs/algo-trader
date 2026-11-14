/**
 * Regression suite for observed point-in-time L2 replay (`runObservedQuantAlphaReplay`),
 * FIFO open+closed capital lockup (`computeCapitalLockupFromTrades`), and 5-min event filter.
 */

import { describe, expect, it } from 'vitest';
import type { BacktestTrade, HistoricalSnapshot } from '../../../src/desk/backtesting/types';
import {
  computeCapitalLockupFromTrades,
  filterOutFiveMinEvents,
} from '../../../src/desk/cli/kpi-poly-book-metrics';
import { inferPeriodsPerYear } from '../../../src/desk/cli/kpi-poly-collector';
import { runObservedQuantAlphaReplay } from '../../../src/desk/cli/kpi-poly-observed-replay';
import type { GammaEvent } from '../../../src/desk/polymarket/gamma-client';
import type { ReplayedBookStep } from '../../../src/desk/polymarket/l2/l2-replay';

const T0 = Date.now();
const FUTURE_END = new Date(T0 + 45 * 86_400_000).toISOString();

function makeSnapshot(): HistoricalSnapshot {
  return {
    timestamp: new Date(T0).toISOString(),
    source: 'prices-history',
    markets: [
      {
        conditionId: 'cond-macro',
        question: 'Will FOMC hold rates in December?',
        yesPrice: 0.48,
        volume: 300_000,
        liquidity: 80_000,
        endDate: FUTURE_END,
        closed: false,
        yesTokenId: 'tok-yes',
        noTokenId: 'tok-no',
      },
    ],
  };
}

describe('computeCapitalLockupFromTrades — FIFO open + closed hold duration', () => {
  it('credits realized short holding duration to closed round-trips instead of 45-day contract expiry', () => {
    const snaps = [makeSnapshot()];
    const trades: BacktestTrade[] = [
      {
        timestamp: new Date(T0).toISOString(),
        marketId: 'cond-macro',
        tokenId: 'tok-yes',
        side: 'BUY',
        price: 0.5,
        size: 100,
        pnl: null,
      },
      {
        timestamp: new Date(T0 + 2 * 86_400_000).toISOString(),
        marketId: 'cond-macro',
        tokenId: 'tok-yes',
        side: 'SELL',
        price: 0.55,
        size: 100,
        pnl: 4.2,
      },
    ];

    const lockup = computeCapitalLockupFromTrades(snaps, trades, T0 + 2 * 86_400_000);
    expect(lockup.weightedAvgLockupDays).toBeCloseTo(2, 5);
    expect(lockup.lockedOver30dPct).toBe(0);
    expect(lockup.awaitingResolutionPct).toBe(0);
  });

  it('blends realized hold duration on closed portion with remaining expiry on open residual', () => {
    const snaps = [makeSnapshot()];
    const trades: BacktestTrade[] = [
      {
        timestamp: new Date(T0).toISOString(),
        marketId: 'cond-macro',
        tokenId: 'tok-yes',
        side: 'BUY',
        price: 0.5,
        size: 100,
        pnl: null,
      },
      {
        timestamp: new Date(T0 + 5 * 86_400_000).toISOString(),
        marketId: 'cond-macro',
        tokenId: 'tok-yes',
        side: 'SELL',
        price: 0.54,
        size: 50,
        pnl: 1.5,
      },
    ];

    // 50 shares closed after 5d ($25 notional), 50 shares still open with 40d left ($25 notional) -> avg 22.5d
    const lockup = computeCapitalLockupFromTrades(snaps, trades, T0 + 5 * 86_400_000);
    expect(lockup.weightedAvgLockupDays).toBeCloseTo(22.5, 5);
    expect(lockup.lockedOver30dPct).toBeCloseTo(50, 5);
  });
});

describe('filterOutFiveMinEvents & runObservedQuantAlphaReplay', () => {
  it('strips 5-minute crypto events and runs observed L2 replay without synthetic spread fabrication', async () => {
    const events: GammaEvent[] = [
      {
        id: 'ev-5m',
        title: 'BTC Up or Down - 5 min',
        slug: 'btc-5m',
        markets: [],
      },
      {
        id: 'ev-negrisk',
        title: 'Election Winner Exhaustive',
        slug: 'election-winner',
        markets: [1, 2, 3, 4].map((i) => ({
          id: `m-${i}`,
          question: `Candidate ${i} wins?`,
          conditionId: `c-${i}`,
          slug: `cand-${i}`,
          outcomes: ['Yes', 'No'],
          outcomePrices: ['0.22', '0.78'],
          volume: 200_000,
          liquidity: 50_000,
          endDate: FUTURE_END,
          active: true,
          closed: false,
          negRisk: true,
          groupItemTitle: `Candidate ${i}`,
          tokens: [],
          yesTokenId: `nr-yes-${i}`,
          noTokenId: `nr-no-${i}`,
          yesPrice: 0.22,
        })),
      },
    ];
    const filtered = filterOutFiveMinEvents(events);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.id).toBe('ev-negrisk');

    const l2Steps: ReplayedBookStep[] = [1, 2, 3, 4].map((i, idx) => ({
      source: 'recorded-l2',
      t: T0 + idx * 100,
      seq: idx + 1,
      assetId: `nr-yes-${i}`,
      bids: [{ price: '0.20', size: '5000' }],
      asks: [{ price: '0.22', size: '5000' }],
      lastTrade: null,
    }));

    const out = await runObservedQuantAlphaReplay({
      snapshots: [makeSnapshot()],
      l2Steps,
      liveEvents: filtered,
      feeResolver: { resolve: async () => null },
      capitalUsdc: 6_000,
      tokenToCluster: new Map([
        ['nr-yes-1', 'ev-negrisk'],
        ['nr-yes-2', 'ev-negrisk'],
        ['nr-yes-3', 'ev-negrisk'],
        ['nr-yes-4', 'ev-negrisk'],
      ]),
    });

    expect(out.basketAttempts).toBeGreaterThanOrEqual(1);
    expect(out.completeBaskets).toBeGreaterThanOrEqual(1);
    expect(out.closedCycles.length).toBeGreaterThanOrEqual(4);
    expect(out.closedCycles[0]!.feeAndSlippagePusd).toBeGreaterThan(0);
    expect(out.allTrades[0]!.timestamp).toBe(new Date(l2Steps[3]!.t).toISOString());
  });

  it('resolves real +60s L2 maker markout samples with rebate and infers replay cadence for annualization', async () => {
    const l2Steps: ReplayedBookStep[] = [
      { source: 'recorded-l2', t: T0, seq: 1, assetId: 'tok-yes', bids: [{ price: '0.47', size: '800' }], asks: [{ price: '0.52', size: '800' }], lastTrade: null },
      { source: 'recorded-l2', t: T0 + 10, seq: 2, assetId: 'tok-no', bids: [{ price: '0.47', size: '800' }], asks: [{ price: '0.52', size: '800' }], lastTrade: null },
      { source: 'recorded-l2', t: T0 + 61_000, seq: 3, assetId: 'tok-yes', bids: [{ price: '0.49', size: '800' }], asks: [{ price: '0.53', size: '800' }], lastTrade: null },
      { source: 'recorded-l2', t: T0 + 61_010, seq: 4, assetId: 'tok-no', bids: [{ price: '0.46', size: '800' }], asks: [{ price: '0.50', size: '800' }], lastTrade: null },
    ];
    const out = await runObservedQuantAlphaReplay({
      snapshots: [makeSnapshot()],
      l2Steps,
      liveEvents: [],
      feeResolver: {
        resolve: async () => ({ exponent: 1, rate: 0.04, takerOnly: true, rebateRate: 0.25 }),
      },
      capitalUsdc: 6_000,
      tokenToCluster: new Map([
        ['tok-yes', 'cond-macro'],
        ['tok-no', 'cond-macro'],
      ]),
    });

    expect(out.markouts.length).toBeGreaterThanOrEqual(2);
    expect(out.markouts.every((m) => m.side === 'buy')).toBe(true);
    expect(out.markouts[0]!.midAt60s).toBeCloseTo(0.51, 5);
    expect(out.markouts[0]!.makerRebateBps).toBeGreaterThan(0);

    const hourly = inferPeriodsPerYear([
      { timestamp: '2026-11-01T00:00:00.000Z' },
      { timestamp: '2026-11-01T01:00:00.000Z' },
      { timestamp: '2026-11-01T02:00:00.000Z' },
    ]);
    const subMinute = inferPeriodsPerYear([
      { timestamp: '2026-11-01T00:00:00.000Z' },
      { timestamp: '2026-11-01T00:00:30.000Z' },
    ]);
    expect(hourly).toBe(8760);
    expect(subMinute).toBeGreaterThan(hourly * 100);
  });
});
