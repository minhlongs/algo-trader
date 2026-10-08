import { DccCorrelationState } from './regime-types';

export class DynamicConditionalCorrelationEngine {
  /**
   * DCC-GARCH Correlation Step:
   * Q_t = (1 - alpha - beta) * Q_bar + alpha * (e_{t-1} * e_{t-1}^T) + beta * Q_{t-1}
   * R_t = diag(Q_t)^{-1/2} * Q_t * diag(Q_t)^{-1/2}
   */
  public updateCorrelation(
    standardizedResiduals: number[], // e_t for N assets
    unconditionalCorr: number[][], // Q_bar
    prevQ: number[][], // Q_{t-1}
    alpha = 0.05,
    beta = 0.90
  ): DccCorrelationState {
    const N = standardizedResiduals.length;
    const omega = 1.0 - alpha - beta;

    const nextQ: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const shock = standardizedResiduals[i]! * standardizedResiduals[j]!;
        nextQ[i]![j] = omega * unconditionalCorr[i]![j]! + alpha * shock + beta * prevQ[i]![j]!;
      }
    }

    // Correlation normalization R_ij = Q_ij / sqrt(Q_ii * Q_jj)
    const R: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
    let offDiagSum = 0;
    let count = 0;

    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (i === j) {
          R[i]![j] = 1.0;
        } else {
          const denom = Math.sqrt(Math.max(1e-8, nextQ[i]![i]! * nextQ[j]![j]!));
          const corr = Math.max(-1.0, Math.min(1.0, nextQ[i]![j]! / denom));
          R[i]![j] = Number(corr.toFixed(4));
          offDiagSum += corr;
          count++;
        }
      }
    }

    const avgCorr = count > 0 ? offDiagSum / count : 0;
    const isBreakdown = avgCorr > 0.80; // High correlation contagion breakdown

    return {
      assetPairs: Array.from({ length: N }, (_, i) => `Asset_${i + 1}`),
      correlationMatrix: R,
      averageCorrelation: Number(avgCorr.toFixed(4)),
      isCorrelationBreakdown: isBreakdown,
    };
  }
}
