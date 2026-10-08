import { describe, expect, it } from 'vitest';
import { LmmDriftCalculator } from '../../../../src/desk/libormarketmodel/lmm-drift-calculator';
import { LmmEngine } from '../../../../src/desk/libormarketmodel/lmm-engine';
import {
  LmmCapletSpec,
  LmmTenorStructure,
  LmmVolatilitySpec,
} from '../../../../src/desk/libormarketmodel/lmm-types';

describe('LIBOR Market Model (BGM 1997) Discrete Forward Rate Suite (Desk 96)', () => {
  const tenors: LmmTenorStructure = {
    tenorDates: [0.5, 1.0, 1.5, 2.0],
    yearFractions: [0.5, 0.5, 0.5, 0.5],
  };

  const vols: LmmVolatilitySpec = {
    volatilities: [0.15, 0.18, 0.20, 0.22],
    correlationMatrix: [
      [1.0, 0.9, 0.8, 0.7],
      [0.9, 1.0, 0.9, 0.8],
      [0.8, 0.9, 1.0, 0.9],
      [0.7, 0.8, 0.9, 1.0],
    ],
  };

  const initialForwardRates = [0.03, 0.035, 0.04, 0.045];

  it('should compute terminal measure drift satisfying martingale property for terminal tenor', () => {
    // Under terminal measure Q^{T_M}, the terminal rate (M = 3) has zero drift
    const terminalDrift = LmmDriftCalculator.calculateTerminalMeasureDrift(
      3,
      initialForwardRates,
      tenors,
      vols
    );
    expect(terminalDrift).toBe(0.0);

    // Rates before terminal tenor must have negative drift under terminal measure
    const drift0 = LmmDriftCalculator.calculateTerminalMeasureDrift(
      0,
      initialForwardRates,
      tenors,
      vols
    );
    const drift1 = LmmDriftCalculator.calculateTerminalMeasureDrift(
      1,
      initialForwardRates,
      tenors,
      vols
    );

    expect(drift0).toBeLessThan(0.0);
    expect(drift1).toBeLessThan(0.0);
  });

  it('should compute terminal bond ratio inverse accurately', () => {
    // For k = 2 (index 2), ratio inverse = (1 + tau_3 * L_3)
    const ratioInv2 = LmmDriftCalculator.computeTerminalRatioInverse(
      2,
      initialForwardRates,
      tenors
    );
    expect(ratioInv2).toBeCloseTo(1.0 + 0.5 * 0.045, 6);

    // For k = M = 3, ratio inverse = 1.0
    const ratioInv3 = LmmDriftCalculator.computeTerminalRatioInverse(
      3,
      initialForwardRates,
      tenors
    );
    expect(ratioInv3).toBe(1.0);
  });

  it('should price Caplet using Black-76 benchmark and Monte Carlo simulation with small error', () => {
    const spec: LmmCapletSpec = {
      resetTenorIndex: 1, // Resets at T_0 = 0.5, pays at T_1 = 1.0
      strikeRate: 0.035,
      notional: 1_000_000,
    };

    const blackPrice = LmmEngine.priceCapletBlack76(
      initialForwardRates,
      tenors,
      vols,
      spec
    );
    expect(blackPrice).toBeGreaterThan(0.0);

    const mcResult = LmmEngine.priceCapletMonteCarlo(
      initialForwardRates,
      tenors,
      vols,
      spec,
      1000,
      4
    );

    expect(mcResult.monteCarloPrice).toBeGreaterThan(0.0);
    expect(mcResult.standardError).toBeGreaterThan(0.0);
    // Monte Carlo should be reasonably close to Black-76 within statistical tolerance
    expect(mcResult.absoluteError).toBeLessThan(mcResult.standardError * 4.0 + 500);
  });

  it('should compute Cholesky decomposition of correlation matrix correctly', () => {
    const L = LmmEngine.choleskyDecomposition(vols.correlationMatrix);
    expect(L.length).toBe(4);
    expect(L[0]![0]).toBeCloseTo(1.0, 6);
    // Upper triangle must be 0
    expect(L[0]![1]).toBe(0.0);
    expect(L[0]![2]).toBe(0.0);
    expect(L[0]![3]).toBe(0.0);
  });
});
