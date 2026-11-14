/**
 * Backtest Runner Simulation & Step Helpers
 *
 * Encapsulates historical snapshot loading, strategy instantiation with
 * synchronized mock services, and tick-by-tick replay with equity curve recording.
 */

import type { BasePolymarketStrategy, StrategyDeps } from '../strategies/polymarket/base-polymarket-strategy';
import type { FeeScheduleResolver } from '../polymarket/fee-schedule-resolver';
import type { GammaHistoricalProvider } from './gamma-historical-provider';
import { logger } from '../../shared/utils/logger';
import type { BacktestRunnerOptions, HistoricalSnapshot } from './types';
import { BacktestOrderManager } from './backtest-order-manager';
import {
  createTickState,
  createMockClob,
  createHistoricalGammaClient,
  type TickState,
} from './backtest-mock-factory';
import { fetchFromOhlcvStore, type LoadedHistoricalData } from './backtest-data-loader';
import type { OhlcvCandle } from '../data/ohlcv-store';

export type StrategyConstructor = new (
  deps: StrategyDeps,
  config: Record<string, unknown>,
) => BasePolymarketStrategy;

export async function loadBacktestSnapshots(
  historicalProvider: GammaHistoricalProvider,
  config: BacktestRunnerOptions,
  warnings: string[],
): Promise<LoadedHistoricalData> {
  const ohlcvMarket = (config as unknown as Record<string, unknown>).ohlcvMarket as string | undefined;
  const ohlcvTimeframe = (config as unknown as Record<string, unknown>).ohlcvTimeframe as string | undefined;
  let snapshots: HistoricalSnapshot[];
  let candles: OhlcvCandle[] = [];

  if (ohlcvMarket && ohlcvTimeframe) {
    const loaded = await fetchFromOhlcvStore(
      historicalProvider,
      ohlcvMarket,
      ohlcvTimeframe,
      config.days,
      config.dataQuality,
      warnings,
    );
    snapshots = loaded.snapshots;
    candles = loaded.candles;
  } else {
    snapshots = await historicalProvider.fetchHistoricalSnapshots(
      config.days,
      config.tickIntervalMs ?? 3_600_000,
    );
  }

  if (snapshots.length === 0) {
    throw new Error('No historical data available for backtest');
  }

  return { snapshots, candles };
}

export function instantiateBacktestStrategy(
  entry: { ctor: unknown; defaultConfig: unknown },
  config: BacktestRunnerOptions,
  snapshots: HistoricalSnapshot[],
): {
  strategy: BasePolymarketStrategy;
  orderManager: BacktestOrderManager;
  tickState: TickState;
} {
  const orderManager = new BacktestOrderManager(config.capitalUsdc, {
    feeResolver: config.feeResolver,
  });
  const tickState = createTickState(snapshots);
  const gammaClient = createHistoricalGammaClient(tickState);
  const mockClob = createMockClob(tickState);

  const deps: StrategyDeps & { feeResolver?: FeeScheduleResolver } = {
    clob: mockClob,
    orderManager,
    eventBus: { emit: () => {}, on: () => {}, off: () => {} },
    gamma: gammaClient,
    ...(config.feeResolver ? { feeResolver: config.feeResolver } : {}),
  };

  const strategy = new (entry.ctor as unknown as StrategyConstructor)(
    deps,
    (config.strategyConfig ?? entry.defaultConfig) as Record<string, unknown>,
  );

  return { strategy, orderManager, tickState };
}

export async function replayStrategyTicks(
  strategy: BasePolymarketStrategy,
  strategyName: string,
  snapshots: HistoricalSnapshot[],
  tickState: TickState,
  orderManager: BacktestOrderManager,
): Promise<void> {
  const realDateNow = Date.now;
  const baseNow = realDateNow();
  let simNow = baseNow;

  try {
    Date.now = () => simNow;

    for (let tickIdx = 0; tickIdx < snapshots.length; tickIdx++) {
      const snapshot = snapshots[tickIdx];
      // Step 60_000ms (1 minute) per tick so StrategyPriceCache (>5_000ms) refreshes
      // every tick while intraday confirmation/whale windows (60_000ms-300_000ms)
      // and maxHoldMs (8-20 minutes) span realistic multi-tick horizons.
      simNow = baseNow + tickIdx * 60_000;

      tickState.setCurrent(snapshot, tickIdx);

      try {
        await strategy.execute();
      } catch (err) {
        logger.warn('Backtest tick error', 'BacktestRunner', {
          strategy: strategyName,
          timestamp: snapshot.timestamp,
          err: String(err),
        });
      }

      orderManager.equityCurve.push({
        timestamp: snapshot.timestamp,
        equity: orderManager.getCurrentEquity(),
      });
    }

    // Close out any still-open positions at the end of the replay window so all
    // entered positions settle as complete round-trips under the net-of-fee ledger.
    if (snapshots.length > 0) {
      simNow += 86_400_000;
      const checkExitsFn = (strategy as unknown as { checkExits?: (now?: number) => Promise<void> }).checkExits;
      if (typeof checkExitsFn === 'function') {
        try {
          await checkExitsFn.call(strategy, simNow);
        } catch {
          // Non-fatal if strategy already closed all positions
        }
      }
      if (orderManager.equityCurve.length > 0) {
        orderManager.equityCurve[orderManager.equityCurve.length - 1] = {
          timestamp: snapshots[snapshots.length - 1].timestamp,
          equity: orderManager.getCurrentEquity(),
        };
      }
    }
  } finally {
    Date.now = realDateNow;
  }
}
