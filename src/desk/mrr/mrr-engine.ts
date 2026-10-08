import { MrrDecompositionResult, MrrObservation } from './mrr-types';

export class MrrEngine {
  public estimateModel(data: MrrObservation[]): MrrDecompositionResult {
    const N = data.length;
    if (N < 15) throw new Error('At least 15 observations required for MRR model estimation');

    // 1. Calculate trade autocorrelation rho: Cov(x_t, x_{t-1}) / Var(x_{t-1})
    let sumXX = 0;
    let sumXPrevSq = 0;
    for (let t = 1; t < N; t++) {
      const xCurr = data[t]!.signedTrade;
      const xPrev = data[t - 1]!.signedTrade;
      sumXX += xCurr * xPrev;
      sumXPrevSq += xPrev * xPrev;
    }
    const rawRho = sumXPrevSq > 0 ? sumXX / sumXPrevSq : 0.0;
    // Bound rho strictly in (-0.99, 0.99) for numerical stability
    const rho = Math.max(-0.99, Math.min(0.99, rawRho));

    // 2. OLS regression: Delta p_t = beta1 * x_t + beta2 * x_{t-1} + e_t
    let s11 = 0, s12 = 0, s22 = 0;
    let sy1 = 0, sy2 = 0;

    for (let t = 1; t < N; t++) {
      const deltaP = data[t]!.price - data[t - 1]!.price;
      const xCurr = data[t]!.signedTrade;
      const xPrev = data[t - 1]!.signedTrade;

      s11 += xCurr * xCurr;
      s12 += xCurr * xPrev;
      s22 += xPrev * xPrev;

      sy1 += deltaP * xCurr;
      sy2 += deltaP * xPrev;
    }

    const det = s11 * s22 - s12 * s12 + 1e-12;
    const inv11 = s22 / det;
    const inv12 = -s12 / det;
    const inv22 = s11 / det;

    const beta1 = sy1 * inv11 + sy2 * inv12;
    const beta2 = sy1 * inv12 + sy2 * inv22;

    // 3. Structural mapping: beta1 = phi + theta, beta2 = -(phi + rho * theta)
    // beta1 + beta2 = theta * (1 - rho) => theta = (beta1 + beta2) / (1 - rho)
    const thetaEst = (beta1 + beta2) / (1.0 - rho);
    const theta = Math.max(0.0, thetaEst);
    const phi = Math.max(0.0, beta1 - theta);

    // 4. Compute residual variance (public information variance sigma_u^2)
    let residualSumSq = 0;
    for (let t = 1; t < N; t++) {
      const deltaP = data[t]!.price - data[t - 1]!.price;
      const xCurr = data[t]!.signedTrade;
      const xPrev = data[t - 1]!.signedTrade;
      const fitted = beta1 * xCurr + beta2 * xPrev;
      const err = deltaP - fitted;
      residualSumSq += err * err;
    }
    const sigmaUSq = residualSumSq / Math.max(1, N - 3);

    const halfSpread = phi + theta;
    const adverseShare = halfSpread > 1e-12 ? (theta / halfSpread) * 100.0 : 0.0;
    const orderShare = halfSpread > 1e-12 ? (phi / halfSpread) * 100.0 : 0.0;

    return {
      adverseSelectionTheta: Number(theta.toFixed(4)),
      orderProcessingPhi: Number(phi.toFixed(4)),
      tradeAutocorrelationRho: Number(rho.toFixed(4)),
      impliedHalfSpread: Number(halfSpread.toFixed(4)),
      adverseSelectionSharePct: Number(adverseShare.toFixed(2)),
      orderProcessingSharePct: Number(orderShare.toFixed(2)),
      publicInformationVariance: Number(sigmaUSq.toFixed(6)),
      sampleSize: N,
    };
  }
}
