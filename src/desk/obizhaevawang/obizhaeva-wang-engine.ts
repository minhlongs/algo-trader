import {
  ExecutionSlice,
  ObizhaevaWangParams,
  ObizhaevaWangResult,
} from './obizhaeva-wang-types';
import { ObizhaevaWangMath } from './obizhaeva-wang-math';

export class ObizhaevaWangEngine {
  public static optimize(params: ObizhaevaWangParams): ObizhaevaWangResult {
    this.validate(params);

    const {
      totalQuantity,
      timeHorizon,
      steps,
      resilienceSpeed,
      temporaryImpactFactor,
      halfSpread,
    } = params;

    const { x0, xk, xn, tau } = ObizhaevaWangMath.calculateOptimalSchedule(
      totalQuantity,
      timeHorizon,
      steps,
      resilienceSpeed
    );

    const optimalTrades: number[] = new Array(steps + 1);
    optimalTrades[0] = x0;
    for (let k = 1; k < steps; k++) {
      optimalTrades[k] = xk;
    }
    optimalTrades[steps] = xn;

    // Evaluate optimal schedule cost
    const { totalCost: optimalTotalCost, sliceCosts } = ObizhaevaWangMath.calculateCost(
      optimalTrades,
      tau,
      resilienceSpeed,
      temporaryImpactFactor,
      halfSpread
    );

    // Evaluate naive TWAP schedule cost
    const twapTrades = ObizhaevaWangMath.calculateTwapTrades(totalQuantity, steps);
    const { totalCost: twapTotalCost } = ObizhaevaWangMath.calculateCost(
      twapTrades,
      tau,
      resilienceSpeed,
      temporaryImpactFactor,
      halfSpread
    );

    const costSavingsAmount = Math.max(0.0, twapTotalCost - optimalTotalCost);
    const costSavingsPercent =
      twapTotalCost > 0 ? (costSavingsAmount / twapTotalCost) * 100.0 : 0.0;

    let cumQty = 0.0;
    const schedule: ExecutionSlice[] = [];
    for (let k = 0; k <= steps; k++) {
      const tradeSize = optimalTrades[k];
      cumQty += tradeSize;
      schedule.push({
        step: k,
        time: k * tau,
        tradeSize,
        cumulativeQuantity: cumQty,
        remainingQuantity: Math.max(0.0, totalQuantity - cumQty),
        sliceImpactCost: sliceCosts[k],
      });
    }

    return {
      totalQuantity,
      timeHorizon,
      steps,
      tau,
      resilienceSpeed,
      initialBlockTrade: x0,
      intermediateTrade: xk,
      terminalBlockTrade: xn,
      schedule,
      optimalTotalCost,
      twapTotalCost,
      costSavingsAmount,
      costSavingsPercent,
    };
  }

  private static validate(params: ObizhaevaWangParams): void {
    if (params.totalQuantity <= 0) {
      throw new Error(`Total quantity must be positive, got ${params.totalQuantity}`);
    }
    if (params.timeHorizon <= 0) {
      throw new Error(`Time horizon must be positive, got ${params.timeHorizon}`);
    }
    if (params.steps < 2 || params.steps > 1000) {
      throw new Error(`Steps must be between 2 and 1000, got ${params.steps}`);
    }
    if (params.resilienceSpeed <= 0) {
      throw new Error(`Resilience speed must be positive, got ${params.resilienceSpeed}`);
    }
    if (params.temporaryImpactFactor <= 0) {
      throw new Error(
        `Temporary impact factor must be positive, got ${params.temporaryImpactFactor}`
      );
    }
    if (params.halfSpread < 0) {
      throw new Error(`Half spread cannot be negative, got ${params.halfSpread}`);
    }
  }
}
