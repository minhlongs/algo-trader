/**
 * Anchored Walk-Forward Splitter tests.
 */
import { describe, it, expect } from 'vitest';
import {
  splitAnchoredWalkForward,
  splitAnchoredWalkForwardRecords,
  DEFAULT_ANCHORED_FRACTIONS,
  type WalkForwardFold,
} from '../../../src/desk/backtesting/walk-forward-splitter';

function assertFoldInvariants(fold: WalkForwardFold, totalLength: number): void {
  const { train, calibrate, test } = fold;

  // Anchored: every train window starts at the series start.
  expect(train.startIndex).toBe(0);

  // Chronological, contiguous, non-overlapping: train → calibrate → test.
  expect(train.endIndex).toBe(calibrate.startIndex);
  expect(calibrate.endIndex).toBe(test.startIndex);

  // Non-overlapping segments and no zero-length segment.
  expect(train.length).toBeGreaterThan(0);
  expect(calibrate.length).toBeGreaterThan(0);
  expect(test.length).toBeGreaterThan(0);

  // Test never overlaps its own train segment.
  expect(test.startIndex).toBeGreaterThanOrEqual(train.endIndex);

  // Segment lengths always sum to the requested fold window.
  expect(train.length + calibrate.length + test.length).toBe(fold.windowLength);

  // Never runs past the series end.
  expect(test.endIndex).toBeLessThanOrEqual(totalLength);
}

describe('splitAnchoredWalkForward', () => {
  it('produces folds whose segments are anchored, contiguous and non-overlapping', () => {
    const folds = splitAnchoredWalkForward(1000);
    expect(folds.length).toBeGreaterThan(1);
    for (const fold of folds) assertFoldInvariants(fold, 1000);
  });

  it('anchors every train window at index 0 and grows it across folds', () => {
    const folds = splitAnchoredWalkForward(1000, {
      trainFraction: 0.4,
      calibrateFraction: 0.1,
      testFraction: 0.1,
    });
    expect(folds[0].train.startIndex).toBe(0);
    expect(folds[folds.length - 1].train.startIndex).toBe(0);

    for (let i = 1; i < folds.length; i++) {
      expect(folds[i].train.length).toBeGreaterThan(folds[i - 1].train.length);
      // Growth per fold equals exactly one test window.
      expect(folds[i].train.length - folds[i - 1].train.length).toBe(folds[i].test.length);
    }
  });

  it('advances the test window forward in time each fold, never rewinding', () => {
    const folds = splitAnchoredWalkForward(1000);
    for (let i = 1; i < folds.length; i++) {
      expect(folds[i].test.startIndex).toBeGreaterThan(folds[i - 1].test.startIndex);
    }
    // Fold 0's test begins exactly at the end of the first calibration window.
    expect(folds[0].test.startIndex).toBe(
      Math.floor(1000 * DEFAULT_ANCHORED_FRACTIONS.trainFraction) +
        Math.floor(1000 * DEFAULT_ANCHORED_FRACTIONS.calibrateFraction),
    );
  });

  it('sum of segments per fold equals that fold window (train grows, calibrate/test fixed)', () => {
    const totalLength = 1000;
    const folds = splitAnchoredWalkForward(totalLength);
    const baseTrain = Math.floor(totalLength * DEFAULT_ANCHORED_FRACTIONS.trainFraction);
    const calibrateLength = Math.floor(totalLength * DEFAULT_ANCHORED_FRACTIONS.calibrateFraction);
    const testLength = Math.floor(totalLength * DEFAULT_ANCHORED_FRACTIONS.testFraction);

    for (const fold of folds) {
      expect(fold.calibrate.length).toBe(calibrateLength);
      expect(fold.test.length).toBe(testLength);
      expect(fold.train.length).toBe(baseTrain + fold.foldIndex * testLength);
      expect(fold.train.length + fold.calibrate.length + fold.test.length).toBe(fold.windowLength);
    }
  });

  it('is deterministic for identical inputs', () => {
    expect(splitAnchoredWalkForward(777)).toEqual(splitAnchoredWalkForward(777));
  });

  it('honours maxFolds', () => {
    const folds = splitAnchoredWalkForward(1000, { maxFolds: 2 });
    expect(folds.length).toBe(2);
    expect(folds.map((f) => f.foldIndex)).toEqual([0, 1]);
  });

  it('rejects fractions summing above 1', () => {
    expect(() =>
      splitAnchoredWalkForward(1000, {
        trainFraction: 0.6,
        calibrateFraction: 0.3,
        testFraction: 0.3,
      }),
    ).toThrow(RangeError);
  });

  it('rejects out-of-range fractions and invalid lengths', () => {
    expect(() => splitAnchoredWalkForward(0)).toThrow(RangeError);
    expect(() => splitAnchoredWalkForward(100, { trainFraction: 0 })).toThrow(RangeError);
    expect(() => splitAnchoredWalkForward(100, { testFraction: 1 })).toThrow(RangeError);
    expect(() => splitAnchoredWalkForward(100, { calibrateFraction: Number.NaN })).toThrow(RangeError);
  });

  it('rejects a series too short for any fold', () => {
    // floor(3*0.15) = 0 for calibrate and test, so no fold can be built.
    expect(() =>
      splitAnchoredWalkForward(3, { trainFraction: 0.5, calibrateFraction: 0.15, testFraction: 0.15 }),
    ).toThrow(RangeError);
  });
});

describe('splitAnchoredWalkForwardRecords', () => {
  it('slices records with the same boundaries as the index splitter', () => {
    const records = Array.from({ length: 500 }, (_, i) => i);
    const indexFolds = splitAnchoredWalkForward(500);
    const recordFolds = splitAnchoredWalkForwardRecords(records);

    expect(recordFolds.length).toBe(indexFolds.length);
    for (let i = 0; i < indexFolds.length; i++) {
      const { train, calibrate, test } = indexFolds[i];
      expect(recordFolds[i].train).toEqual(records.slice(train.startIndex, train.endIndex));
      expect(recordFolds[i].calibrate).toEqual(records.slice(calibrate.startIndex, calibrate.endIndex));
      expect(recordFolds[i].test).toEqual(records.slice(test.startIndex, test.endIndex));
    }
  });

  it('never lets a record appear in both train and test of the same fold', () => {
    const records = Array.from({ length: 300 }, (_, i) => ({ id: i }));
    for (const fold of splitAnchoredWalkForwardRecords(records)) {
      const trainIds = new Set(fold.train.map((r) => r.id));
      expect(fold.test.some((r) => trainIds.has(r.id))).toBe(false);
    }
  });
});
