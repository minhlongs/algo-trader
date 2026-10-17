import { LmmCapletResult, LmmCapletSpec, LmmTenorStructure, LmmVolatilitySpec } from './lmm-types';
import { LmmDriftCalculator } from './lmm-drift-calculator';
import {
  normalCdf,
  priceCapletBlack76,
  choleskyDecomposition,
  correlateGaussians,
  generateStandardNormals,
} from './lmm-math-helpers';

export {
  normalCdf,
  priceCapletBlack76,
  choleskyDecomposition,
  correlateGaussians,
  generateStandardNormals,
};

export class LmmEngine {
  /**
   * Standard cumulative normal distribution function
   */
  public static normalCdf(x: number): number {
    return normalCdf(x);
  }

  /**
   * Analytic Black-76 benchmark price for a Caplet on forward rate L_k
   * Reset at T_{k-1}, payment at T_k
   * Price = tau_k * P(0, T_k) * [ L_k(0) * N(d1) - K * N(d2) ]
   */
  public static priceCapletBlack76(
    initialForwardRates: number[],
    tenors: LmmTenorStructure,
    vols: LmmVolatilitySpec,
    spec: LmmCapletSpec,
    initialTerminalBondPrice = 1.0,
  ): number {
    return priceCapletBlack76(initialForwardRates, tenors, vols, spec, initialTerminalBondPrice);
  }

  /**
   * Cholesky decomposition of symmetric positive-definite correlation matrix
   */
  public static choleskyDecomposition(matrix: number[][]): number[][] {
    return choleskyDecomposition(matrix);
  }

  /**
   * Correlate independent Gaussian draws using Cholesky factor L
   */
  public static correlateGaussians(choleskyL: number[][], z: number[]): number[] {
    return correlateGaussians(choleskyL, z);
  }

  /**
   * Standard Box-Muller generator for independent standard Gaussian draws
   */
  public static generateStandardNormals(count: number): number[] {
    return generateStandardNormals(count);
  }

  /**
   * Monte Carlo Caplet pricing under terminal measure Q^{T_M}
   */
  public static priceCapletMonteCarlo(
    initialForwardRates: number[],
    tenors: LmmTenorStructure,
    vols: LmmVolatilitySpec,
    spec: LmmCapletSpec,
    numPaths = 2000,
    stepsPerTenor = 5,
  ): LmmCapletResult {
    const k = spec.resetTenorIndex;
    const N = initialForwardRates.length;
    const T_reset = tenors.tenorDates[k - 1] ?? tenors.tenorDates[0]! * 0.5;
    const totalSteps = stepsPerTenor * k;
    const dt = T_reset / Math.max(1, totalSteps);
    const sqrtDt = Math.sqrt(dt);

    const cholesky = this.choleskyDecomposition(vols.correlationMatrix);
    const notional = spec.notional ?? 1.0;
    const tau_k = tenors.yearFractions[k]!;
    const K = spec.strikeRate;

    let payoffSum = 0;
    let payoffSqSum = 0;

    for (let p = 0; p < numPaths; p++) {
      const rates = [...initialForwardRates];

      for (let s = 0; s < totalSteps; s++) {
        const indepZ = this.generateStandardNormals(N);
        const corrZ = this.correlateGaussians(cholesky, indepZ);

        for (let i = 0; i < N; i++) {
          const mu_i = LmmDriftCalculator.calculateTerminalMeasureDrift(i, rates, tenors, vols);
          const sigma_i = vols.volatilities[i]!;
          // Log-Euler discretization
          const driftPart = (mu_i - 0.5 * sigma_i * sigma_i) * dt;
          const diffPart = sigma_i * sqrtDt * corrZ[i]!;
          rates[i] = rates[i]! * Math.exp(driftPart + diffPart);
        }
      }

      // Terminal ratio discount P(T_reset, T_M)
      const ratioInv = LmmDriftCalculator.computeTerminalRatioInverse(k, rates, tenors);
      const capletPayoffAtReset = notional * tau_k * Math.max(0, rates[k]! - K);
      // Discounted back to terminal measure numeraire P(t, T_M)
      const pathValue = capletPayoffAtReset / ratioInv;

      payoffSum += pathValue;
      payoffSqSum += pathValue * pathValue;
    }

    const mcPrice = payoffSum / numPaths;
    const variance = Math.max(0, payoffSqSum / numPaths - mcPrice * mcPrice);
    const standardError = Math.sqrt(variance / numPaths);

    const blackPrice = this.priceCapletBlack76(initialForwardRates, tenors, vols, spec);
    const absoluteError = Math.abs(mcPrice - blackPrice);

    return {
      monteCarloPrice: mcPrice,
      black76BenchmarkPrice: blackPrice,
      absoluteError,
      standardError,
    };
  }
}
