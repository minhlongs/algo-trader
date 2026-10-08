import { CommodityContract, StorageParameters, CalendarSpreadMetrics } from './commodities-types';

export class CalendarSpreadRollEngine {
  /**
   * Computes calendar spread, roll yield, and detects cash-and-carry storage arbitrage:
   * If Far Futures > Spot * exp((r + u) * T_far), short futures + buy physical and store.
   */
  public evaluateSpread(
    nearContract: CommodityContract,
    farContract: CommodityContract,
    storage: StorageParameters
  ): CalendarSpreadMetrics {
    if (farContract.expiryYears <= nearContract.expiryYears) {
      throw new Error('Far contract expiry must be strictly greater than near contract expiry');
    }

    const dT = farContract.expiryYears - nearContract.expiryYears;
    const spreadPrice = farContract.futuresPrice - nearContract.futuresPrice;

    // Roll yield = (Near - Far) / Near / dT (positive when curve is in backwardation)
    const rollYield = ((nearContract.futuresPrice - farContract.futuresPrice) / nearContract.futuresPrice) / dT;
    const annualizedRollYieldPct = Number((rollYield * 100.0).toFixed(4));

    // Cash-and-carry test on the far contract:
    // Theoretical max cost of carry price = Spot * exp((r + u) * T_far)
    const r = storage.financingRatePct / 100.0;
    const u = storage.storageCostPct / 100.0;
    const carryCostFar = storage.spotPrice * Math.exp((r + u) * farContract.expiryYears);

    const arbAvailable = farContract.futuresPrice > carryCostFar + 0.05; // 5 cent buffer
    const arbProfit = arbAvailable ? farContract.futuresPrice - carryCostFar : 0.0;

    return {
      nearTicker: nearContract.ticker,
      farTicker: farContract.ticker,
      nearPrice: nearContract.futuresPrice,
      farPrice: farContract.futuresPrice,
      spreadPrice: Number(spreadPrice.toFixed(4)),
      annualizedRollYieldPct,
      cashAndCarryArbAvailable: arbAvailable,
      arbProfitUsdPerUnit: Number(arbProfit.toFixed(4)),
    };
  }
}
