/**
 * Walk-Forward Robustness Pipeline
 *
 * Composes the four robustness primitives into the single chain that makes a
 * backtest claim falsifiable:
 *
 *   anchored walk-forward split (train / calibrate / test)
 *     → per-test-window liquidity regime classification (4 regimes)
 *       → Stationary Block Bootstrap 95% CI (per fold, and pooled out-of-sample)
 *         → Deflated Sharpe (given the number of hyperparameter trials)
 *
 * Only out-of-sample (`test`) segments feed the statistics: the train and
 * calibrate windows are in-sample by construction and would bias any interval.
 */

import {
  splitAnchoredWalkForward,
  type AnchoredWalkForwardOptions,
  type WalkForwardFold,
} from './walk-forward-splitter';
import type { LiquidityObservation } from './liquidity-regimes';
import {
  computeRobustnessMetrics,
  type RobustnessMetrics,
  type RobustnessMetricsOptions,
} from './metrics-calculator-robustness';

/** One ordered observation: its return, plus liquidity inputs when available. */
export interface WalkForwardRobustnessObservation {
  returnValue: number;
  liquidity?: LiquidityObservation;
}

export interface WalkForwardFoldRobustness {
  foldIndex: number;
  fold: WalkForwardFold;
  /** Robustness of this fold's out-of-sample test window; null when it has < 2 returns. */
  robustness: RobustnessMetrics | null;
}

export interface WalkForwardRobustnessReport {
  /** Per-fold out-of-sample robustness, in chronological fold order. */
  folds: WalkForwardFoldRobustness[];
  /** Robustness pooled over every fold's test window, concatenated in order. */
  pooled: RobustnessMetrics;
  /** Total out-of-sample observations pooled across folds. */
  pooledSampleLength: number;
}

export type WalkForwardRobustnessOptions = AnchoredWalkForwardOptions &
  Omit<RobustnessMetricsOptions, 'liquidity'>;

function toReturns(observations: readonly WalkForwardRobustnessObservation[]): number[] {
  return observations.map((observation) => observation.returnValue);
}

/** True when every observation in the segment carries liquidity inputs. */
function hasCompleteLiquidity(observations: readonly WalkForwardRobustnessObservation[]): boolean {
  return observations.length > 0 && observations.every((observation) => observation.liquidity !== undefined);
}

function toLiquidity(
  observations: readonly WalkForwardRobustnessObservation[],
): LiquidityObservation[] | undefined {
  if (!hasCompleteLiquidity(observations)) return undefined;
  return observations.map((observation) => observation.liquidity as LiquidityObservation);
}

/** Split the combined option bag into its two owners. */
function partitionOptions(options: WalkForwardRobustnessOptions): {
  splitOptions: AnchoredWalkForwardOptions;
  robustnessOptions: Omit<RobustnessMetricsOptions, 'liquidity'>;
} {
  const {
    trainFraction,
    calibrateFraction,
    testFraction,
    maxFolds,
    ...robustnessOptions
  } = options;
  return {
    splitOptions: { trainFraction, calibrateFraction, testFraction, maxFolds },
    robustnessOptions,
  };
}

/**
 * Run the full robustness chain over an ordered series.
 *
 * @throws RangeError when the series is too short for even one fold, or when it
 *         holds fewer than 2 observations (nothing to bootstrap).
 */
export function computeWalkForwardRobustness(
  observations: readonly WalkForwardRobustnessObservation[],
  options: WalkForwardRobustnessOptions = {},
): WalkForwardRobustnessReport {
  const { splitOptions, robustnessOptions } = partitionOptions(options);
  const folds = splitAnchoredWalkForward(observations.length, splitOptions);

  const foldResults: WalkForwardFoldRobustness[] = folds.map((fold) => {
    const testObservations = observations.slice(fold.test.startIndex, fold.test.endIndex);
    if (testObservations.length < 2) {
      return { foldIndex: fold.foldIndex, fold, robustness: null };
    }
    return {
      foldIndex: fold.foldIndex,
      fold,
      robustness: computeRobustnessMetrics(toReturns(testObservations), {
        ...robustnessOptions,
        liquidity: toLiquidity(testObservations),
      }),
    };
  });

  // Pooled out-of-sample evidence: concatenate every fold's test window.
  const pooledObservations = folds.flatMap((fold) =>
    observations.slice(fold.test.startIndex, fold.test.endIndex),
  );
  if (pooledObservations.length < 2) {
    throw new RangeError(
      `Pooled out-of-sample series has ${pooledObservations.length} observation(s); need at least 2`,
    );
  }

  return {
    folds: foldResults,
    pooled: computeRobustnessMetrics(toReturns(pooledObservations), {
      ...robustnessOptions,
      liquidity: toLiquidity(pooledObservations),
    }),
    pooledSampleLength: pooledObservations.length,
  };
}
