/**
 * Pure Gaussian, Cholesky, and Black-76 math helpers for the LIBOR Market Model (LMM).
 */

import { LmmCapletSpec, LmmTenorStructure, LmmVolatilitySpec } from './lmm-types';
import { LmmDriftCalculator } from './lmm-drift-calculator';

/**
 * Standard cumulative normal distribution function
 */
export function normalCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Analytic Black-76 benchmark price for a Caplet on forward rate L_k
 */
export function priceCapletBlack76(
  initialForwardRates: number[],
  tenors: LmmTenorStructure,
  vols: LmmVolatilitySpec,
  spec: LmmCapletSpec,
  initialTerminalBondPrice = 1.0,
): number {
  const k = spec.resetTenorIndex;
  const tau_k = tenors.yearFractions[k]!;
  const L_0 = initialForwardRates[k]!;
  const K = spec.strikeRate;
  const sigma = vols.volatilities[k]!;
  const T_reset = tenors.tenorDates[k - 1] ?? (tenors.tenorDates[0]! * k) / (k + 1);

  if (T_reset <= 0 || sigma <= 0) {
    return tau_k * Math.max(0, L_0 - K);
  }

  const stdDev = sigma * Math.sqrt(T_reset);
  const d1 = (Math.log(L_0 / K) + 0.5 * sigma * sigma * T_reset) / stdDev;
  const d2 = d1 - stdDev;

  const notional = spec.notional ?? 1.0;
  const P_0_Tk = initialTerminalBondPrice * LmmDriftCalculator.computeTerminalRatioInverse(k, initialForwardRates, tenors);

  const blackUndiscounted = L_0 * normalCdf(d1) - K * normalCdf(d2);
  return notional * tau_k * (initialTerminalBondPrice / P_0_Tk) * blackUndiscounted;
}

/**
 * Cholesky decomposition of symmetric positive-definite correlation matrix
 */
export function choleskyDecomposition(matrix: number[][]): number[][] {
  const n = matrix.length;
  const L: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) {
        sum += L[i]![k]! * L[j]![k]!;
      }

      if (i === j) {
        const val = matrix[i]![i]! - sum;
        L[i]![j] = Math.sqrt(Math.max(1e-12, val));
      } else {
        L[i]![j] = (matrix[i]![j]! - sum) / L[j]![j]!;
      }
    }
  }
  return L;
}

/**
 * Correlate independent Gaussian draws using Cholesky factor L
 */
export function correlateGaussians(choleskyL: number[][], z: number[]): number[] {
  const n = z.length;
  const correlated: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j <= i; j++) {
      sum += choleskyL[i]![j]! * z[j]!;
    }
    correlated[i] = sum;
  }
  return correlated;
}

/**
 * Standard Box-Muller generator for independent standard Gaussian draws
 */
export function generateStandardNormals(count: number): number[] {
  const normals: number[] = [];
  for (let i = 0; i < count; i += 2) {
    const u1 = Math.max(1e-12, Math.random());
    const u2 = Math.random();
    const radius = Math.sqrt(-2.0 * Math.log(u1));
    const theta = 2.0 * Math.PI * u2;
    normals.push(radius * Math.cos(theta));
    if (i + 1 < count) {
      normals.push(radius * Math.sin(theta));
    }
  }
  return normals;
}
