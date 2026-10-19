import { AlfonsiParams, AlfonsiResult } from './alfonsi-types';
import { AlfonsiMath } from './alfonsi-math';

export class AlfonsiEngine {
  public static evaluate(params: AlfonsiParams): AlfonsiResult {
    this.validate(params);

    const {
      initialPrice,
      totalQuantity,
      tradingHorizon,
      numIntervals,
      shapeDelta,
      depthAlpha,
      resilienceRate,
      customSchedule,
    } = params;

    const dt = tradingHorizon / numIntervals;

    // Active schedule (either user-specified or Alfonsi optimal)
    const activeSchedule =
      customSchedule && customSchedule.length === numIntervals
        ? customSchedule
        : AlfonsiMath.generateOptimalSchedule(
            totalQuantity,
            numIntervals,
            resilienceRate,
            dt,
            shapeDelta
          );

    // Uniform TWAP benchmark schedule
    const twapSchedule = new Array(numIntervals).fill(totalQuantity / numIntervals);

    const simActive = AlfonsiMath.simulateSchedule(
      initialPrice,
      activeSchedule,
      shapeDelta,
      depthAlpha,
      resilienceRate,
      dt
    );

    const simTwap = AlfonsiMath.simulateSchedule(
      initialPrice,
      twapSchedule,
      shapeDelta,
      depthAlpha,
      resilienceRate,
      dt
    );

    const totalCashSpent = simActive.totalCash;
    const twapTotalCost = simTwap.totalCash;
    const costSavingsVsTwap = twapTotalCost - totalCashSpent;
    const averageExecutionPrice = totalCashSpent / totalQuantity;

    return {
      initialPrice,
      totalQuantity,
      tradingHorizon,
      numIntervals,
      shapeDelta,
      depthAlpha,
      resilienceRate,
      totalCashSpent,
      averageExecutionPrice,
      terminalPriceShift: simActive.terminalShift,
      twapTotalCost,
      costSavingsVsTwap,
      slices: simActive.slices,
    };
  }

  private static validate(params: AlfonsiParams): void {
    if (params.initialPrice <= 0) {
      throw new Error(`Initial price must be positive, got ${params.initialPrice}`);
    }
    if (params.totalQuantity <= 0) {
      throw new Error(`Total quantity must be positive, got ${params.totalQuantity}`);
    }
    if (params.tradingHorizon <= 0) {
      throw new Error(`Trading horizon must be positive, got ${params.tradingHorizon}`);
    }
    if (params.numIntervals < 2 || !Number.isInteger(params.numIntervals)) {
      throw new Error(
        `Number of intervals must be an integer >= 2, got ${params.numIntervals}`
      );
    }
    if (params.shapeDelta < 0) {
      throw new Error(`Shape parameter delta must be >= 0, got ${params.shapeDelta}`);
    }
    if (params.depthAlpha <= 0) {
      throw new Error(`Depth coefficient alpha must be positive, got ${params.depthAlpha}`);
    }
    if (params.resilienceRate <= 0) {
      throw new Error(`Resilience rate rho must be positive, got ${params.resilienceRate}`);
    }
    if (params.customSchedule) {
      if (params.customSchedule.length !== params.numIntervals) {
        throw new Error(
          `Custom schedule length (${params.customSchedule.length}) must match numIntervals (${params.numIntervals})`
        );
      }
      for (const q of params.customSchedule) {
        if (q < 0) {
          throw new Error(`Custom schedule quantities must be non-negative, got ${q}`);
        }
      }
    }
  }
}
