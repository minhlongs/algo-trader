import { GatheralParams, GatheralResult } from './gatheral-types';
import { GatheralMath } from './gatheral-math';

export class GatheralEngine {
  public static validate(params: GatheralParams): void {
    if (params.initialPrice <= 0 || !Number.isFinite(params.initialPrice)) {
      throw new Error(`Invalid initialPrice: ${params.initialPrice}. Must be > 0.`);
    }
    if (params.totalQuantity <= 0 || !Number.isFinite(params.totalQuantity)) {
      throw new Error(`Invalid totalQuantity: ${params.totalQuantity}. Must be > 0.`);
    }
    if (params.tradingHorizon <= 0 || !Number.isFinite(params.tradingHorizon)) {
      throw new Error(`Invalid tradingHorizon: ${params.tradingHorizon}. Must be > 0.`);
    }
    if (params.numSteps < 2 || !Number.isInteger(params.numSteps)) {
      throw new Error(`Invalid numSteps: ${params.numSteps}. Must be integer >= 2.`);
    }
    const delta = params.impactPower ?? 1.0;
    if (delta <= 0 || delta > 1.0 || !Number.isFinite(delta)) {
      throw new Error(`Invalid impactPower: ${delta}. Must be in (0, 1].`);
    }
    const lambda = params.impactCoeff ?? 1.0;
    if (lambda <= 0 || !Number.isFinite(lambda)) {
      throw new Error(`Invalid impactCoeff: ${lambda}. Must be > 0.`);
    }
    if (params.kernel.gamma <= 0 || !Number.isFinite(params.kernel.gamma)) {
      throw new Error(`Invalid kernel gamma: ${params.kernel.gamma}. Must be > 0.`);
    }
    if (params.kernel.decayParam <= 0 || !Number.isFinite(params.kernel.decayParam)) {
      throw new Error(`Invalid kernel decayParam: ${params.kernel.decayParam}. Must be > 0.`);
    }
    if (params.kernel.timeScale !== undefined && params.kernel.timeScale <= 0) {
      throw new Error(`Invalid kernel timeScale: ${params.kernel.timeScale}. Must be > 0.`);
    }
  }

  public static simulate(params: GatheralParams): GatheralResult {
    this.validate(params);

    const delta = params.impactPower ?? 1.0;
    const lambda = params.impactCoeff ?? 1.0;
    const dt = params.tradingHorizon / params.numSteps;

    // Standard uniform liquidation or custom schedule
    const quantities: number[] = params.customSchedule ?? new Array(params.numSteps).fill(params.totalQuantity / params.numSteps);

    const steps = GatheralMath.simulateExecution(
      params.initialPrice,
      quantities,
      dt,
      lambda,
      delta,
      params.kernel
    );

    const totalCost = steps.reduce((sum, s) => sum + s.cost, 0.0);
    const totalQty = quantities.reduce((sum, q) => sum + q, 0.0);
    const averageExecutionPrice = totalCost / totalQty;
    const slippageVsInitial = averageExecutionPrice - params.initialPrice;
    const terminalImpact = steps[steps.length - 1].accumulatedImpact;

    const roundTripPnL = GatheralMath.testRoundTripArbitrage(
      params.initialPrice,
      params.totalQuantity,
      params.tradingHorizon,
      lambda,
      delta,
      params.kernel
    );

    return {
      params,
      totalCost,
      averageExecutionPrice,
      slippageVsInitial,
      terminalImpact,
      roundTripPnL,
      hasDynamicArbitrage: roundTripPnL > 1e-4,
      steps,
    };
  }
}
