import { DavisLoTranche, TrancheResult } from './davis-lo-types';

export class DavisLoMath {
  // Aggregate jump rate from k defaults to k+1 defaults
  public static jumpRate(k: number, n: number, lambda0: number, mu: number): number {
    if (k >= n) return 0.0;
    return (n - k) * (lambda0 + k * mu);
  }

  // Derivatives dp_k/dt for k = 0..n
  public static computeDerivatives(
    p: number[],
    n: number,
    lambda0: number,
    mu: number
  ): number[] {
    const dp = new Array(n + 1).fill(0.0);
    for (let k = 0; k <= n; k++) {
      const rateOut = this.jumpRate(k, n, lambda0, mu);
      const rateIn = k > 0 ? this.jumpRate(k - 1, n, lambda0, mu) : 0.0;
      dp[k] = -rateOut * p[k] + (k > 0 ? rateIn * p[k - 1] : 0.0);
    }
    return dp;
  }

  // RK4 forward solver for state probabilities p_k(T)
  public static solveDefaultDistribution(
    n: number,
    lambda0: number,
    mu: number,
    t: number,
    steps: number = 200
  ): number[] {
    let p = new Array(n + 1).fill(0.0);
    p[0] = 1.0; // Initially 0 defaults at t = 0

    const dt = t / steps;

    for (let s = 0; s < steps; s++) {
      // k1 = f(p)
      const k1 = this.computeDerivatives(p, n, lambda0, mu);

      // p + 0.5 * dt * k1
      const pMid1 = p.map((val, i) => Math.max(0.0, val + 0.5 * dt * k1[i]));
      const k2 = this.computeDerivatives(pMid1, n, lambda0, mu);

      // p + 0.5 * dt * k2
      const pMid2 = p.map((val, i) => Math.max(0.0, val + 0.5 * dt * k2[i]));
      const k3 = this.computeDerivatives(pMid2, n, lambda0, mu);

      // p + dt * k3
      const pEnd = p.map((val, i) => Math.max(0.0, val + dt * k3[i]));
      const k4 = this.computeDerivatives(pEnd, n, lambda0, mu);

      for (let i = 0; i <= n; i++) {
        p[i] = Math.max(0.0, p[i] + (dt / 6.0) * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i]));
      }

      // Re-normalize to ensure exact probability conservation
      const sum = p.reduce((acc, v) => acc + v, 0.0);
      if (sum > 0) {
        for (let i = 0; i <= n; i++) p[i] /= sum;
      }
    }

    return p;
  }

  // Evaluates tranche payoff, protection leg, and spread
  public static evaluateTranche(
    tranche: DavisLoTranche,
    probs: number[],
    n: number,
    recoveryRate: number,
    t: number,
    r: number
  ): TrancheResult {
    const k1 = tranche.attachment;
    const k2 = tranche.detachment;
    const width = Math.max(1e-6, k2 - k1);
    const lgd = 1.0 - recoveryRate;

    let expectedAbsoluteLoss = 0.0;

    for (let k = 0; k <= n; k++) {
      const portLossFraction = (k / n) * lgd;
      const trancheLoss = Math.min(width, Math.max(0.0, portLossFraction - k1));
      expectedAbsoluteLoss += probs[k] * trancheLoss;
    }

    const expectedLossFraction = expectedAbsoluteLoss / width;
    const df = Math.exp(-r * t);

    // Protection leg (present value of expected loss)
    const protectionLeg = expectedAbsoluteLoss * df;

    // Premium annuity leg with average surviving notional
    const avgSurvivingNotional = Math.max(1e-4, 1.0 - 0.5 * expectedLossFraction);
    const annuityLeg = width * avgSurvivingNotional * t * df;

    const trancheSpreadBps =
      annuityLeg > 0 ? (protectionLeg / annuityLeg) * 10000.0 : 0.0;

    return {
      name: tranche.name,
      attachment: tranche.attachment,
      detachment: tranche.detachment,
      width,
      expectedLossFraction,
      expectedLossAmount: expectedAbsoluteLoss,
      protectionLeg,
      annuityLeg,
      trancheSpreadBps,
    };
  }
}
