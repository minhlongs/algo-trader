/**
 * Walk-Forward Splitter
 *
 * Generates train/val/test splits for walk-forward evaluation.
 *
 * Two modes:
 * - EXPANDING: train window grows by valSize each step.
 * - ROLLING: all windows are fixed size; step advances by testSize each step.
 *
 * Causal boundary: first `lookback` bars are reserved for warmup and excluded from
 * all splits. This prevents regime/feature computation from leaking future data.
 */

import type { DataSplit, SplitConfig } from './experiment-types';

// ── Validation ────────────────────────────────────────────────────────────────

function assertValidRatios(config: SplitConfig): void {
  const { trainRatio, valRatio, testRatio } = config;
  const sum = trainRatio + valRatio + testRatio;
  if (Math.abs(sum - 1) > 1e-9) {
    throw new Error(`Split ratios must sum to 1: got train=${trainRatio}, val=${valRatio}, test=${testRatio}`);
  }
  for (const r of [trainRatio, valRatio, testRatio]) {
    if (r <= 0 || r >= 1) throw new Error(`Split ratio must be in (0,1): got ${r}`);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Compute window sizes from config.
 *
 * For EXPANDING: baseTrain is used as the starting train size.
 * For ROLLING: all three windows are derived.
 *
 * Explicit window sizes take precedence over ratio-derived sizes.
 */
function resolveWindows(config: SplitConfig, usable: number): {
  trainW: number;
  valW: number;
  testW: number;
} {
  const trainW = config.trainWindowSize ?? Math.floor(usable * config.trainRatio);
  const valW = config.valWindowSize ?? Math.floor(usable * config.valRatio);
  const testW = Math.max(1, usable - trainW - valW);
  return { trainW, valW, testW };
}

// ── Expanding ─────────────────────────────────────────────────────────────────

/**
 * Expanding window: train grows by valW each step.
 * Val and test windows remain fixed size at the end of the series.
 */
function expandingSplits(config: SplitConfig, totalBars: number, lookback: number): DataSplit[] {
  const usable = totalBars - lookback;
  const { trainW: baseTrain, valW, testW } = resolveWindows(config, usable);
  const splits: DataSplit[] = [];
  let step = 0;

  while (step < 10_000) {
    const trainEnd = lookback + baseTrain + step * valW;
    const valEnd = trainEnd + valW;
    const testEnd = valEnd + testW;
    if (testEnd > totalBars) break;

    splits.push(
      { kind: 'train', step, startIdx: lookback, endIdx: trainEnd },
      { kind: 'val', step, startIdx: trainEnd, endIdx: valEnd },
      { kind: 'test', step, startIdx: valEnd, endIdx: testEnd },
    );
    step++;
  }
  return splits;
}

// ── Rolling ───────────────────────────────────────────────────────────────────

/**
 * Rolling window: all three windows are fixed size; advance by testW each step.
 */
function rollingSplits(config: SplitConfig, totalBars: number, lookback: number): DataSplit[] {
  const usable = totalBars - lookback;
  const { trainW, valW, testW } = resolveWindows(config, usable);
  if (trainW + valW + testW > usable) {
    throw new Error(
      `Windows exceed usable data: train=${trainW}, val=${valW}, test=${testW}, usable=${usable}`,
    );
  }

  const splits: DataSplit[] = [];
  let step = 0;

  while (step < 10_000) {
    const offset = step * testW;
    const trainStart = lookback + offset;
    const valStart = trainStart + trainW;
    const testStart = valStart + valW;
    const testEnd = testStart + testW;
    if (testEnd > totalBars) break;

    splits.push(
      { kind: 'train', step, startIdx: trainStart, endIdx: valStart },
      { kind: 'val', step, startIdx: valStart, endIdx: testStart },
      { kind: 'test', step, startIdx: testStart, endIdx: testEnd },
    );
    step++;
  }
  return splits;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate walk-forward train/val/test splits from a candle array.
 *
 * The first `lookback` bars are excluded from all splits (warmup period for
 * regime and feature computation).
 *
 * @param config  Split configuration (mode, ratios, window sizes).
 * @param totalBars Total number of bars in the dataset.
 * @param lookback Number of warmup bars to exclude.
 * @returns Flat array of DataSplit entries covering all steps.
 */
export function generateSplits(config: SplitConfig, totalBars: number, lookback: number): DataSplit[] {
  assertValidRatios(config);

  if (lookback < 0) throw new Error(`lookback must be >= 0: got ${lookback}`);
  if (totalBars <= lookback) {
    throw new Error(`Insufficient data: totalBars=${totalBars}, lookback=${lookback}`);
  }

  if (config.mode === 'expanding') return expandingSplits(config, totalBars, lookback);
  return rollingSplits(config, totalBars, lookback);
}