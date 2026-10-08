import { CopulaParameters, CopulaSignalResult, PairObservation } from './copula-types';

export class ClaytonCopulaPairsEngine {
  public fitClayton(observations: PairObservation[]): CopulaParameters {
    if (observations.length < 5) {
      throw new Error('At least 5 observations required to fit copula');
    }

    // Estimate Kendall's Tau: tau = (concordant - discordant) / (N * (N - 1) / 2)
    const n = Math.min(observations.length, 2000); // Resource bound
    let concordant = 0;
    let discordant = 0;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = observations[i]!.returnX - observations[j]!.returnX;
        const dy = observations[i]!.returnY - observations[j]!.returnY;
        const prod = dx * dy;
        if (prod > 0) concordant++;
        else if (prod < 0) discordant++;
      }
    }

    const totalPairs = (n * (n - 1)) / 2;
    const tau = totalPairs > 0 ? (concordant - discordant) / totalPairs : 0.5;
    const clampedTau = Math.max(0.01, Math.min(0.95, tau));

    // Clayton relationship: tau = theta / (theta + 2) => theta = 2 * tau / (1 - tau)
    const theta = (2.0 * clampedTau) / (1.0 - clampedTau);

    // Clayton tail dependence: lambda_L = 2^(-1 / theta), lambda_U = 0
    const lowerTail = Math.pow(2.0, -1.0 / theta);

    return {
      copulaType: 'CLAYTON',
      parameterTheta: Number(theta.toFixed(4)),
      kendallTau: Number(clampedTau.toFixed(4)),
      lowerTailDependence: Number(lowerTail.toFixed(4)),
      upperTailDependence: 0.0,
    };
  }

  public computeConditionalSignal(
    u: number,
    v: number,
    theta: number,
    thresholdLower = 0.05,
    thresholdUpper = 0.95
  ): CopulaSignalResult {
    const safeU = Math.max(0.001, Math.min(0.999, u));
    const safeV = Math.max(0.001, Math.min(0.999, v));
    const safeTheta = Math.max(0.01, theta);

    // For Clayton copula: P(V <= v | U = u) = partial C / partial u
    // C(u, v) = (u^(-theta) + v^(-theta) - 1)^(-1 / theta)
    // partial C / partial u = u^(-theta - 1) * (u^(-theta) + v^(-theta) - 1)^(-1 / theta - 1)
    const base = Math.max(1e-6, Math.pow(safeU, -safeTheta) + Math.pow(safeV, -safeTheta) - 1.0);
    const condProb = Math.pow(safeU, -safeTheta - 1.0) * Math.pow(base, -(1.0 / safeTheta) - 1.0);
    const clampedProb = Math.max(0.0, Math.min(1.0, condProb));

    let tradeSignal: 'LONG_SPREAD' | 'SHORT_SPREAD' | 'NEUTRAL' = 'NEUTRAL';
    if (clampedProb < thresholdLower) {
      // Y is unusually low relative to X conditional distribution -> Buy Y, Sell X
      tradeSignal = 'LONG_SPREAD';
    } else if (clampedProb > thresholdUpper) {
      // Y is unusually high relative to X -> Sell Y, Buy X
      tradeSignal = 'SHORT_SPREAD';
    }

    return {
      uPercentileX: Number(safeU.toFixed(4)),
      vPercentileY: Number(safeV.toFixed(4)),
      conditionalProbabilityYGivenX: Number(clampedProb.toFixed(4)),
      tradeSignal,
      mispricingScore: Number((clampedProb - 0.50).toFixed(4)),
    };
  }
}
