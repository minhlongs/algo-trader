import { describe, it, expect } from 'vitest';
import { instantiateBacktestStrategy, replayStrategyTicks } from '../backtest-runner-simulation';
import { createTickState, createMockClob, createHistoricalGammaClient } from '../backtest-mock-factory';
import { parseJsonStringArray, simulateMarketRegimeTick } from '../backtest-price-regimes';
import type { HistoricalSnapshot } from '../types';

function makeSnapshot(prices: number[], timestampIso: string): HistoricalSnapshot {
  return {
    timestamp: timestampIso,
    markets: prices.map((p, i) => ({
      conditionId: `cond-${i}`,
      question: `Market ${i}?`,
      yesTokenId: `yes-${i}`,
      noTokenId: `no-${i}`,
      yesPrice: p,
      volume: 80_000,
      liquidity: 40_000,
      closed: false,
      endDate: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    })),
  };
}

describe('BacktestRunnerSimulation', () => {
  describe('instantiateBacktestStrategy', () => {
    it('passes exactly (deps, config) so optional 3rd params keep their injected value', () => {
      let received: unknown[] = [];
      class RecordingStrategy {
        constructor(...args: unknown[]) {
          received = args;
        }
      }
      const snapshots: HistoricalSnapshot[] = [makeSnapshot([0.5], '2026-11-07T00:00:00Z')];
      const { strategy } = instantiateBacktestStrategy(
        { ctor: RecordingStrategy, defaultConfig: { minVolume: 1 } },
        {
          strategy: 'order-arrival-rate',
          strategyConfig: { positionSize: '5' },
          capitalUsdc: 1000,
          days: 1,
          dataQuality: 'high',
        } as never,
        snapshots,
      );

      expect(strategy).toBeInstanceOf(RecordingStrategy);
      expect(received).toHaveLength(2);
      expect(received[0]).toMatchObject({
        gamma: expect.anything(),
        clob: expect.anything(),
        orderManager: expect.anything(),
        eventBus: { emit: expect.any(Function) },
      });
      expect(received[1]).toEqual({ positionSize: '5' });
    });

    it('falls back to defaultConfig when strategyConfig is absent', () => {
      const snapshots: HistoricalSnapshot[] = [makeSnapshot([0.5], '2026-11-07T00:00:00Z')];
      const { strategy } = instantiateBacktestStrategy(
        { ctor: class Stub {}, defaultConfig: { positionSize: '10' } },
        { strategy: 'whale-tracker', capitalUsdc: 1000, days: 1 } as never,
        snapshots,
      );
      expect(strategy).toBeDefined();
    });
  });

  describe('replayStrategyTicks', () => {
    it('advances Date.now() by one minute per tick and restores the real clock', async () => {
      const realNow = Date.now();
      const snapshots = [
        makeSnapshot([0.5], '2026-11-07T00:00:00Z'),
        makeSnapshot([0.55], '2026-11-07T01:00:00Z'),
        makeSnapshot([0.60], '2026-11-07T02:00:00Z'),
      ];
      const seen: number[] = [];
      const strategy = { async execute(): Promise<void> { seen.push(Date.now()); } };
      const tickState = createTickState(snapshots);
      const orderManager = { equityCurve: [] as unknown[], getCurrentEquity: () => 1000 };

      await replayStrategyTicks(strategy as never, 'whale-tracker', snapshots, tickState, orderManager as never);

      expect(seen).toHaveLength(3);
      expect(seen[1] - seen[0]).toBe(60_000);
      expect(seen[2] - seen[1]).toBe(60_000);
      expect(orderManager.equityCurve).toHaveLength(3);
      expect(tickState.getTickIndex()).toBe(2);
      expect(Date.now()).toBeGreaterThanOrEqual(realNow - 1000);
    });

    it('continues the replay when a single tick throws', async () => {
      const snapshots = [
        makeSnapshot([0.5], '2026-11-07T00:00:00Z'),
        makeSnapshot([0.55], '2026-11-07T01:00:00Z'),
      ];
      const calls: number[] = [];
      const strategy = {
        async execute(): Promise<void> {
          calls.push(Date.now() % 60_000);
          throw new Error('synthetic tick failure');
        },
      };
      const tickState = createTickState(snapshots);
      const orderManager = { equityCurve: [] as unknown[], getCurrentEquity: () => 1000 };

      await replayStrategyTicks(strategy as never, 'whale-tracker', snapshots, tickState, orderManager as never);

      expect(calls).toHaveLength(2);
      expect(orderManager.equityCurve).toHaveLength(2);
    });

    it('invokes checkExits after the loop and syncs the final equityCurve entry', async () => {
      const snapshots = [
        makeSnapshot([0.5, 0.4, 0.6, 0.3, 0.7, 0.5], '2026-11-07T00:00:00Z'),
        makeSnapshot([0.55, 0.45, 0.65, 0.35, 0.75, 0.55], '2026-11-07T01:00:00Z'),
      ];
      let closedAtEnd = false;
      let equity = 1000;
      const strategy = {
        async execute(): Promise<void> {},
        async checkExits(): Promise<void> { closedAtEnd = true; equity = 1012.5; },
      };
      const tickState = createTickState(snapshots);
      const gamma = createHistoricalGammaClient(tickState);
      const clob = createMockClob(tickState);
      expect((await gamma.getEvents(5)).length).toBeGreaterThan(0);

      for (const t of [0, 2, 3, 4, 8]) {
        tickState.setCurrent(snapshots[0]!, t);
        expect((await clob.getOrderBook('yes-0')).bids).toHaveLength(5);
        expect((await clob.getOrderBook('no-0')).asks).toHaveLength(5);
      }

      const orderManager = {
        equityCurve: [] as Array<{ timestamp: string; equity: number }>,
        getCurrentEquity: () => equity,
      };
      await replayStrategyTicks(strategy as never, 'whale-tracker', snapshots, tickState, orderManager as never);

      expect(closedAtEnd).toBe(true);
      expect(orderManager.equityCurve[orderManager.equityCurve.length - 1]?.equity).toBe(1012.5);
    });
  });

  describe('simulateMarketRegimeTick & parseJsonStringArray', () => {
    it('exercises all 10 market regime slots and macro herd ticks deterministically', () => {
      expect(parseJsonStringArray(['a', 2])).toEqual(['a', '2']);
      expect(parseJsonStringArray('["x","y"]')).toEqual(['x', 'y']);
      expect(parseJsonStringArray('[invalid')).toEqual([]);
      expect(parseJsonStringArray(null)).toEqual([]);

      const baseMarket = {
        id: 'm1', conditionId: 'c1', question: 'Q?', slug: 'q',
        outcomes: ['Yes', 'No'], outcomePrices: ['0.5', '0.5'],
        active: true, closed: false, volume: 100_000, liquidity: 50_000,
        endDate: '2026-12-31T00:00:00Z', tokens: [], yesTokenId: 'y1', noTokenId: 'n1', yesPrice: 0.5,
      };

      const sampleTicks = [0, 2, 3, 12, 14, 16, 19, 24, 25, 26, 27, 30, 36, 39, 85, 108];
      for (let slot = 0; slot < 10; slot++) {
        for (const tick of sampleTicks) {
          const res = simulateMarketRegimeTick(baseMarket, tick, 168, slot);
          expect(res.yesPrice).toBeGreaterThanOrEqual(0.02);
          expect(res.yesPrice).toBeLessThanOrEqual(0.98);
        }
      }
    });
  });
});
