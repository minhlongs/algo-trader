import { HuangStollDecompositionResult, HuangStollTick } from './huang-stoll-types';

export class HuangStollEngine {
  public decomposeSpread(ticks: HuangStollTick[]): HuangStollDecompositionResult {
    const N = ticks.length;
    if (N < 20) {
      throw new Error('At least 20 tick observations required for Huang-Stoll spread decomposition');
    }

    let sameDirectionCount = 0;
    let totalHalfSpread = 0;

    for (let t = 0; t < N; t++) {
      const halfSpread = 0.5 * (ticks[t]!.ask - ticks[t]!.bid);
      totalHalfSpread += halfSpread;
      if (t > 0 && ticks[t]!.signedTrade === ticks[t - 1]!.signedTrade) {
        sameDirectionCount++;
      }
    }

    const pi = sameDirectionCount / (N - 1);
    const avgHalfSpread = totalHalfSpread / N;

    // Regress Delta M_t = lambda1 * (S_t * Q_t) + lambda2 * (S_t * Q_{t-1}) + eps
    // where M_t is quote midpoint = 0.5 * (A_t + B_t)
    let s11 = 0;
    let s12 = 0;
    let s22 = 0;
    let sy1 = 0;
    let sy2 = 0;

    for (let t = 1; t < N; t++) {
      const mCurr = 0.5 * (ticks[t]!.ask + ticks[t]!.bid);
      const mPrev = 0.5 * (ticks[t - 1]!.ask + ticks[t - 1]!.bid);
      const deltaM = mCurr - mPrev;

      const s_t = 0.5 * (ticks[t]!.ask - ticks[t]!.bid);
      const x1 = s_t * ticks[t]!.signedTrade;
      const x2 = s_t * ticks[t - 1]!.signedTrade;

      s11 += x1 * x1;
      s12 += x1 * x2;
      s22 += x2 * x2;
      sy1 += deltaM * x1;
      sy2 += deltaM * x2;
    }

    const det = s11 * s22 - s12 * s12 + 1e-12;
    const inv11 = s22 / det;
    const inv12 = -s12 / det;
    const inv22 = s11 / det;

    const lambda1 = sy1 * inv11 + sy2 * inv12;
    const lambda2 = sy1 * inv12 + sy2 * inv22;

    // Structural mapping:
    // lambda1 = alpha + beta
    // lambda2 = -beta
    let beta = Math.max(0.0, -lambda2);
    let alpha = Math.max(0.0, lambda1 - beta);
    if (alpha + beta > 0.99) {
      const scale = 0.95 / (alpha + beta);
      alpha *= scale;
      beta *= scale;
    }
    const gamma = Math.max(0.01, 1.0 - alpha - beta);

    const adverseCost = alpha * avgHalfSpread;
    const inventoryCost = beta * avgHalfSpread;
    const orderCost = gamma * avgHalfSpread;

    return {
      adverseSelectionAlpha: Number(alpha.toFixed(4)),
      inventoryHoldingBeta: Number(beta.toFixed(4)),
      orderProcessingGamma: Number(gamma.toFixed(4)),
      averageHalfSpread: Number(avgHalfSpread.toFixed(4)),
      tradePersistencePi: Number(pi.toFixed(4)),
      adverseSelectionCost: Number(adverseCost.toFixed(4)),
      inventoryHoldingCost: Number(inventoryCost.toFixed(4)),
      orderProcessingCost: Number(orderCost.toFixed(4)),
      sampleSize: N,
    };
  }
}
