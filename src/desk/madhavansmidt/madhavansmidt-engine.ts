import { MadhavanSmidtParams, MadhavanSmidtResult } from './madhavansmidt-types.js';
import { MadhavanSmidtMath } from './madhavansmidt-math.js';

export class MadhavanSmidtEngine {
  public static validate(params: MadhavanSmidtParams): void {
    if (!params.observations || params.observations.length < 10) {
      throw new Error('Madhavan-Smidt model requires at least 10 observations');
    }
  }

  /**
   * Madhavan & Smidt (1991) Specialist Inventory & Bayesian Learning Model:
   * Price change equation:
   * Delta P_t = P_t - P_{t-1} = theta * (D_t * V_t) + gamma * (I_t - I_0) + phi * D_t + epsilon_t
   * where:
   *   theta: adverse selection (Bayesian belief update from signed volume)
   *   gamma: inventory control parameter
   *   phi: order processing fee / spread parameter
   * Simplified structural decomposition using signed volume and inventory deviation.
   */
  public static estimate(params: MadhavanSmidtParams): MadhavanSmidtResult {
    this.validate(params);
    const obs = params.observations;
    const n = obs.length;
    const targetInv = params.targetInventory ?? 0;

    const deltaP: number[] = [];
    const signedVol: number[] = [];
    const invDev: number[] = [];
    const inventories: number[] = [];
    const directions: number[] = [];

    for (let t = 0; t < n; t++) {
      const dp = obs[t].nextQuoteMidpoint - obs[t].priorQuoteMidpoint;
      const qv = obs[t].tradeDirection * obs[t].tradeVolume;
      const dev = obs[t].inventory - targetInv;

      deltaP.push(dp);
      signedVol.push(qv);
      invDev.push(dev);
      inventories.push(obs[t].inventory);
      directions.push(obs[t].tradeDirection);
    }

    // Regress Delta P on signedVol and invDev
    const [rawTheta, rawGamma] = MadhavanSmidtMath.multipleRegressionNoIntercept(
      deltaP,
      signedVol,
      invDev
    );

    const adverseSelectionWeight = Math.max(0, rawTheta);
    // specialist shading quotes lower when inventory is positive => gamma <= 0 in price revision
    const inventoryHoldingCost = Math.abs(rawGamma);

    // Estimate order processing cost phi from trade price deviation relative to midpoint
    const deviations: number[] = [];
    for (let t = 0; t < n; t++) {
      const dev = (obs[t].tradePrice - obs[t].priorQuoteMidpoint) * obs[t].tradeDirection;
      deviations.push(dev);
    }
    const orderProcessingCost = Math.max(0, MadhavanSmidtMath.mean(deviations));

    return {
      adverseSelectionWeight,
      inventoryHoldingCost,
      orderProcessingCost,
      expectedInventoryMean: MadhavanSmidtMath.mean(inventories),
      sampleSize: n,
    };
  }
}
