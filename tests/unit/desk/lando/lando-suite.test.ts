import { describe, it, expect } from 'vitest';
import { LandoEngine } from '../../../../src/desk/lando/lando-engine';
import { LandoParams } from '../../../../src/desk/lando/lando-types';

describe('Desk 124: Lando (1998) Continuous-Time Markov Rating Transition Engine', () => {
  // Realistic annualized generator matrix Q (8x8): AAA, AA, A, BBB, BB, B, CCC, D
  const sampleGenerator: number[][] = [
    // AAA
    [-0.09, 0.07, 0.015, 0.004, 0.0008, 0.0001, 0.00008, 0.00002],
    // AA
    [0.01, -0.10, 0.075, 0.012, 0.002, 0.0007, 0.0002, 0.0001],
    // A
    [0.001, 0.025, -0.11, 0.072, 0.008, 0.003, 0.0007, 0.0003],
    // BBB
    [0.0002, 0.003, 0.045, -0.13, 0.065, 0.012, 0.0035, 0.0013],
    // BB
    [0.0001, 0.001, 0.006, 0.065, -0.17, 0.075, 0.015, 0.0079],
    // B
    [0.0, 0.0004, 0.002, 0.005, 0.065, -0.19, 0.075, 0.0426],
    // CCC
    [0.0, 0.0, 0.001, 0.003, 0.015, 0.095, -0.35, 0.236],
    // D (Default is absorbing)
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  ];

  // Adjust diagonal to guarantee exact zero row sums
  for (let i = 0; i < 8; i++) {
    let sumOffDiag = 0;
    for (let j = 0; j < 8; j++) {
      if (i !== j) sumOffDiag += sampleGenerator[i][j];
    }
    sampleGenerator[i][i] = -sumOffDiag;
  }

  const baseParams: LandoParams = {
    generatorMatrix: sampleGenerator,
    tenors: [1.0, 3.0, 5.0, 10.0],
    recoveryRate: 0.40,
    initialRating: 'BBB',
  };

  it('produces row-stochastic transition probability matrices summing to 1', () => {
    const res = LandoEngine.evaluate(baseParams);

    expect(res.transitionMatrices.length).toBe(4);

    for (const item of res.transitionMatrices) {
      for (let i = 0; i < 8; i++) {
        let rowSum = 0.0;
        for (let j = 0; j < 8; j++) {
          expect(item.matrix[i][j]).toBeGreaterThanOrEqual(0.0);
          expect(item.matrix[i][j]).toBeLessThanOrEqual(1.0);
          rowSum += item.matrix[i][j];
        }
        expect(rowSum).toBeCloseTo(1.0, 6);
      }
    }
  });

  it('maintains absorbing default state D where P_DD(t) = 1.0', () => {
    const res = LandoEngine.evaluate(baseParams);

    for (const item of res.transitionMatrices) {
      // Row 7 is 'D'
      expect(item.matrix[7][7]).toBeCloseTo(1.0, 6);
      for (let j = 0; j < 7; j++) {
        expect(item.matrix[7][j]).toBeCloseTo(0.0, 6);
      }
    }
  });

  it('computes monotonically increasing default probability across tenors', () => {
    const res = LandoEngine.evaluate(baseParams);

    expect(res.curve.length).toBe(4);
    for (let i = 1; i < res.curve.length; i++) {
      expect(res.curve[i].defaultProbability).toBeGreaterThan(res.curve[i - 1].defaultProbability);
      expect(res.curve[i].survivalProbability).toBeLessThan(res.curve[i - 1].survivalProbability);
    }
  });

  it('calculates strictly positive credit spread term structure for BBB debt', () => {
    const res = LandoEngine.evaluate(baseParams);

    expect(res.benchmark5YSpreadBps).toBeGreaterThan(5.0);
    expect(res.benchmark5YSpreadBps).toBeLessThan(500.0);

    for (const metric of res.curve) {
      expect(metric.creditSpreadBps).toBeGreaterThan(0.0);
      expect(metric.survivalProbability + metric.defaultProbability).toBeCloseTo(1.0, 6);
    }
  });

  it('throws validation error on invalid generator or recovery rate', () => {
    expect(() =>
      LandoEngine.evaluate({ ...baseParams, recoveryRate: 1.2 })
    ).toThrow(/Recovery rate must be between 0 and 1/);

    expect(() =>
      LandoEngine.evaluate({ ...baseParams, tenors: [-1] })
    ).toThrow(/Tenor must be positive/);

    const badQ = [[1, 0], [0, 1]];
    expect(() =>
      LandoEngine.evaluate({ ...baseParams, generatorMatrix: badQ })
    ).toThrow(/Generator matrix Q must be 8x8/);
  });
});
