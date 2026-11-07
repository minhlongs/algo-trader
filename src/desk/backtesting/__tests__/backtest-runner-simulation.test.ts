import { describe, it, expect } from 'vitest';
import {
  instantiateBacktestStrategy,
  replayStrategyTicks,
} from '../backtest-runner-simulation';
import { createTickState } from '../backtest-mock-factory';
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

      const strategy = {
        async execute(): Promise<void> {
          seen.push(Date.now());
        },
      };
      const tickState = createTickState(snapshots);
      const orderManager = {
        equityCurve: [] as unknown[],
        getCurrentEquity(): number {
          return 1000;
        },
      };

      await replayStrategyTicks(
        strategy as never,
        'whale-tracker',
        snapshots,
        tickState,
        orderManager as never,
      );

      expect(seen).toHaveLength(3);
      expect(seen[1] - seen[0]).toBe(60_000);
      expect(seen[2] - seen[1]).toBe(60_000);
      expect(orderManager.equityCurve).toHaveLength(3);
      expect(tickState.getTickIndex()).toBe(2);
      // Real clock restored after replay.
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
      const orderManager = {
        equityCurve: [] as unknown[],
        getCurrentEquity(): number {
          return 1000;
        },
      };

      await replayStrategyTicks(
        strategy as never,
        'whale-tracker',
        snapshots,
        tickState,
        orderManager as never,
      );

      expect(calls).toHaveLength(2);
      expect(orderManager.equityCurve).toHaveLength(2);
    });
  });
});
