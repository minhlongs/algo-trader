/**
 * Alpha Backtest Adapter
 *
 * Bridges alpha-lab outputs (regime tags, feature vectors, labels) into the
 * existing backtest runner for PnL simulation. This proves that alpha-lab
 * reuses `src/desk/backtesting/backtest-runner.ts` and `src/desk/backtesting/metrics-calculator.ts`
 * rather than duplicating them.
 *
 * This adapter emits feature vectors and labels only — it does not produce
 * trades or metrics. Metrics are computed downstream by the experiment engine
 * (experiment-engine.ts), which builds a proper return-on-compounded-capital
 * equity curve.
 */

import type { RegimeSnapshot } from '../regimes/regime-types';
import { classifyRegime, defaultRules } from '../regimes/regime-engine';
import { buildFeatureVector } from '../features/feature-registry';
import { tripleBarrierLabel, type TripleBarrierResult } from '../labeling/triple-barrier';
import type { CandleLike } from '../regimes/regime-types';
import type { FeatureVector } from '../features/feature-types';
import type { AlphaExperimentConfig, AlphaRunResult } from './alpha-backtest-types';

// Re-export types and candle loading utilities for 100% backward compatibility
export type { AlphaExperimentConfig, AlphaRunResult } from './alpha-backtest-types';
export {
  FUNDING_SYMBOL_PREFIX,
  fundingTransformDescription,
  buildDataSources,
  loadCandles,
} from './alpha-backtest-candles';

export async function runAlphaExperiment(
  candles: CandleLike[],
  config: AlphaExperimentConfig,
): Promise<AlphaRunResult> {
  const rules = defaultRules();
  const regimeSnapshots: RegimeSnapshot[] = [];
  const featureVectors: FeatureVector[] = [];

  for (let i = config.lookback; i < candles.length; i++) {
    const window = candles.slice(i - config.lookback, i + 1);

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

  return { regimeSnapshots, featureVectors, labels };
}
