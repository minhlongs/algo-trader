export class ObizhaevaWangMath {
  public static calculateOptimalSchedule(
    q0: number,
    t: number,
    n: number,
    rho: number
  ): { x0: number; xk: number; xn: number; tau: number } {
    const tau = t / n;
    // In discrete Obizhaeva-Wang (2013) with N execution intervals (N+1 execution points: k=0..N):
    // The schedule satisfies x_0 + (n - 1) * x_k + x_N = Q_0.
    // By symmetry between boundary trades: x_0 = x_N.
    // In continuous limit, x_0 = x_T = Q_0 / (2 + rho * T) and rate u(t) = rho * Q_0 / (2 + rho * T).
    // In discrete time over N intervals:
    // With x_k = rho * tau * x_0,
    // total = 2 * x_0 + (n - 1) * rho * tau * x_0 = x_0 * (2 + (n - 1) * rho * tau).
    const denom = 2.0 + (n - 1) * rho * tau;
    const x0 = q0 / denom;
    const xn = x0;
    const xk = rho * tau * x0;

    return { x0, xk, xn, tau };
  }

  public static calculateCost(
    trades: number[],
    tau: number,
    rho: number,
    lambda: number,
    halfSpread: number
  ): { totalCost: number; sliceCosts: number[] } {
    const n = trades.length;
    const decay = Math.exp(-rho * tau);
    let bookImpact = 0.0;
    let totalCost = 0.0;
    const sliceCosts: number[] = new Array(n);

    for (let k = 0; k < n; k++) {
      const x = trades[k];
      if (k > 0) {
        bookImpact = bookImpact * decay;
      }
      // Immediate impact + half spread
      const priceConcession = halfSpread + bookImpact + 0.5 * lambda * x;
      const cost = x * priceConcession;
      sliceCosts[k] = cost;
      totalCost += cost;

      // Update book impact post-trade
      bookImpact += lambda * x;
    }

    return { totalCost, sliceCosts };
  }

  public static calculateTwapTrades(q0: number, steps: number): number[] {
    const sliceSize = q0 / (steps + 1);
    return new Array(steps + 1).fill(sliceSize);
  }
}
