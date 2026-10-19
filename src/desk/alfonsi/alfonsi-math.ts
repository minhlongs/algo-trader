import { ExecutionSlice } from './alfonsi-types';

export class AlfonsiMath {
  // Computes post-trade price shift given pre-trade shift and trade size
  public static postTradeShift(
    preShift: number,
    quantity: number,
    delta: number,
    alpha: number
  ): number {
    if (quantity <= 0) return preShift;
    const p1 = Math.pow(Math.max(0, preShift), delta + 1.0);
    const added = ((delta + 1.0) / alpha) * quantity;
    return Math.pow(p1 + added, 1.0 / (delta + 1.0));
  }

  // Computes total cash paid for a slice: S_0 * x + integral of price impact
  public static tradeCashSpent(
    s0: number,
    preShift: number,
    postShift: number,
    quantity: number,
    delta: number,
    alpha: number
  ): number {
    if (quantity <= 0) return 0.0;
    const baseVal = s0 * quantity;
    const shiftPart =
      (alpha / (delta + 2.0)) *
      (Math.pow(postShift, delta + 2.0) - Math.pow(Math.max(0, preShift), delta + 2.0));
    return baseVal + shiftPart;
  }

  // Exponential resilience recovery of extra spread over dt
  public static decayShift(postShift: number, rho: number, dt: number): number {
    return postShift * Math.exp(-rho * dt);
  }

  // Closed-form U-shaped optimal execution schedule
  public static generateOptimalSchedule(
    xTotal: number,
    n: number,
    rho: number,
    dt: number,
    delta: number = 0.0
  ): number[] {
    if (n === 1) return [xTotal];
    const decay = Math.exp(-rho * dt);
    // Intermediate trading intensity factor
    const intermediateFactor = Math.pow(1.0 - decay, 1.0 / (delta + 1.0));
    const denom = 2.0 + (n - 2) * intermediateFactor;
    const xBoundary = xTotal / Math.max(1e-6, denom);
    const xInter = xBoundary * intermediateFactor;

    const schedule = new Array(n).fill(xInter);
    schedule[0] = xBoundary;
    schedule[n - 1] = xBoundary;

    // Normalize to guarantee exact sum = xTotal
    const total = schedule.reduce((acc, v) => acc + v, 0.0);
    return schedule.map((v) => (v / total) * xTotal);
  }

  // Simulates price impact dynamics across trading intervals
  public static simulateSchedule(
    s0: number,
    schedule: number[],
    delta: number,
    alpha: number,
    rho: number,
    dt: number
  ): { totalCash: number; terminalShift: number; slices: ExecutionSlice[] } {
    let currentShift = 0.0;
    let totalCash = 0.0;
    const slices: ExecutionSlice[] = [];

    for (let i = 0; i < schedule.length; i++) {
      const q = schedule[i];
      const preShift = currentShift;
      const postShift = this.postTradeShift(preShift, q, delta, alpha);
      const cash = this.tradeCashSpent(s0, preShift, postShift, q, delta, alpha);
      const avgPrice = q > 0 ? cash / q : s0 + preShift;

      slices.push({
        step: i + 1,
        quantity: q,
        preTradePriceShift: preShift,
        postTradePriceShift: postShift,
        averageExecutionPrice: avgPrice,
        cashSpent: cash,
      });

      totalCash += cash;

      // Resilience decay between steps
      if (i < schedule.length - 1) {
        currentShift = this.decayShift(postShift, rho, dt);
      } else {
        currentShift = postShift;
      }
    }

    return { totalCash, terminalShift: currentShift, slices };
  }
}
