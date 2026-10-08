import { CppiParameters, CppiSimulationSummary, CppiStepState } from './cppi-types';

export class CppiSimulationEngine {
  public simulateStrategy(
    params: CppiParameters,
    riskyAssetReturnPath: number[],
    dtYears = 0.04 // ~bi-weekly rebalancing
  ): CppiSimulationSummary {
    const {
      initialPortfolioValueUsd,
      floorGuaranteeFraction,
      multiplierM,
      riskFreeRatePct,
      timeHorizonYears,
    } = params;

    const r = riskFreeRatePct / 100.0;
    const initialFloor = initialPortfolioValueUsd * floorGuaranteeFraction * Math.exp(-r * timeHorizonYears);

    let portfolioVal = initialPortfolioValueUsd;
    let minCushion = portfolioVal - initialFloor;
    let isCashedOut = false;

    const states: CppiStepState[] = [];

    for (let step = 0; step < riskyAssetReturnPath.length; step++) {
      const t = step * dtYears;
      const tau = Math.max(0, timeHorizonYears - t);
      const currentFloor = initialPortfolioValueUsd * floorGuaranteeFraction * Math.exp(-r * tau);
      const cushion = Math.max(0, portfolioVal - currentFloor);

      minCushion = Math.min(minCushion, cushion);

      if (cushion <= 1e-4) {
        // Floor breached or cushion depleted -> lock into risk-free cash asset
        isCashedOut = true;
      }

      let riskyAlloc = 0;
      let riskFreeAlloc = portfolioVal;

      if (!isCashedOut) {
        riskyAlloc = Math.min(portfolioVal, multiplierM * cushion);
        riskFreeAlloc = Math.max(0, portfolioVal - riskyAlloc);
      }

      states.push({
        timeYears: Number(t.toFixed(4)),
        portfolioValueUsd: Number(portfolioVal.toFixed(2)),
        floorValueUsd: Number(currentFloor.toFixed(2)),
        cushionUsd: Number(cushion.toFixed(2)),
        riskyAllocationUsd: Number(riskyAlloc.toFixed(2)),
        riskFreeAllocationUsd: Number(riskFreeAlloc.toFixed(2)),
        isFloorBreached: portfolioVal < currentFloor,
        isCashedOut,
      });

      // Apply asset returns for next step
      const riskyReturn = riskyAssetReturnPath[step]!;
      const rfReturn = Math.exp(r * dtYears) - 1.0;

      portfolioVal = isCashedOut
        ? portfolioVal * (1.0 + rfReturn)
        : riskyAlloc * (1.0 + riskyReturn) + riskFreeAlloc * (1.0 + rfReturn);
    }

    return {
      initialPortfolioValueUsd,
      finalPortfolioValueUsd: Number(portfolioVal.toFixed(2)),
      minimumObservedCushionUsd: Number(minCushion.toFixed(2)),
      states,
    };
  }
}
