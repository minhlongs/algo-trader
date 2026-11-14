/**
 * Anchored Walk-Forward Splitter
 *
 * Produces anchored walk-forward folds over an ordered series. Every fold has
 * three contiguous, non-overlapping segments in chronological order:
 *
 *   train      [0, trainEnd)          — anchored at the series start, grows each fold
 *   calibrate  [trainEnd, calibEnd)   — parameter calibration, never seen by test
 *   test       [calibEnd, testEnd)    — out-of-sample evaluation
 *
 * The train window grows by one test-window length per fold, so later folds
 * recalibrate on everything observed so far. Pure, synchronous, deterministic.
 */

export interface WalkForwardSegment {
  /** Inclusive start index. */
  startIndex: number;
  /** Exclusive end index. */
  endIndex: number;
  /** endIndex - startIndex. */
  length: number;
}

export interface WalkForwardFold {
  /** Zero-based fold number. */
  foldIndex: number;
  /** Expanding in-sample window, anchored at index 0. */
  train: WalkForwardSegment;
  /** Calibration window immediately after train. */
  calibrate: WalkForwardSegment;
  /** Out-of-sample window immediately after calibrate. */
  test: WalkForwardSegment;
  /** Total span of the fold: test.endIndex - train.startIndex. */
  windowLength: number;
}

export interface AnchoredWalkForwardOptions {
  /** Share of the series used as the first train window. Default 0.5. */
  trainFraction?: number;
  /** Share of the series used as the calibration window. Default 0.15. */
  calibrateFraction?: number;
  /** Share of the series used as each test window (also the fold step). Default 0.15. */
  testFraction?: number;
  /** Optional cap on the number of folds. Default: unbounded. */
  maxFolds?: number;
}

export const DEFAULT_ANCHORED_FRACTIONS = {
  trainFraction: 0.5,
  calibrateFraction: 0.15,
  testFraction: 0.15,
} as const;

const FRACTION_EPSILON = 1e-9;

function assertFraction(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0 || value >= 1) {
    throw new RangeError(`${name} must be a finite number in (0, 1); got ${value}`);
  }
}

function makeSegment(startIndex: number, endIndex: number): WalkForwardSegment {
  return { startIndex, endIndex, length: endIndex - startIndex };
}

/**
 * Split a series of `totalLength` observations into anchored walk-forward folds.
 *
 * @throws RangeError when a fraction is outside (0, 1), fractions sum above 1,
 *         or the requested fractions leave no usable fold.
 */
export function splitAnchoredWalkForward(
  totalLength: number,
  options: AnchoredWalkForwardOptions = {},
): WalkForwardFold[] {
  if (!Number.isInteger(totalLength) || totalLength <= 0) {
    throw new RangeError(`totalLength must be a positive integer; got ${totalLength}`);
  }

  const trainFraction = options.trainFraction ?? DEFAULT_ANCHORED_FRACTIONS.trainFraction;
  const calibrateFraction = options.calibrateFraction ?? DEFAULT_ANCHORED_FRACTIONS.calibrateFraction;
  const testFraction = options.testFraction ?? DEFAULT_ANCHORED_FRACTIONS.testFraction;

  assertFraction('trainFraction', trainFraction);
  assertFraction('calibrateFraction', calibrateFraction);
  assertFraction('testFraction', testFraction);

  if (trainFraction + calibrateFraction + testFraction > 1 + FRACTION_EPSILON) {
    throw new RangeError(
      `Fractions must sum to <= 1; got ${trainFraction + calibrateFraction + testFraction}`,
    );
  }

  const maxFolds = options.maxFolds ?? Number.POSITIVE_INFINITY;
  if (!(maxFolds > 0)) {
    throw new RangeError(`maxFolds must be positive; got ${maxFolds}`);
  }

  const baseTrainLength = Math.floor(totalLength * trainFraction);
  const calibrateLength = Math.floor(totalLength * calibrateFraction);
  const testLength = Math.floor(totalLength * testFraction);
  if (baseTrainLength < 1 || calibrateLength < 1 || testLength < 1) {
    throw new RangeError(
      `Fractions too small for totalLength=${totalLength}: ` +
        `train=${baseTrainLength}, calibrate=${calibrateLength}, test=${testLength}`,
    );
  }

  const folds: WalkForwardFold[] = [];
  for (let foldIndex = 0; foldIndex < maxFolds; foldIndex++) {
    // Anchored train: start stays at 0, end grows by one test length per fold.
    const trainEnd = baseTrainLength + foldIndex * testLength;
    const calibrateEnd = trainEnd + calibrateLength;
    const testEnd = calibrateEnd + testLength;
    if (testEnd > totalLength) break;

    const train = makeSegment(0, trainEnd);
    const calibrate = makeSegment(trainEnd, calibrateEnd);
    const test = makeSegment(calibrateEnd, testEnd);

    // Defensive invariants: contiguous chronological segments, test never
    // overlaps train, nothing runs past the series end.
    if (train.endIndex !== calibrate.startIndex || calibrate.endIndex !== test.startIndex) {
      throw new Error(`Fold ${foldIndex} has non-contiguous segments`);
    }
    if (test.startIndex < train.endIndex) {
      throw new Error(`Fold ${foldIndex} test segment overlaps its train segment`);
    }
    if (test.endIndex > totalLength) {
      throw new Error(`Fold ${foldIndex} runs past the series end`);
    }

    folds.push({
      foldIndex,
      train,
      calibrate,
      test,
      windowLength: test.endIndex - train.startIndex,
    });
  }

  if (folds.length === 0) {
    throw new RangeError(
      `No fold fits: totalLength=${totalLength}, ` +
        `windows=${baseTrainLength}+${calibrateLength}+${testLength}`,
    );
  }

  return folds;
}

export interface WalkForwardRecordFold<T> {
  foldIndex: number;
  train: T[];
  calibrate: T[];
  test: T[];
}

/**
 * Convenience wrapper: split ordered records into train/calibrate/test slices
 * using the same anchored fold boundaries.
 */
export function splitAnchoredWalkForwardRecords<T>(
  records: readonly T[],
  options: AnchoredWalkForwardOptions = {},
): Array<WalkForwardRecordFold<T>> {
  return splitAnchoredWalkForward(records.length, options).map((fold) => ({
    foldIndex: fold.foldIndex,
    train: records.slice(fold.train.startIndex, fold.train.endIndex),
    calibrate: records.slice(fold.calibrate.startIndex, fold.calibrate.endIndex),
    test: records.slice(fold.test.startIndex, fold.test.endIndex),
  }));
}
