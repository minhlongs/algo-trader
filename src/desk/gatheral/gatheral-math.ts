import { GatheralKernelParams, ExecutionStep } from './gatheral-types';

export class GatheralMath {
  public static evaluateKernel(kernel: GatheralKernelParams, tau: number): number {
    const t = Math.max(0.0, tau);
    if (kernel.kernelType === 'exponential') {
      return kernel.gamma * Math.exp(-kernel.decayParam * t);
    } else {
      const tau0 = kernel.timeScale ?? 1.0;
      return kernel.gamma * Math.pow(1.0 + t / tau0, -kernel.decayParam);
    }
  }

  public static instantaneousImpact(v: number, lambda: number, delta: number): number {
    if (Math.abs(v) < 1e-12) return 0.0;
    const sign = v < 0 ? -1.0 : 1.0;
    return sign * lambda * Math.pow(Math.abs(v), delta);
  }

  public static simulateExecution(
    s0: number,
    quantities: number[],
    dt: number,
    lambda: number,
    delta: number,
    kernel: GatheralKernelParams
  ): ExecutionStep[] {
    const steps: ExecutionStep[] = [];
    const n = quantities.length;
    const pastTrades: { time: number; impactValue: number }[] = [];

    for (let k = 0; k < n; k++) {
      const q = quantities[k];
      const time = k * dt;
      const rate = q / dt;
      const fVal = this.instantaneousImpact(rate, lambda, delta);

      // Transient impact from past trades: sum f(v_j) * G(t_k - t_j) * dt
      let pastImpact = 0.0;
      for (const trade of pastTrades) {
        const decay = this.evaluateKernel(kernel, time - trade.time);
        pastImpact += trade.impactValue * decay * dt;
      }

      // Current step self-impact (trapezoidal / half instantaneous impact)
      const g0 = this.evaluateKernel(kernel, 0.0);
      const selfImpact = 0.5 * fVal * g0 * dt;
      const currentPrice = s0 + pastImpact + selfImpact;
      const cost = q * currentPrice;

      steps.push({
        step: k + 1,
        time,
        quantity: q,
        rate,
        accumulatedImpact: pastImpact + selfImpact,
        executionPrice: currentPrice,
        cost,
      });

      pastTrades.push({ time, impactValue: fVal });
    }

    return steps;
  }

  public static testRoundTripArbitrage(
    s0: number,
    totalQty: number,
    horizon: number,
    lambda: number,
    delta: number,
    kernel: GatheralKernelParams
  ): number {
    const n = 20;
    const testHorizons = [horizon, 0.5 * horizon, 0.2 * horizon, 0.1 * horizon];
    let maxPnL = -Infinity;

    for (const h of testHorizons) {
      const dt = h / n;
      for (const slowSteps of [10, 12, 14, 16]) {
        const fastSteps = n - slowSteps;
        const quantities: number[] = new Array(n).fill(0.0);
        const buySlice = totalQty / slowSteps;
        const sellSlice = -totalQty / fastSteps;

        for (let i = 0; i < slowSteps; i++) quantities[i] = buySlice;
        for (let i = slowSteps; i < n; i++) quantities[i] = sellSlice;

        const steps = this.simulateExecution(s0, quantities, dt, lambda, delta, kernel);
        const netCashSpent = steps.reduce((acc, step) => acc + step.cost, 0.0);
        const pnl = -netCashSpent;
        if (pnl > maxPnL) maxPnL = pnl;
      }
    }

    return maxPnL;
  }
}
