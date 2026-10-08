import { CommodityContract, StorageParameters, ConvenienceYieldMetrics } from './commodities-types';

export class StorageConvenienceYieldEngine {
  /**
   * Cost of carry formula: F(T) = S * exp((r + u - y) * T)
   * Solves for implied convenience yield y:
   * y = r + u - (1 / T) * ln(F / S)
   */
  public evaluateConvenienceYield(
    contract: CommodityContract,
    storage: StorageParameters
  ): ConvenienceYieldMetrics {
    const { spotPrice, financingRatePct, storageCostPct } = storage;
    if (spotPrice <= 0 || contract.futuresPrice <= 0) {
      throw new Error('Spot and futures prices must be strictly positive');
    }
    if (contract.expiryYears <= 0) {
      throw new Error('Contract expiry must be strictly positive');
    }

    const r = financingRatePct / 100.0;
    const u = storageCostPct / 100.0;
    const T = contract.expiryYears;

    const theoreticalCostOfCarry = spotPrice * Math.exp((r + u) * T);
    const costOfCarryRate = r + u;

    // y = (r + u) - (1 / T) * ln(F / S)
    const logPriceRatio = Math.log(contract.futuresPrice / spotPrice);
    const y = costOfCarryRate - (1.0 / T) * logPriceRatio;
    const impliedYieldPct = Number((y * 100.0).toFixed(4));

    let regime: 'BACKWARDATION' | 'CONTANGO' | 'PARITY' = 'PARITY';
    if (impliedYieldPct > Number(((r + u) * 100.0).toFixed(4)) + 0.05) {
      // y > r + u implies Futures < Spot: Backwardation
      regime = 'BACKWARDATION';
    } else if (impliedYieldPct < Number(((r + u) * 100.0).toFixed(4)) - 0.05) {
      // y < r + u implies Futures > Spot: Contango
      regime = 'CONTANGO';
    }

    return {
      ticker: contract.ticker,
      expiryYears: contract.expiryYears,
      futuresPrice: contract.futuresPrice,
      theoreticalCostOfCarryPrice: Number(theoreticalCostOfCarry.toFixed(4)),
      impliedConvenienceYieldPct: impliedYieldPct,
      regime,
    };
  }
}
