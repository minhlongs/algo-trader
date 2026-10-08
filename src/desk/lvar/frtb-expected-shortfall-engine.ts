import { ReturnSeriesInput, FrtbExpectedShortfallResult } from './lvar-types';

export class FrtbExpectedShortfallEngine {
  public computeFrtbExpectedShortfall(
    input: ReturnSeriesInput,
    extremeTailIndexXi = 0.20
  ): FrtbExpectedShortfallResult {
    const { assetReturns, portfolioValueUsd, confidenceLevelPct } = input;

    const sortedLosses = assetReturns.map(r => -r).sort((a, b) => a - b);
    const n = sortedLosses.length;
    const cutoffIndex = Math.floor((confidenceLevelPct / 100.0) * n);
    const clampedCutoff = Math.min(n - 1, Math.max(0, cutoffIndex));

    const varLossRate = sortedLosses[clampedCutoff] ?? 0.025;
    const valueAtRiskUsd = Number((varLossRate * portfolioValueUsd).toFixed(2));

    const tailLosses = sortedLosses.slice(clampedCutoff);
    const meanTailLoss = tailLosses.length > 0
      ? tailLosses.reduce((acc, v) => acc + v, 0) / tailLosses.length
      : varLossRate * 1.25;

    const tailMultiplier = 1.0 / (1.0 - Math.min(0.45, extremeTailIndexXi));
    const evtAdjustedTailLoss = meanTailLoss * tailMultiplier;
    const expectedShortfallUsd = Number((evtAdjustedTailLoss * portfolioValueUsd).toFixed(2));

    return {
      confidenceLevelPct,
      valueAtRiskUsd,
      expectedShortfallUsd,
      extremeTailIndexXi,
      tailSeverityMultiplier: Number(tailMultiplier.toFixed(4)),
    };
  }
}
