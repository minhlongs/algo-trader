import type {
  GueantLehalleTapia2012PortfolioInput,
  GueantLehalleTapia2012PortfolioOutput,
} from './types';

export class GueantLehalleTapia2012Portfolio {
  /**
   * Gueant, Lehalle & Tapia (2012) Optimal Portfolio Liquidation with Cross-Asset Correlation:
   * Coupled covariance q^T Sigma q alters urgency of Asset 1 liquidation when hedged by Asset 2.
   */
  static evaluate(
    input: GueantLehalleTapia2012PortfolioInput
  ): GueantLehalleTapia2012PortfolioOutput {
    const q1 = input.inventoryAsset1Shares;
    const q2 = input.inventoryAsset2Shares;
    const s1 = Math.max(1e-6, input.volatilityAsset1Usd);
    const s2 = Math.max(1e-6, input.volatilityAsset2Usd);
    const rho = Math.max(-0.999, Math.min(0.999, input.correlationRho12));
    const gamma = Math.max(1e-8, input.riskAversionGamma);
    const eta1 = Math.max(1e-8, input.temporaryImpactEta1);
    const tau = Math.max(1e-2, input.remainingHorizonSec);

    const portfolioVarianceUsdSq =
      q1 * q1 * s1 * s1 + q2 * q2 * s2 * s2 + 2 * rho * s1 * s2 * q1 * q2;
    const coupledEffectiveInventory1 = q1 + rho * (s2 / s1) * q2;
    const omega1 = Math.sqrt((gamma * s1 * s1) / (2 * eta1));
    const cothTerm = 1 / Math.tanh(Math.max(1e-4, omega1 * tau));
    const optimalLiquidationRate1SharesPerSec =
      omega1 * cothTerm * coupledEffectiveInventory1;

    const crossTerm = rho * q1 * q2;
    const hedgeState =
      crossTerm < -1e-6
        ? 'CROSS_HEDGED_DAMPED'
        : crossTerm > 1e-6
          ? 'DIRECTIONAL_AMPLIFIED'
          : 'UNCORRELATED_NEUTRAL';

    return {
      portfolioVarianceUsdSq: Number(portfolioVarianceUsdSq.toFixed(6)),
      coupledEffectiveInventory1: Number(coupledEffectiveInventory1.toFixed(6)),
      decayRateOmega1PerSec: Number(omega1.toFixed(6)),
      optimalLiquidationRate1SharesPerSec: Number(
        optimalLiquidationRate1SharesPerSec.toFixed(6)
      ),
      hedgeState,
    };
  }
}
