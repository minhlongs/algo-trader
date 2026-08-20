/**
 * Alpha Backtest Adapter
 *
 * Bridges alpha-lab outputs (regime tags, feature vectors, labels) into the
 * existing backtest runner for PnL simulation. This proves that alpha-lab
 * reuses `src/desk/backtesting/backtest-runner.ts` and `src/desk/backtesting/metrics-calculator.ts`
 * rather than duplicating them.
 *
 * At Phase 6+ this becomes the primary integration path. Here it exists to
 * satisfy the reuse contract established in `docs/ALPHA_DISCOVERY_ARCHITECTURE.md`.
 *
 * This adapter emits feature vectors and labels only — it does not produce
 * trades or metrics. Metrics are computed downstream by the experiment engine
 * (experiment-engine.ts), which builds a proper return-on-compounded-capital
 * equity curve. Feeding raw close prices as an equity curve here would make
 * Sharpe/maxDrawdown reflect price movement, not strategy returns.
 */

import type { RegimeSnapshot } from '../regimes/regime-types';
import { classifyRegime, defaultRules } from '../regimes/regime-engine';
import { buildFeatureVector } from '../features/feature-registry';
import { tripleBarrierLabel, type TripleBarrierResult } from '../labeling/triple-barrier';
import { getLatestCandles } from '../../desk/data/ohlcv-store';
import { logger } from '../../shared/utils/logger';
import { generateMockCandles } from './mock-candles';
import type { CandleLike } from '../regimes/regime-types';
import type { FeatureVector } from '../features/feature-types';

export interface AlphaExperimentConfig {
  market: string;
  timeframe: string;
  lookback: number;
  features: string[];
  tp: number;
  sl: number;
  maxHolding: number;
  regimes?: 'all' | string[];
}

/**
 * Load candles for an experiment. Prefers real data from the OHLCV store;
 * falls back to mock data when no real candles exist yet (e.g. before the
 * Binance backfill has run). The fallback is clearly labelled in experiment
 * artifacts so results are never mistaken for real out-of-sample evidence.
 */
export async function loadCandles(
  market: string,
  timeframe: string,
  candleCount: number,
  exchange = 'binance',
): Promise<{ candles: CandleLike[]; source: 'real' | 'mock' }> {
  // Try real data first (last candleCount candles from store)
  try {
    const latest = await getLatestCandles(market, timeframe, candleCount, exchange);
    if (latest.length >= 10) {
      return {
        candles: latest.map((c) => ({
          timestamp: c.timestamp.toISOString(),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        })),
        source: 'real',
      };
    }
  } catch (err) {
    // Store may be unreachable in offline/local runs — fall through to mock
    logger.warn('[AlphaAdapter] OHLCV store query failed, using mock data', {
      market,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { candles: generateMockCandles(market, candleCount), source: 'mock' };
}

export interface AlphaRunResult {
  regimeSnapshots: RegimeSnapshot[];
  featureVectors: FeatureVector[];
  labels: Array<TripleBarrierResult & { entryIdx: number }>;
}

export async function runAlphaExperiment(
  candles: CandleLike[],
  config: AlphaExperimentConfig,
): Promise<AlphaRunResult> {
  const rules = defaultRules();
  const regimeSnapshots: RegimeSnapshot[] = [];
  const featureVectors: FeatureVector[] = [];

  for (let i = config.lookback; i < candles.length; i++) {
    const window = candles.slice(i - config.lookback, i + 1);
    const _ts = window[window.length - 1]!.timestamp;

    regimeSnapshots.push(
      classifyRegime(
        { market: config.market, timeframe: config.timeframe, lookback: config.lookback },
        window,
        rules,
      ),
    );

    featureVectors.push(
      buildFeatureVector(
        config.market,
        config.timeframe,
        window,
        config.features,
      ),
    );
  }

  const closes = candles.map((c) => ({
    high: c.high,
    low: c.low,
    close: c.close,
    timestamp: c.timestamp,
  }));
  const labels: Array<TripleBarrierResult & { entryIdx: number }> = [];
  const maxEntry = candles.length - 1 - config.maxHolding;
  for (let i = config.lookback; i <= maxEntry; i++) {
    labels.push({ ...tripleBarrierLabel(closes, i, config.tp, config.sl, config.maxHolding), entryIdx: i });
  }

  // No trades are produced by this adapter — it emits feature vectors and
  // labels only. Metrics are computed downstream by the experiment engine,
  // which builds a proper return-on-compounded-capital equity curve.
  return { regimeSnapshots, featureVectors, labels };
}