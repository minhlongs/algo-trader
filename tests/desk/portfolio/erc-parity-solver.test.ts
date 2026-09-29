import { describe, it, expect } from 'vitest';
import {
  solveErcCcd,
  ErcParitySolver,
} from '../../../src/desk/portfolio/erc-parity-solver';
import { CovarianceMatrix, ENGINE_IDS } from '../../../src/desk/portfolio/types';

describe('ERC Parity Solver (Spinu CCD Formulation)', () => {
  it('converges to relative risk disparity <= 1e-4 in <= 25 iterations on 4x4 matrix', () => {
    // Realistic positive definite covariance matrix for 4 engines
    const cov: number[][] = [
      [0.0004, 0.00008, 0.00005, 0.0001],
      [0.00008, 0.0009, 0.00012, 0.00015],
      [0.00005, 0.00012, 0.00025, 0.00006],
      [0.0001, 0.00015, 0.00006, 0.0016],
    ];
    const budgets = [0.25, 0.25, 0.25, 0.25];

    const result = solveErcCcd(cov, budgets, 1e-4, 25);

    expect(result.converged).toBe(true);
    expect(result.iterations).toBeLessThanOrEqual(25);
    expect(result.maxDiscrepancy).toBeLessThanOrEqual(1e-4);

    // Sum of weights equals 1.0
    const sumW = result.weights.reduce((a, b) => a + b, 0);
    expect(Math.abs(sumW - 1.0)).toBeLessThan(1e-5);

    // Relative risk contributions sum to 1.0
    const sumRc = result.riskContributions.reduce((a, b) => a + b, 0);
    expect(Math.abs(sumRc - 1.0)).toBeLessThan(1e-5);

    // Each strategy risk contribution is within 1e-4 of budget 0.25
    for (let i = 0; i < 4; i++) {
      expect(Math.abs(result.riskContributions[i] - 0.25)).toBeLessThanOrEqual(1e-4);
    }
  });

  it('stabilized quadratic root handles both positive and negative ci without NaN', () => {
    // Diagonal matrix with zero cross-correlation: ci = 0
    const covZeroC: number[][] = [
      [0.0004, 0, 0, 0],
      [0, 0.0009, 0, 0],
      [0, 0, 0.00025, 0],
      [0, 0, 0, 0.0016],
    ];
    const resultZeroC = solveErcCcd(covZeroC, [0.25, 0.25, 0.25, 0.25], 1e-4, 25);
    expect(resultZeroC.converged).toBe(true);
    expect(resultZeroC.iterations).toBeLessThanOrEqual(5);

    // High negative cross-correlation: ci < 0
    const covNegC: number[][] = [
      [0.001, -0.0003, -0.0002, 0.0001],
      [-0.0003, 0.001, 0.0001, -0.0002],
      [-0.0002, 0.0001, 0.001, -0.0003],
      [0.0001, -0.0002, -0.0003, 0.001],
    ];
    const resultNegC = solveErcCcd(covNegC, [0.25, 0.25, 0.25, 0.25], 1e-4, 25);
    expect(resultNegC.converged).toBe(true);
    expect(resultNegC.maxDiscrepancy).toBeLessThanOrEqual(1e-4);
  });

  it('assigns lower weights to higher volatility strategies under equal risk budget', () => {
    const cov: number[][] = [
      [0.0001, 0, 0, 0], // low vol (std = 0.01)
      [0, 0.0004, 0, 0], // med vol (std = 0.02)
      [0, 0, 0.0009, 0], // high vol (std = 0.03)
      [0, 0, 0, 0.0016], // ultra vol (std = 0.04)
    ];
    const result = solveErcCcd(cov, [0.25, 0.25, 0.25, 0.25], 1e-4, 25);

    // w_0 > w_1 > w_2 > w_3
    expect(result.weights[0]).toBeGreaterThan(result.weights[1]);
    expect(result.weights[1]).toBeGreaterThan(result.weights[2]);
    expect(result.weights[2]).toBeGreaterThan(result.weights[3]);
  });

  it('ErcParitySolver class solves for CovarianceMatrix and returns typed Record', () => {
    const covMatrix: CovarianceMatrix = {
      engines: [...ENGINE_IDS],
      matrix: [
        [0.0004, 0.00005, 0.00002, 0.00008],
        [0.00005, 0.0006, 0.00004, 0.00007],
        [0.00002, 0.00004, 0.0003, 0.00003],
        [0.00008, 0.00007, 0.00003, 0.0008],
      ],
      observations: 50,
      lastUpdated: Date.now(),
      isConditioned: true,
    };

    const solver = new ErcParitySolver({ tolerance: 1e-4, maxIterations: 25 });
    const result = solver.solve(covMatrix, {
      arbitrage: 0.30,
      marl: 0.30,
      amm: 0.20,
      'alpha-lab': 0.20,
    });

    expect(result.converged).toBe(true);
    expect(result.maxDiscrepancy).toBeLessThanOrEqual(1e-4);
    expect(result.portfolioVolatility).toBeGreaterThan(0);
    expect(result.weights.arbitrage).toBeGreaterThan(0);
  });
});
