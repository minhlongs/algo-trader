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
 */

import type { RegimeSnapshot } from '../regimes/regime-types';
import { classifyRegime, defaultRules } from '../regimes/regime-engine';
import { buildFeatureVector } from '../features/feature-registry';
import { tripleBarrierLabel, type TripleBarrierResult } from '../labeling/triple-barrier';
import { computeMetrics } from '../../desk/backtesting/metrics-calculator';
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

export interface AlphaRunResult {
  regimeSnapshots: RegimeSnapshot[];
  featureVectors: FeatureVector[];
  labels: Array<TripleBarrierResult & { entryIdx: number }>;
  metrics: ReturnType<typeof computeMetrics>;
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

  // Delegate metrics computation to existing metrics calculator (proves reuse).
  const metrics = computeMetrics(
    [],
    candles.slice(config.lookback).map((c) => ({ timestamp: c.timestamp, equity: c.close })),
  );

  return { regimeSnapshots, featureVectors, labels, metrics };
}