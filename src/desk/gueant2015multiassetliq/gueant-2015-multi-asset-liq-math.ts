import type {
  Gueant2015MultiAssetLiqInput,
  Gueant2015MultiAssetLiqOutput,
} from './types';

export class Gueant2015MultiAssetLiq {
  /**
   * Guéant (2015/2017) Multi-Asset Market Making & Portfolio Liquidation:
   * Computes covariance-coupled marginal risk gradient (Sigma * q)_1 and
   * asymptotic optimal bid/ask quote offsets under exponential fill intensity.
   */
  static evaluate(
    input: Gueant2015MultiAssetLiqInput
  ): Gueant2015MultiAssetLiqOutput {
    const q1 = input.inventoryAsset1Shares;
    const q2 = input.inventoryAsset2Shares;
    const s1 = Math.max(1e-6, input.volAsset1Usd);
    const s2 = Math.max(1e-6, input.volAsset2Usd);
    const rho = Math.max(-0.999, Math.min(0.999, input.correlationRho));
    const gamma = Math.max(1e-8, input.riskAversionGamma);
    const kappa = Math.max(1e-6, input.intensityDecayKappa);

    const cov12 = rho * s1 * s2;
    const portfolioVarianceDollarSq =
      q1 * q1 * s1 * s1 + 2 * q1 * q2 * cov12 + q2 * q2 * s2 * s2;
    const marginalRiskGradientAsset1 = q1 * s1 * s1 + q2 * cov12;

    const baseSpreadHalf = (1 / gamma) * Math.log(1 + gamma / kappa);
    const reservationSkewUsd = 0.5 * gamma * marginalRiskGradientAsset1;
    const optimalAskOffsetAsset1Usd = baseSpreadHalf - reservationSkewUsd;
    const optimalBidOffsetAsset1Usd = baseSpreadHalf + reservationSkewUsd;

    const standaloneVar1 = q1 * q1 * s1 * s1;
    const regime =
      Math.abs(q1) < 1e-6 && Math.abs(q2) < 1e-6
        ? 'NEUTRAL_BALANCED'
        : portfolioVarianceDollarSq < standaloneVar1
          ? 'CROSS_HEDGED'
          : 'UNHEDGED_CONCENTRATED';

    return {
      portfolioVarianceDollarSq: Number(portfolioVarianceDollarSq.toFixed(6)),
      marginalRiskGradientAsset1: Number(marginalRiskGradientAsset1.toFixed(6)),
      optimalAskOffsetAsset1Usd: Number(optimalAskOffsetAsset1Usd.toFixed(6)),
      optimalBidOffsetAsset1Usd: Number(optimalBidOffsetAsset1Usd.toFixed(6)),
      reservationSkewUsd: Number(reservationSkewUsd.toFixed(6)),
      regime,
    };
  }
}
