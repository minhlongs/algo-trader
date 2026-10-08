import { FactorCovarianceMatrix, RiskParityResult } from './riskparity-types';

export class FactorRiskParityOptimizer {
  public computeRiskParity(
    covMatrix: FactorCovarianceMatrix,
    maxIterations = 100,
    tolerance = 1e-4
  ): RiskParityResult {
    const n = covMatrix.factors.length;
    const sigma = covMatrix.matrix;

    if (n === 0 || sigma.length !== n) {
      throw new Error('Invalid covariance matrix dimension');
    }

    // Initialize with 1/N weights
    let w = new Array(n).fill(1.0 / n);
    const targetRiskFraction = 1.0 / n;

    for (let iter = 0; iter < maxIterations; iter++) {
      // sigmaW = Sigma * w
      const sigmaW = new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          sigmaW[i] += sigma[i]![j]! * w[j]!;
        }
      }

      // Portfolio variance w^T * Sigma * w
      let portVar = 0;
      for (let i = 0; i < n; i++) {
        portVar += w[i]! * sigmaW[i]!;
      }

      let maxDiff = 0;
      // Coordinate descent update for each asset
      for (let i = 0; i < n; i++) {
        const a = sigma[i]![i]!;
        const b = sigmaW[i]! - a * w[i]!;
        const c = -targetRiskFraction * portVar;

        // Quadratic formula: a * w_i^2 + b * w_i + c = 0
        const discriminant = b * b - 4 * a * c;
        if (discriminant >= 0 && a > 0) {
          const newWi = (-b + Math.sqrt(discriminant)) / (2 * a);
          maxDiff = Math.max(maxDiff, Math.abs(newWi - w[i]!));
          w[i] = Math.max(1e-6, newWi);
        }
      }

      // Re-normalize weights to sum to 1
      const sumW = w.reduce((acc, v) => acc + v, 0);
      w = w.map(v => v / sumW);

      if (maxDiff < tolerance) break;
    }

    // Compute final portfolio metrics
    const sigmaW = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        sigmaW[i] += sigma[i]![j]! * w[j]!;
      }
    }

    let portVar = 0;
    for (let i = 0; i < n; i++) {
      portVar += w[i]! * sigmaW[i]!;
    }
    const portVol = Math.sqrt(Math.max(1e-8, portVar));

    const weights = covMatrix.factors.map((f, i) => ({
      factorName: f,
      weight: Number(w[i]!.toFixed(4)),
    }));

    const marginalRiskContributions = covMatrix.factors.map((f, i) => ({
      factorName: f,
      mcr: Number((sigmaW[i]! / portVol).toFixed(6)),
    }));

    const percentRiskContributions = covMatrix.factors.map((f, i) => {
      const riskContrib = (w[i]! * sigmaW[i]!) / portVar;
      return {
        factorName: f,
        riskPct: Number((riskContrib * 100.0).toFixed(2)),
      };
    });

    const isParityAchieved = percentRiskContributions.every(
      p => Math.abs(p.riskPct - (100.0 / n)) < 2.0
    );

    return {
      weights,
      portfolioVolPct: Number((portVol * 100.0).toFixed(2)),
      marginalRiskContributions,
      percentRiskContributions,
      isParityAchieved,
    };
  }
}
