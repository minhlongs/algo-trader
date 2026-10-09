/**
 * Stoll (1989) Microstructure Covariance Spread Decomposition Engine
 * Decomposes bid-ask spread into adverse selection (alpha),
 * inventory holding cost (beta), and order processing cost (gamma).
 */

import {
  Stoll89Params,
  Stoll89Decomposition,
} from './stoll89-types.js';
import { Stoll89Math } from './stoll89-math.js';

export class Stoll89Engine {
  public static validate(params: Stoll89Params): void {
    if (!params.observations || params.observations.length < 5) {
      throw new Error('Stoll (1989) model requires at least 5 trade observations');
    }
  }

  public static decompose(params: Stoll89Params): Stoll89Decomposition {
    this.validate(params);
    const obs = params.observations;
    const n = obs.length;

    const midpoints: number[] = [];
    const spreads: number[] = [];
    const effectiveSpreads: number[] = [];
    const directions: number[] = [];

    let lastDir = 1;
    for (let i = 0; i < n; i++) {
      const mid = (obs[i].bidPrice + obs[i].askPrice) / 2.0;
      const spread = obs[i].askPrice - obs[i].bidPrice;
      const effSpread = 2.0 * Math.abs(obs[i].tradePrice - mid);

      let dir = obs[i].tradeDirection;
      if (dir === undefined || dir === 0) {
        if (obs[i].tradePrice > mid) dir = 1;
        else if (obs[i].tradePrice < mid) dir = -1;
        else dir = lastDir;
      }
      lastDir = dir;

      midpoints.push(mid);
      spreads.push(spread);
      effectiveSpreads.push(effSpread);
      directions.push(dir);
    }

    // Compute empirical reversal probability pi
    let reversalCount = 0;
    for (let i = 1; i < n; i++) {
      if (directions[i] !== directions[i - 1]) {
        reversalCount++;
      }
    }
    const empiricalPi = (n > 1) ? reversalCount / (n - 1) : 0.5;
    const pi = params.reversalProbability ?? Math.max(0.05, Math.min(0.95, empiricalPi));

    // Price changes and midpoint revisions
    const deltaP: number[] = [];
    const deltaM: number[] = [];
    for (let i = 1; i < n; i++) {
      deltaP.push(obs[i].tradePrice - obs[i - 1].tradePrice);
      deltaM.push(midpoints[i] - midpoints[i - 1]);
    }

    const covP = Stoll89Math.autocovariance(deltaP, 1);
    const covM = Stoll89Math.autocovariance(deltaM, 1);

    const avgSpread = Math.max(0.0001, Stoll89Math.mean(spreads));
    const avgEffSpread = Stoll89Math.mean(effectiveSpreads);
    const sSquared = avgSpread * avgSpread;

    // Stoll (1989) System of Autocovariances:
    // Cov(Delta M_t, Delta M_{t-1}) = (1/4) * S^2 * alpha * pi * (1 - pi)
    // Cov(Delta P_t, Delta P_{t-1}) = - (1/4) * S^2 * [alpha * (1 - pi)^2 + beta]
    const piFactor = pi * (1.0 - pi);
    let alpha = 0;
    if (piFactor > 0.0001 && covM > 0) {
      alpha = (4.0 * covM) / (sSquared * piFactor);
    } else if (covM > 0) {
      alpha = Math.min(1.0, (2.0 * covM) / sSquared);
    }
    alpha = Math.max(0.0, Math.min(0.85, alpha));

    // Solve for inventory holding fraction beta
    const negCovP = -covP;
    let beta = 0;
    if (negCovP > 0) {
      const rawCombined = (4.0 * negCovP) / sSquared;
      beta = rawCombined - alpha * Math.pow(1.0 - pi, 2);
    }
    beta = Math.max(0.0, Math.min(1.0 - alpha, beta));

    // Order processing fraction gamma = 1 - alpha - beta
    const gamma = Math.max(0.0, 1.0 - alpha - beta);

    return {
      quotedSpread: avgSpread,
      effectiveSpread: avgEffSpread,
      adverseSelectionShare: alpha,
      inventoryHoldingShare: beta,
      orderProcessingShare: gamma,
      priceAutocovariance: covP,
      midpointAutocovariance: covM,
      reversalProbability: pi,
      sampleSize: n,
    };
  }
}
