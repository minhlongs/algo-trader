import type {
  WyartBouchaud2008SpreadImpactInput,
  WyartBouchaud2008SpreadImpactOutput,
} from './types';

export class WyartBouchaud2008SpreadImpact {
  /**
   * Wyart, Bouchaud, Kockelkoren, Potters & Vettorazzo (2008) Ecological Spread-Impact Relation:
   * Zero-profit market-making equilibrium equates spread S to adverse selection impact 2 * alpha * R(1).
   */
  static evaluate(
    input: WyartBouchaud2008SpreadImpactInput
  ): WyartBouchaud2008SpreadImpactOutput {
    const S = Math.max(1e-6, input.observedBidAskSpreadTicks);
    const R1 = Math.max(1e-6, input.lagOneResponseImpactTicksR1);
    const sigma1 = Math.max(1e-6, input.volatilityPerTradeTicksSigma1);
    const alpha = input.marketMakerCompetitionAlpha ?? 1.0;

    const equilibriumZeroProfitSpreadTicks = 2 * alpha * R1;
    const adverseSelectionRatioSpreadToImpact = S / R1;
    const spreadToTradeVolatilityRatio = S / sigma1;
    const marketMakingEdgeTicksPerTrade =
      0.5 * (S - equilibriumZeroProfitSpreadTicks);

    const ecologyRegime =
      marketMakingEdgeTicksPerTrade < -0.05
        ? 'ADVERSE_SELECTION_LOSS'
        : marketMakingEdgeTicksPerTrade > 0.05
          ? 'POSITIVE_MM_RENT'
          : 'COMPETITIVE_ZERO_PROFIT';

    return {
      equilibriumZeroProfitSpreadTicks: Number(
        equilibriumZeroProfitSpreadTicks.toFixed(6)
      ),
      adverseSelectionRatioSpreadToImpact: Number(
        adverseSelectionRatioSpreadToImpact.toFixed(6)
      ),
      spreadToTradeVolatilityRatio: Number(
        spreadToTradeVolatilityRatio.toFixed(6)
      ),
      marketMakingEdgeTicksPerTrade: Number(
        marketMakingEdgeTicksPerTrade.toFixed(6)
      ),
      ecologyRegime,
    };
  }
}
