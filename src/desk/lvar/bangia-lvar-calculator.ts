import { ReturnSeriesInput, BidAskSpreadProfile, LVaRResult } from './lvar-types';

export class BangiaLVaRCalculator {
  public computeLVaR(input: ReturnSeriesInput, spread: BidAskSpreadProfile): LVaRResult {
    const { assetReturns, portfolioValueUsd, confidenceLevelPct } = input;
    const { meanSpreadBps, spreadVolBps } = spread;

    const sortedLosses = assetReturns.map(r => -r).sort((a, b) => a - b);
    const index = Math.floor((confidenceLevelPct / 100.0) * sortedLosses.length);
    const clampedIndex = Math.min(sortedLosses.length - 1, Math.max(0, index));
    const lossQuantile = Math.max(0, sortedLosses[clampedIndex] ?? 0.02);

    const standardVaRUsd = Number((lossQuantile * portfolioValueUsd).toFixed(2));

    const kAlpha = confidenceLevelPct >= 99 ? 2.33 : 1.96;
    const worstCaseSpreadFraction = (meanSpreadBps + kAlpha * spreadVolBps) / 10000.0;
    const exogenousSpreadCostUsd = Number((0.5 * worstCaseSpreadFraction * portfolioValueUsd).toFixed(2));

    const totalLiquidityAdjustedVaRUsd = Number((standardVaRUsd + exogenousSpreadCostUsd).toFixed(2));
    const liquidityAddOnPct = Number(((exogenousSpreadCostUsd / Math.max(1, standardVaRUsd)) * 100.0).toFixed(2));

    return {
      standardVaRUsd,
      exogenousSpreadCostUsd,
      totalLiquidityAdjustedVaRUsd,
      liquidityAddOnPct,
    };
  }
}
