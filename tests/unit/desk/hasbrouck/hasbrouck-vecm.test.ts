/**
 * Joel Hasbrouck (1991) VAR / VECM Tests.
 * Strictly < 180 LOC, zero mocks, zero :any types.
 */

import { describe, it, expect } from 'vitest';
import {
  HasbrouckVecmEngine,
  HasbrouckVecmMath,
  HasbrouckTradeObservation,
  HasbrouckVarConfig,
} from '../../../../src/desk/hasbrouck/index.js';

describe('Hasbrouck (1991) VAR / VECM Microstructure Suite', () => {
  it('solves linear OLS with ridge regularization accurately', () => {
    // y = 2.0 * x1 + 3.0 * x2 + 1.0
    const X = [
      [1.0, 1.0, 2.0],
      [1.0, 2.0, 1.0],
      [1.0, 3.0, 4.0],
      [1.0, 4.0, 3.0],
      [1.0, 5.0, 5.0],
    ];
    const y = [
      1.0 + 2.0 * 1.0 + 3.0 * 2.0, // 9
      1.0 + 2.0 * 2.0 + 3.0 * 1.0, // 8
      1.0 + 2.0 * 3.0 + 3.0 * 4.0, // 19
      1.0 + 2.0 * 4.0 + 3.0 * 3.0, // 18
      1.0 + 2.0 * 5.0 + 3.0 * 5.0, // 26
    ];

    const beta = HasbrouckVecmMath.solveOlsWithRidge(X, y, 1e-9);
    expect(beta[0]).toBeCloseTo(1.0, 2);
    expect(beta[1]).toBeCloseTo(2.0, 2);
    expect(beta[2]).toBeCloseTo(3.0, 2);
  });

  it('computes 2x2 Cholesky factorization accurately', () => {
    const s11 = 4.0;
    const s22 = 10.0;
    const s12 = 2.0;

    const chol = HasbrouckVecmMath.cholesky2x2(s11, s22, s12);
    expect(chol.l11).toBeCloseTo(2.0, 4);
    expect(chol.l21).toBeCloseTo(1.0, 4);
    // l22 = sqrt(10 - 1^2) = 3
    expect(chol.l22).toBeCloseTo(3.0, 4);
  });

  it('estimates VAR(1) parameters with synthetic informed trade dynamics', () => {
    // Generate synthetic series where trades inform price return:
    // r_t = 0.5 * x_{t-1} + e_1,t
    // x_t = 0.3 * x_{t-1} + e_2,t
    const N = 200;
    const observations: HasbrouckTradeObservation[] = [];
    let prevX = 0;
    let prevR = 0;

    for (let t = 0; t < N; t++) {
      // Deterministic pseudo-random series without external mock libraries
      const shock1 = Math.sin(t * 13.37) * 0.1;
      const shock2 = Math.cos(t * 7.19) * 0.5;

      const x = 0.4 * prevX + shock2;
      const r = 0.5 * prevX + 0.1 * prevR + shock1;

      observations.push({
        timestamp: t * 1000,
        midpointReturn: r,
        signedVolume: x,
      });

      prevX = x;
      prevR = r;
    }

    const config: HasbrouckVarConfig = { lagOrder: 1, ridgePenalty: 1e-6 };
    const result = HasbrouckVecmEngine.estimate(observations, config, 10);

    expect(result.sampleSize).toBe(N);
    expect(result.coefficients.alphaLagSignedTrade[0]).toBeGreaterThan(0.2);
    expect(result.coefficients.betaLagSignedTrade[0]).toBeGreaterThan(0.2);
    expect(result.residuals.sigma1Sq).toBeGreaterThan(0);
    expect(result.residuals.sigma2Sq).toBeGreaterThan(0);
  });

  it('computes impulse response function (IRF) and permanent price impact', () => {
    const observations: HasbrouckTradeObservation[] = [];
    for (let t = 0; t < 150; t++) {
      const x = Math.sign(Math.sin(t * 0.5));
      const r = 0.25 * x + Math.cos(t * 0.3) * 0.05;
      observations.push({
        timestamp: t * 1000,
        midpointReturn: r,
        signedVolume: x,
      });
    }

    const config: HasbrouckVarConfig = { lagOrder: 2 };
    const result = HasbrouckVecmEngine.estimate(observations, config, 15);

    expect(result.impulseResponses.length).toBe(16); // 0 to 15
    const irf0 = result.impulseResponses[0];
    const irf15 = result.impulseResponses[15];

    expect(irf0.horizon).toBe(0);
    expect(irf15.horizon).toBe(15);
    expect(irf15.tradeShockToQuote).toBeDefined();

    // Permanent impact must be positive given positive relation
    expect(result.varianceDecomposition.permanentPriceImpact).toBeGreaterThan(0);
    expect(result.varianceDecomposition.informationShare).toBeGreaterThanOrEqual(0.0);
    expect(result.varianceDecomposition.informationShare).toBeLessThanOrEqual(1.0);
  });

  it('throws error for invalid configurations or insufficient samples', () => {
    expect(() => {
      HasbrouckVecmEngine.estimate([], { lagOrder: 2 });
    }).toThrow('Insufficient observations');

    expect(() => {
      HasbrouckVecmEngine.estimate([{ timestamp: 1, midpointReturn: 0, signedVolume: 0 }], {
        lagOrder: 0,
      });
    }).toThrow('Lag order must be at least 1');
  });
});
