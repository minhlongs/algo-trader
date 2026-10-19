import type {
  Cartea2018SignalDecayInput,
  Cartea2018SignalDecayOutput,
} from './types';

export class Cartea2018SignalDecay {
  /**
   * Cartea & Donnelly (2018) Algorithmic Trading with Markovian / Mean-Reverting Alpha Signals:
   * Discounts transient alpha drift by 1 / (kappa_inv + kappa_alpha) and modulates
   * asymptotic liquidation velocity nu = kappa_inv * q - alpha_0 / (2 * eta * (kappa_inv + kappa_alpha)).
   */
  static evaluate(
    input: Cartea2018SignalDecayInput
  ): Cartea2018SignalDecayOutput {
    const q = input.inventorySharesQ;
    const alpha0 = input.alphaSignalInitial;
    const kappaAlpha = Math.max(1e-6, input.signalDecayRateKappaAlpha);
    const kappaInv = Math.max(1e-6, input.inventoryUrgencyKappaInv);
    const eta = Math.max(1e-8, input.temporaryImpactEta);

    const effectiveAlphaDiscountFactor = 1 / (kappaInv + kappaAlpha);
    const alphaContributionRate =
      (alpha0 * effectiveAlphaDiscountFactor) / (2 * eta);
    const inventoryLiquidationRate = kappaInv * q;
    const netOptimalTradingRate =
      inventoryLiquidationRate - alphaContributionRate;

    const regime =
      Math.abs(alphaContributionRate) < 1e-6
        ? 'PURE_INVENTORY'
        : alphaContributionRate < 0
          ? 'SIGNAL_ACCELERATED'
          : 'SIGNAL_RETARDED';

    return {
      effectiveAlphaDiscountFactor: Number(
        effectiveAlphaDiscountFactor.toFixed(6)
      ),
      alphaContributionRate: Number(alphaContributionRate.toFixed(6)),
      inventoryLiquidationRate: Number(inventoryLiquidationRate.toFixed(6)),
      netOptimalTradingRate: Number(netOptimalTradingRate.toFixed(6)),
      regime,
    };
  }
}
