import { AlmgrenChrissResult, LiquidationOrder, MarketImpactParameters, OptimalTrajectoryStep } from './almgren-types';

export class AlmgrenChrissTrajectoryEngine {
  public calculateOptimalTrajectory(
    order: LiquidationOrder,
    impact: MarketImpactParameters
  ): AlmgrenChrissResult {
    const { totalSharesToLiquidate: X0, totalTimeHorizonHours: T, numberOfTradingIntervals: N, initialStockPriceUsd: S0, dailyVolatilityPct } = order;
    const { permanentImpactGamma: gamma, temporaryImpactEta: eta, riskAversionLambda: lambda } = impact;

    if (N <= 0 || T <= 0 || X0 <= 0) {
      throw new Error('Valid order size, intervals and positive time horizon required');
    }

    if (eta <= 0) {
      throw new Error('temporaryImpactEta must be positive');
    }

    const tau = T / N; // Time step in hours
    // Daily vol converted to hourly vol (assuming 6.5 trading hours/day)
    const sigmaHourly = (dailyVolatilityPct / 100.0) * S0 / Math.sqrt(6.5);

    // Characteristic decay rate kappa = sqrt(lambda * sigma^2 / eta)
    const kappa = Math.sqrt((Math.max(1e-9, lambda) * sigmaHourly * sigmaHourly) / eta);
    const halfLifeHours = kappa > 1e-6 ? Math.log(2.0) / kappa : T / 2.0;

    const trajectory: OptimalTrajectoryStep[] = [];
    let prevShares = X0;

    for (let k = 0; k <= N; k++) {
      const t = k * tau;
      let remaining = 0;

      if (k === N) {
        remaining = 0;
      } else if (kappa * T < 1e-4) {
        // Pure risk-neutral TWAP linear trajectory
        remaining = X0 * (1.0 - t / T);
      } else {
        // Hyperbolic sine optimal liquidation trajectory
        remaining = X0 * (Math.sinh(kappa * (T - t)) / Math.sinh(kappa * T));
      }

      const tradeShares = k > 0 ? Math.max(0, prevShares - remaining) : 0;
      const tradingRate = k > 0 ? tradeShares / tau : 0;

      trajectory.push({
        intervalIndex: k,
        timeHours: Number(t.toFixed(4)),
        remainingShares: Number(remaining.toFixed(2)),
        tradeSharesThisInterval: Number(tradeShares.toFixed(2)),
        tradingRateSharesPerHour: Number(tradingRate.toFixed(2)),
      });

      prevShares = remaining;
    }

    // Expected capture / impact cost
    // E[Cost] = 0.5 * gamma * X0^2 + eta * sum(n_j^2 / tau)
    let tempCostSum = 0;
    let varSum = 0;

    for (let j = 1; j <= N; j++) {
      const n_j = trajectory[j]!.tradeSharesThisInterval;
      tempCostSum += (n_j * n_j) / tau;
      const rem = trajectory[j]!.remainingShares;
      varSum += (rem * rem) * tau;
    }

    const expectedPermanentCost = 0.5 * gamma * X0 * X0;
    const expectedTemporaryCost = eta * tempCostSum;
    const expectedTotalCost = expectedPermanentCost + expectedTemporaryCost;
    const varianceOfCost = sigmaHourly * sigmaHourly * varSum;

    return {
      trajectory,
      halfLifeHours: Number(halfLifeHours.toFixed(4)),
      expectedTotalCostUsd: Number(expectedTotalCost.toFixed(2)),
      varianceOfCostUsd: Number(varianceOfCost.toFixed(2)),
      riskAversionKappa: Number(kappa.toFixed(4)),
    };
  }
}
