import { RiskParityResult } from './portfolio-types';

export class RiskParityOptimizer {
  /**
   * Cyclical Coordinate Descent / Fixed Point algorithm solving for Equal Risk Contribution (ERC):
   * Solves w_i * (Sigma * w)_i = (1 / N) * w^T * Sigma * w for all i.
   */
  public optimizeEqualRiskContribution(
    covMatrix: number[][],
    maxIterations = 200,
    tolerance = 1e-4
  ): RiskParityResult {
    const N = covMatrix.length;
    if (N < 2) throw new Error('At least 2 assets required for risk parity');

    // Initial weights inversely proportional to standard deviation: w_i ~ 1 / sigma_i
    let w: number[] = new Array(N);
    for (let i = 0; i < N; i++) {
      const vol = Math.sqrt(Math.max(1e-8, covMatrix[i]![i]!));
      w[i] = 1.0 / vol;
    }
    const initialSum = w.reduce((a, b) => a + b, 0);
    w = w.map((v) => v / initialSum);

    let converged = false;
    let iter = 0;

    for (iter = 0; iter < maxIterations; iter++) {
      // Current portfolio variance
      const sigmaW: number[] = new Array(N).fill(0);
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) sigmaW[i] += covMatrix[i]![j]! * w[j]!;
      }
      let portVar = 0;
      for (let i = 0; i < N; i++) portVar += w[i]! * sigmaW[i]!;

      const targetRisk = portVar / N;
      let maxDelta = 0;

      for (let i = 0; i < N; i++) {
        // Quadratic equation for w_i: a * w_i^2 + b * w_i - targetRisk = 0
        const a = covMatrix[i]![i]!;
        let b = 0;
        for (let j = 0; j < N; j++) {
          if (j !== i) b += covMatrix[i]![j]! * w[j]!;
        }

        const disc = b * b + 4 * a * targetRisk;
        const nextW_i = (-b + Math.sqrt(Math.max(0, disc))) / (2 * a);

        const delta = Math.abs(nextW_i - w[i]!);
        if (delta > maxDelta) maxDelta = delta;
        w[i] = Math.max(1e-6, nextW_i);
      }

      // Re-normalize
      const sumW = w.reduce((acc, val) => acc + val, 0);
      w = w.map((val) => val / sumW);

      if (maxDelta < tolerance) {
        converged = true;
        break;
      }
    }

    // Final risk contributions
    const finalSigmaW: number[] = new Array(N).fill(0);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) finalSigmaW[i] += covMatrix[i]![j]! * w[j]!;
    }

    let finalVar = 0;
    for (let i = 0; i < N; i++) finalVar += w[i]! * finalSigmaW[i]!;
    const portVol = Math.sqrt(Math.max(1e-8, finalVar));

    const mrc: number[] = finalSigmaW.map((sw) => sw / portVol);
    const trc: number[] = w.map((wi, i) => wi * mrc[i]!);

    const trcPct = trc.map((val) => (val / portVol) * 100);
    const minTrc = Math.min(...trcPct);
    const maxTrc = Math.max(...trcPct);
    const maxDisparityPct = maxTrc - minTrc;

    return {
      weights: w.map((val) => Number(val.toFixed(6))),
      marginalRiskContributions: mrc.map((val) => Number(val.toFixed(6))),
      totalRiskContributions: trc.map((val) => Number(val.toFixed(6))),
      portfolioVolatilityPct: Number((portVol * 100).toFixed(4)),
      maxDisparityPct: Number(maxDisparityPct.toFixed(4)),
      converged,
      iterations: iter + 1,
    };
  }
}
