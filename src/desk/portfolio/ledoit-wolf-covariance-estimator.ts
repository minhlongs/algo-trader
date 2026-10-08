import { LedoitWolfResult } from './portfolio-types';

export class LedoitWolfCovarianceEstimator {
  /**
   * Computes Ledoit-Wolf analytical shrinkage covariance matrix toward
   * the constant correlation target F:
   * Sigma_shrunk = delta * F + (1 - delta) * Sample
   */
  public estimateCovariance(returns: number[][]): LedoitWolfResult {
    const N = returns.length; // Number of assets
    if (N < 2) throw new Error('At least 2 assets required');
    const T = returns[0]!.length; // Number of periods
    if (T < 4) throw new Error('At least 4 time periods required');

    // 1. Center returns
    const mean: number[] = new Array(N).fill(0);
    for (let i = 0; i < N; i++) {
      let sum = 0;
      for (let t = 0; t < T; t++) sum += returns[i]![t]!;
      mean[i] = sum / T;
    }

    const X: number[][] = Array.from({ length: N }, () => new Array(T).fill(0));
    for (let i = 0; i < N; i++) {
      for (let t = 0; t < T; t++) {
        X[i]![t] = returns[i]![t]! - mean[i]!;
      }
    }

    // 2. Sample covariance S
    const S: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        let sum = 0;
        for (let t = 0; t < T; t++) sum += X[i]![t]! * X[j]![t]!;
        S[i]![j] = sum / (T - 1);
      }
    }

    // 3. Sample variances and correlations
    const sampleVar: number[] = new Array(N);
    for (let i = 0; i < N; i++) sampleVar[i] = S[i]![i]!;

    let sumCorr = 0;
    let countCorr = 0;
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const corr = S[i]![j]! / Math.sqrt(Math.max(1e-12, sampleVar[i]! * sampleVar[j]!));
        sumCorr += corr;
        countCorr++;
      }
    }
    const rBar = countCorr > 0 ? sumCorr / countCorr : 0;

    // 4. Shrinkage target F
    const F: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (i === j) F[i]![j] = sampleVar[i]!;
        else F[i]![j] = rBar * Math.sqrt(sampleVar[i]! * sampleVar[j]!);
      }
    }

    // 5. Shrinkage intensity delta
    let piMatSum = 0;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        let sumQ = 0;
        for (let t = 0; t < T; t++) {
          const q = X[i]![t]! * X[j]![t]! - S[i]![j]!;
          sumQ += q * q;
        }
        piMatSum += sumQ / (T - 1);
      }
    }

    let gammaSum = 0;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const diff = F[i]![j]! - S[i]![j]!;
        gammaSum += diff * diff;
      }
    }

    const kappa = piMatSum / Math.max(1e-12, gammaSum);
    const delta = Math.max(0.0, Math.min(1.0, kappa / T));

    // 6. Shrunk covariance
    const shrunk: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        shrunk[i]![j] = Number((delta * F[i]![j]! + (1 - delta) * S[i]![j]!).toFixed(6));
      }
    }

    return {
      shrunkCovariance: shrunk,
      sampleCovariance: S,
      shrinkageIntensity: Number(delta.toFixed(4)),
      averageCorrelation: Number(rBar.toFixed(4)),
    };
  }
}
