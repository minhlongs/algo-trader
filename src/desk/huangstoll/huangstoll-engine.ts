import {
  HuangStollObservation,
  HuangStollDecompositionResult,
} from './huangstoll-types.js';
import { HuangStollMath } from './huangstoll-math.js';

export class HuangStollEngine {
  public static validate(observations: HuangStollObservation[]): void {
    if (observations.length < 10) {
      throw new Error('Huang-Stoll spread decomposition requires at least 10 observations');
    }
  }

  /**
   * Decomposes spread into alpha (adverse selection), gamma (order processing), and inventory holding.
   * Regression: Delta M_t = (alpha + beta) * (S/2) * Q_{t-1} - beta * (S/2) * Q_{t-2} + e_t
   * where S is the constant half-spread normalization.
   */
  public static decomposeSpread(observations: HuangStollObservation[]): HuangStollDecompositionResult {
    this.validate(observations);
    const N = observations.length;

    const y: number[] = [];
    const x1: number[] = [];
    const x2: number[] = [];
    const directions: number[] = observations.map(o => (o.tradeDirection >= 0 ? 1 : -1));

    let sumEffectiveHalfSpread = 0;

    for (let t = 2; t < N; t++) {
      const deltaM = observations[t].quoteMidpoint - observations[t - 1].quoteMidpoint;
      const halfSpread = observations[t - 1].quotedSpread / 2.0;

      y.push(deltaM);
      x1.push(halfSpread * directions[t - 1]);
      x2.push(halfSpread * directions[t - 2]);

      sumEffectiveHalfSpread += Math.abs(observations[t].tradePrice - observations[t].quoteMidpoint);
    }

    const { beta1, beta2 } = HuangStollMath.solve2DRegression(y, x1, x2);

    // beta1 = alpha + beta (inventory parameter)
    // beta2 = -beta
    const betaInv = Math.max(0, -beta2);
    const alphaRaw = Math.max(0, beta1 - betaInv);

    // Normalize proportions
    const totalExplained = alphaRaw + betaInv;
    let alpha = totalExplained > 1.0 ? alphaRaw / totalExplained : alphaRaw;
    let betaComponent = totalExplained > 1.0 ? betaInv / totalExplained : betaInv;
    let gamma = Math.max(0, 1.0 - alpha - betaComponent);

    // Renormalize so alpha + gamma + inventory = 1.0
    const sumComponents = alpha + gamma + betaComponent;
    alpha /= sumComponents;
    gamma /= sumComponents;
    betaComponent /= sumComponents;

    const tradePersistence = HuangStollMath.computeTradePersistence(directions);
    const effectiveSpread = sumEffectiveHalfSpread / (N - 2);

    return {
      adverseSelectionShare: alpha,
      orderProcessingShare: gamma,
      inventoryHoldingShare: betaComponent,
      effectiveSpread,
      tradePersistence,
      sampleSize: N,
    };
  }
}
