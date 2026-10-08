import { ConvertibleValuation, DeltaHedgeResult } from './convertible-types';

export class ConvertibleDeltaHedger {
  public computeHedge(
    valuation: ConvertibleValuation,
    totalBondsHeld: number,
    stockPriceUsd: number,
    simulatedStockChangePct: number
  ): DeltaHedgeResult {
    const sharesToShort = Math.round(valuation.delta * totalBondsHeld);
    const netDeltaShares = valuation.delta * totalBondsHeld - sharesToShort;
    const netDeltaExposureUsd = Number((netDeltaShares * stockPriceUsd).toFixed(2));

    const deltaS = stockPriceUsd * (simulatedStockChangePct / 100.0);
    const gammaPerBond = valuation.gamma;
    const totalGamma = gammaPerBond * totalBondsHeld;

    const estimatedGammaProfitUsd = Number((0.5 * totalGamma * deltaS * deltaS).toFixed(2));

    return {
      totalBondsHeld,
      sharesToShort,
      netDeltaExposureUsd,
      simulatedStockChangePct,
      estimatedGammaProfitUsd,
    };
  }
}
