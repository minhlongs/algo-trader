import { BertsimasLoConfig, BertsimasLoExecutionResult } from './bertsimas-lo-types';
import { BertsimasLoMath } from './bertsimas-lo-math';

export class BertsimasLoEngine {
  public execute(config: BertsimasLoConfig): BertsimasLoExecutionResult {
    this.validate(config);

    const isBuy = config.isBuy ?? true;
    const schedule = BertsimasLoMath.computeTrajectory(config);
    const totalCashFlow = schedule.reduce((sum, s) => sum + s.periodCashFlow, 0);
    const averageExecutedPrice = totalCashFlow / config.initialShares;

    const benchmarkTwapCost = BertsimasLoMath.computeBenchmarkTwapCost(config);
    const benchmarkImmediateCost = BertsimasLoMath.computeImmediateCost(config);

    const paperValue = config.initialShares * config.initialPrice;
    const implementationShortfallUsd = isBuy
      ? totalCashFlow - paperValue
      : paperValue - totalCashFlow;

    const costSavingsVsTwapUsd = isBuy
      ? benchmarkTwapCost - totalCashFlow
      : totalCashFlow - benchmarkTwapCost;

    const costSavingsVsImmediateUsd = isBuy
      ? benchmarkImmediateCost - totalCashFlow
      : totalCashFlow - benchmarkImmediateCost;

    const totalPermanentImpact = schedule.reduce((acc, step) => {
      const dir = isBuy ? 1.0 : -1.0;
      return acc + dir * config.permanentImpactCoeff * step.tradeShares;
    }, 0);

    const totalTemporaryImpact = schedule.reduce((acc, step) => {
      const dir = isBuy ? 1.0 : -1.0;
      return acc + dir * config.temporaryImpactCoeff * step.tradeShares;
    }, 0);

    return {
      schedule,
      totalCashFlow: Number(totalCashFlow.toFixed(4)),
      averageExecutedPrice: Number(averageExecutedPrice.toFixed(4)),
      benchmarkTwapCost: Number(benchmarkTwapCost.toFixed(4)),
      benchmarkImmediateCost: Number(benchmarkImmediateCost.toFixed(4)),
      implementationShortfallUsd: Number(implementationShortfallUsd.toFixed(4)),
      costSavingsVsTwapUsd: Number(costSavingsVsTwapUsd.toFixed(4)),
      costSavingsVsImmediateUsd: Number(costSavingsVsImmediateUsd.toFixed(4)),
      totalPermanentImpact: Number(totalPermanentImpact.toFixed(4)),
      totalTemporaryImpact: Number(totalTemporaryImpact.toFixed(4)),
    };
  }

  private validate(config: BertsimasLoConfig): void {
    if (config.initialShares <= 0) throw new Error('Initial shares must be strictly positive');
    if (config.periods < 1 || !Number.isInteger(config.periods)) {
      throw new Error('Periods must be an integer >= 1');
    }
    if (config.initialPrice <= 0) throw new Error('Initial price must be strictly positive');
    if (config.permanentImpactCoeff < 0) throw new Error('Permanent impact must be non-negative');
    if (config.temporaryImpactCoeff < 0) throw new Error('Temporary impact must be non-negative');
    if (config.informationPersistence !== undefined) {
      if (Math.abs(config.informationPersistence) >= 1.0) {
        throw new Error('Information persistence rho must satisfy |rho| < 1');
      }
    }
  }
}
