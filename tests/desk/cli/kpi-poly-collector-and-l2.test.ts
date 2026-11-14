import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocketServer } from 'ws';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BacktestTrade, HistoricalSnapshot } from '../../../src/desk/backtesting/types';
import {
  computeStressMetrics,
  estimateClusterDeployableCapacity,
  estimateSimMakerFillRate,
  filterOutFiveMinContracts,
  filterOutFiveMinEvents,
  isExcludedFiveMinuteContract,
} from '../../../src/desk/cli/kpi-poly-book-metrics';
import { computeCapitalLockupFromTrades } from '../../../src/desk/cli/kpi-poly-capital-lockup';
import { collectPolymarketKpiInput, inferPeriodsPerYear } from '../../../src/desk/cli/kpi-poly-collector';
import {
  captureLiveL2Window,
  captureOrLoadL2Steps,
  loadAllReplayedL2Steps,
} from '../../../src/desk/cli/kpi-poly-l2-capture';
import {
  buildCyclesFromClosedTrades,
  buildObservedClobClient,
  buildObservedGammaClient,
  buildRealMakerMarkouts,
  snapshotMarketsToGamma,
  twoSidedMid,
} from '../../../src/desk/cli/kpi-poly-observed-replay-helpers';
import { createL2Recorder } from '../../../src/desk/polymarket/l2/l2-recorder';
import type { ReplayedBookStep } from '../../../src/desk/polymarket/l2/l2-replay';
import { L2_SOURCE_RECORDED, makeDataApiV2TradeRow } from '../../../src/desk/polymarket/l2/l2-source-labels';

function makeBookStep(params: {
  t: number;
  assetId: string;
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
}): ReplayedBookStep {
  return {
    t: params.t,
    source: L2_SOURCE_RECORDED,
    assetId: params.assetId,
    eventType: 'book',
    bids: params.bids,
    asks: params.asks,
    row: {
      t: params.t,
      source: L2_SOURCE_RECORDED,
      assetId: params.assetId,
      eventType: 'book',
      bids: params.bids,
      asks: params.asks,
    },
  };
}

describe('kpi-poly L2 capture, collector, book metrics, and replay helpers', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()!;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('captures live L2 frames over WebSocket and replays sorted steps', async () => {
    const l2Dir = mkdtempSync(join(tmpdir(), 'kpi-l2-test-'));
    tempDirs.push(l2Dir);

    expect(await captureLiveL2Window({ l2Dir, assetIds: [], captureDurationMs: 50 })).toBe(0);
    expect(await captureLiveL2Window({ l2Dir, assetIds: ['tok-1'], captureDurationMs: 0 })).toBe(0);
    expect(await loadAllReplayedL2Steps(join(l2Dir, 'missing-dir'))).toEqual([]);

    const wss = new WebSocketServer({ port: 0 });
    const addr = wss.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;

    wss.on('connection', (socket) => {
      socket.on('message', () => {
        socket.send(
          JSON.stringify({
            event_type: 'book',
            asset_id: 'tok-ws-1',
            market: 'cond-ws-1',
            timestamp: '1700000000000',
            bids: [{ price: '0.48', size: '120' }],
            asks: [{ price: '0.52', size: '150' }],
          }),
        );
      });
    });

    try {
      const steps = await captureOrLoadL2Steps({
        l2Dir,
        assetIds: ['tok-ws-1', 'tok-ws-1', ''],
        captureDurationMs: 120,
        wsUrl: `ws://127.0.0.1:${port}`,
      });
      expect(steps.length).toBeGreaterThanOrEqual(1);
      expect(steps[0]!.assetId).toBe('tok-ws-1');
    } finally {
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    }

    const errCount = await captureLiveL2Window({
      l2Dir,
      assetIds: ['tok-ws-1'],
      captureDurationMs: 100,
      wsUrl: 'ws://127.0.0.1:1',
    });
    expect(errCount).toBe(0);
  });

  it('computes book metrics, 5-min filters, maker fill rate, capacity, and stress metrics', () => {
    expect(isExcludedFiveMinuteContract('BTC Up or Down - 5 min')).toBe(true);
    expect(isExcludedFiveMinuteContract('Will Fed hold rates in December?')).toBe(false);

    const snaps: HistoricalSnapshot[] = [
      {
        timestamp: '2026-11-01T00:00:00.000Z',
        source: 'prices-history',
        markets: [
          {
            conditionId: 'c-5m',
            question: 'ETH 5 minute candle up?',
            yesPrice: 0.5,
            volume: 1000,
            liquidity: 500,
            endDate: '2026-12-01T00:00:00.000Z',
            closed: false,
          },
          {
            conditionId: 'c-macro',
            question: 'Macro CPI below 3%?',
            yesPrice: 0.6,
            volume: 50_000,
            liquidity: 10_000,
            endDate: '2026-12-01T00:00:00.000Z',
            closed: false,
            yesTokenId: 'tok-yes',
            noTokenId: 'tok-no',
          },
        ],
      },
    ];
    const filteredSnaps = filterOutFiveMinContracts(snaps);
    expect(filteredSnaps).toHaveLength(1);
    expect(filteredSnaps[0]!.markets).toHaveLength(1);

    const events = filterOutFiveMinEvents([
      { id: 'ev-5m', title: 'BTC 5-min sprint', slug: 's', markets: [] },
      {
        id: 'ev-ok',
        title: 'Election 2026',
        slug: 'el',
        markets: [
          {
            id: 'm1',
            question: 'Candidate A?',
            conditionId: 'c1',
            slug: 'c1',
            outcomes: ['Yes', 'No'],
            outcomePrices: ['0.4', '0.6'],
            volume: 1000,
            liquidity: 500,
            endDate: '2026-12-01T00:00:00.000Z',
            active: true,
            closed: false,
            tokens: [],
            yesTokenId: 't1',
            yesPrice: 0.4,
          },
        ],
      },
    ]);
    expect(events).toHaveLength(1);

    expect(estimateSimMakerFillRate([], [])).toBeNull();
    expect(estimateClusterDeployableCapacity([])).toBeNull();

    const step1 = makeBookStep({
      t: 1_700_000_000_000,
      assetId: 'tok-yes',
      bids: [{ price: '0.48', size: '40' }],
      asks: [{ price: '0.52', size: '500' }],
    });
    const trades = [
      makeDataApiV2TradeRow({
        t: 1_700_000_000_000,
        conditionId: 'c-macro',
        tokenId: 'tok-yes',
        side: 'BUY',
        price: 0.52,
        size: 300,
        outcome: 'Yes',
        title: 'Macro',
        slug: 'macro',
        wallet: '0x1',
        transactionHash: '0xa',
      }),
      makeDataApiV2TradeRow({
        t: 1_700_000_005_000,
        conditionId: 'c-macro',
        tokenId: 'tok-yes',
        side: 'BUY',
        price: 0.52,
        size: 400,
        outcome: 'Yes',
        title: 'Macro',
        slug: 'macro',
        wallet: '0x2',
        transactionHash: '0xb',
      }),
    ];
    const fillRate = estimateSimMakerFillRate([step1], trades);
    expect(fillRate).not.toBeNull();
    expect(fillRate!).toBeGreaterThanOrEqual(0);

    const cap = estimateClusterDeployableCapacity([step1], new Map([['tok-yes', 'cluster-1']]));
    expect(cap).toBeCloseTo(260, 4);

    expect(computeStressMetrics([], []).baselineNetPnlPusd).toBeNull();
    const stress = computeStressMetrics(
      [{ eventClusterId: 'c1', netPnlPusd: 25, feeAndSlippagePusd: 4, notionalPusd: 200 }],
      [{ timestamp: '2026-11-01T00:00:00.000Z', tokenId: 'tok-yes', side: 'SELL', price: 0.6, size: 100, pnl: 25 }],
    );
    expect(stress.baselineNetPnlPusd).toBe(25);
    expect(stress.stressed15xNetPnlPusd).toBe(23);
    expect(stress.plusHalfCentSlippageNetPnlPusd).toBe(24);
  });

  it('exercises replay helpers, capital lockup edge cases, and periods-per-year inference', async () => {
    expect(twoSidedMid(undefined)).toBeNull();
    expect(twoSidedMid({ bids: [], asks: [{ price: '0.5', size: '10' }] })).toBeNull();
    expect(
      twoSidedMid({
        bids: [{ price: '0.46', size: '10' }],
        asks: [{ price: '0.54', size: '10' }],
      }),
    ).toBeCloseTo(0.5, 6);

    const bookMap = new Map([
      [
        'tok-1',
        {
          bids: [{ price: '0.45', size: '100' }],
          asks: [{ price: '0.55', size: '100' }],
          timestamp: 1_700_000_000_000,
        },
      ],
    ]);
    const clob = buildObservedClobClient(bookMap, () => 12345);
    expect((await clob.getOrderBook('missing')).timestamp).toBe(12345);
    expect(await clob.getPrice('missing')).toBe(0);
    expect(await clob.getPrice('tok-1', 'BUY')).toBeCloseTo(0.55, 6);
    expect(await clob.getPrice('tok-1', 'SELL')).toBeCloseTo(0.45, 6);
    expect(await clob.getMidPrice('tok-1')).toBeCloseTo(0.5, 6);

    expect(snapshotMarketsToGamma(undefined)).toEqual([]);
    const gammaMarkets = snapshotMarketsToGamma({
      timestamp: '2026-11-01T00:00:00.000Z',
      source: 'prices-history',
      markets: [
        {
          conditionId: 'cond-1',
          question: 'Will BTC exceed 100k?',
          yesPrice: 0.65,
          volume: 10_000,
          liquidity: 5_000,
          endDate: '2026-12-20T00:00:00.000Z',
          closed: false,
          yesTokenId: 'tok-1',
          noTokenId: 'tok-1-no',
        },
      ],
    });
    const gamma = buildObservedGammaClient(gammaMarkets, []);
    expect(await gamma.getMarkets({ limit: 1 })).toHaveLength(1);
    expect((await gamma.getMarket('cond-1'))?.id).toBe('cond-1');
    expect(await gamma.getMarket('missing')).toBeNull();
    expect(await gamma.getMarketGroup('g')).toBeNull();
    expect(await gamma.searchMarkets('btc')).toHaveLength(1);
    expect(await gamma.getTrending(5)).toHaveLength(1);
    expect(await gamma.getEvents(5)).toEqual([]);

    const cycles = buildCyclesFromClosedTrades(
      [{ timestamp: '2026-11-01T00:00:00Z', tokenId: 'tok-1', side: 'SELL', price: 0.6, size: 10, pnl: 1.5, venueCostUsd: 0.2 }],
      new Map([['tok-1', 'cluster-btc']]),
    );
    expect(cycles[0]!.eventClusterId).toBe('cluster-btc');

    const baseT = 1_700_000_000_000;
    const steps: ReplayedBookStep[] = [0, 6_000, 65_000, 305_000].map((dt) =>
      makeBookStep({
        t: baseT + dt,
        assetId: 'tok-1',
        bids: [{ price: '0.49', size: '50' }],
        asks: [{ price: '0.53', size: '50' }],
      }),
    );
    const markouts = await buildRealMakerMarkouts(
      [{ marketId: 'cond-1', tokenId: 'tok-1', side: 'yes', entryPrice: 0.48, quantity: 20, atMs: baseT }],
      steps,
      { resolve: async () => ({ exponent: 1, rate: 0.04, takerOnly: true, rebateRate: 0.25 }) },
    );
    expect(markouts).toHaveLength(1);
    expect(markouts[0]!.midAt5s).toBeCloseTo(0.51, 5);
    expect(markouts[0]!.midAt300s).toBeCloseTo(0.51, 5);
    expect(markouts[0]!.makerRebateBps).toBeGreaterThan(0);

    const lockupTrades: BacktestTrade[] = [
      { timestamp: '2026-10-01T00:00:00.000Z', tokenId: 'tok-1', side: 'BUY', price: 0.5, size: 10, pnl: null },
      { timestamp: '2026-11-05T00:00:00.000Z', tokenId: 'tok-1', side: 'SELL', price: 0.6, size: 4, pnl: 0.4 },
      { timestamp: '2026-11-06T00:00:00.000Z', tokenId: 'tok-closed', side: 'SELL', price: 0.8, size: 5, pnl: 0.5 },
    ];
    const lockup = computeCapitalLockupFromTrades(
      [],
      lockupTrades,
      Date.parse('2026-11-06T00:00:00.000Z'),
      [
        { yesTokenId: 'tok-1', endDate: '2026-12-25T00:00:00.000Z', closed: false },
        { yesTokenId: 'tok-closed', endDate: '2026-11-10T00:00:00.000Z', closed: true },
      ],
    );
    expect(lockup.weightedAvgLockupDays).toBeGreaterThan(20);
    expect(lockup.lockedOver30dPct).toBeGreaterThan(0);
    expect(lockup.awaitingResolutionPct).toBeGreaterThan(0);

    expect(inferPeriodsPerYear([])).toBe(8760);
    expect(
      inferPeriodsPerYear([
        { timestamp: '2026-11-01T00:00:00.000Z' },
        { timestamp: '2026-11-02T00:00:00.000Z' },
      ]),
    ).toBe(365);
  });

  it('collects provenance-tagged KPI input via collectPolymarketKpiInput using local L2 JSONL', async () => {
    const l2Dir = mkdtempSync(join(tmpdir(), 'kpi-collector-l2-'));
    tempDirs.push(l2Dir);
    const rec = createL2Recorder({ filePath: join(l2Dir, 'sample.jsonl') });
    await rec.recordRawMessage(
      JSON.stringify({
        event_type: 'book',
        asset_id: 'tok-col-yes',
        market: 'cond-col-1',
        timestamp: '1700000000000',
        bids: [{ price: '0.47', size: '200' }],
        asks: [{ price: '0.52', size: '200' }],
      }),
    );
    await rec.close();

    const nowSec = Math.floor(Date.now() / 1_000);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/events')) {
        return new Response(
          JSON.stringify([
            {
              id: 'ev-col-1',
              title: 'Macro Event',
              slug: 'macro-event',
              markets: [
                {
                  id: 'm-col-1',
                  question: 'Macro rate hold?',
                  conditionId: 'cond-col-1',
                  slug: 'macro-hold',
                  outcomes: JSON.stringify(['Yes', 'No']),
                  outcomePrices: JSON.stringify(['0.50', '0.50']),
                  clobTokenIds: JSON.stringify(['tok-col-yes', 'tok-col-no']),
                  volume: '50000',
                  liquidity: '15000',
                  endDate: '2026-12-30T00:00:00.000Z',
                  active: true,
                  closed: false,
                },
              ],
            },
          ]),
          { status: 200 },
        );
      }
      if (url.includes('/markets')) {
        return new Response(
          JSON.stringify([
            {
              id: 'm-col-1',
              question: 'Macro rate hold?',
              conditionId: 'cond-col-1',
              slug: 'macro-hold',
              outcomes: JSON.stringify(['Yes', 'No']),
              outcomePrices: JSON.stringify(['0.50', '0.50']),
              clobTokenIds: JSON.stringify(['tok-col-yes', 'tok-col-no']),
              volume: '50000',
              liquidity: '15000',
              endDate: '2026-12-30T00:00:00.000Z',
              active: true,
              closed: false,
            },
          ]),
          { status: 200 },
        );
      }
      if (url.includes('prices-history')) {
        return new Response(
          JSON.stringify({
            history: [
              { t: nowSec - 7_200, p: 0.49 },
              { t: nowSec - 3_600, p: 0.51 },
              { t: nowSec - 60, p: 0.50 },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes('/trades')) {
        return new Response(
          JSON.stringify([
            {
              proxyWallet: '0x1111111111111111111111111111111111111111',
              side: 'BUY',
              asset: 'tok-col-yes',
              conditionId: 'cond-col-1',
              size: 50,
              price: 0.5,
              timestamp: nowSec - 120,
              outcome: 'Yes',
              title: 'Macro rate hold?',
              slug: 'macro-hold',
              transactionHash: '0xabc',
            },
          ]),
          { status: 200 },
        );
      }
      if (url.includes('fee-rate')) {
        return new Response(JSON.stringify({ base_fee: 0 }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    const kpiInput = await collectPolymarketKpiInput({
      days: 1,
      capitalUsdc: 5_000,
      l2Dir,
      recordMs: 0,
      maxMarkets: 2,
    });
    expect(fetchSpy).toHaveBeenCalled();
    expect(kpiInput.provenance.l2Steps).toHaveLength(1);
    expect(kpiInput.capacity.deployableCapacityPusd).toBeGreaterThan(0);
  });
});
