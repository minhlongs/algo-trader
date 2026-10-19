import { LsbParams, LsbDecompositionResult } from './lsb-types.js';
import { LsbMath } from './lsb-math.js';

export class LsbEngine {
  public static validate(params: LsbParams): void {
    if (!params.observations || params.observations.length < 10) {
      throw new Error('LSB spread decomposition requires at least 10 observations');
    }
  }

  /**
   * Decomposes the bid-ask spread using Lin, Sanger, and Booth (1995):
   * Delta Q_{t+1} = lambda * z_t + e_{t+1}  (Quote revision regression)
   * z_{t+1} = delta * z_t + u_{t+1}         (Order persistence regression)
   * where:
   *   z_t = P_t - Q_t (trade deviation from midpoint)
   *   lambda: adverse selection parameter
   *   delta: order persistence parameter
   * Fractions:
   *   Adverse selection: lambda
   *   Order processing: (1 - lambda) * (1 - delta)
   *   Inventory holding: (1 - lambda) * delta
   */
  public static decomposeSpread(params: LsbParams): LsbDecompositionResult {
    this.validate(params);
    const obs = params.observations;
    const n = obs.length;

    const midpoints: number[] = [];
    const spreads: number[] = [];
    const z: number[] = [];
    const effectiveSpreads: number[] = [];

    for (let t = 0; t < n; t++) {
      const mid = 0.5 * (obs[t].bid + obs[t].ask);
      midpoints.push(mid);
      spreads.push(obs[t].ask - obs[t].bid);
      const halfEff = obs[t].tradePrice - mid;
      z.push(halfEff);
      effectiveSpreads.push(2.0 * Math.abs(halfEff));
    }

    const deltaQ: number[] = [];
    const lagZ: number[] = [];
    const zNext: number[] = [];
    const zCur: number[] = [];

    for (let t = 0; t < n - 1; t++) {
      deltaQ.push(midpoints[t + 1] - midpoints[t]);
      lagZ.push(z[t]);
      zNext.push(z[t + 1]);
      zCur.push(z[t]);
    }

    // Regress deltaQ on lagZ to obtain adverse selection lambda
    const rawLambda = LsbMath.olsSlope(lagZ, deltaQ, false);
    const lambda = Math.min(1.0, Math.max(0.0, rawLambda));

    // Regress zNext on zCur to obtain order persistence delta
    const rawDelta = LsbMath.olsSlope(zCur, zNext, false);
    const delta = Math.min(1.0, Math.max(0.0, rawDelta));

    // Decompose fractions
    const adverseSelectionFraction = lambda;
    const orderProcessingFraction = Math.max(0, (1.0 - lambda) * (1.0 - delta));
    const inventoryHoldingFraction = Math.max(0, (1.0 - lambda) * delta);

    return {
      quotedSpread: LsbMath.mean(spreads),
      effectiveSpread: LsbMath.mean(effectiveSpreads),
      adverseSelectionFraction,
      orderProcessingFraction,
      inventoryHoldingFraction,
      orderPersistence: delta,
      sampleSize: n,
    };
  }
}
