import type {
  Cartea2017TikhonovInput,
  Cartea2017TikhonovOutput,
} from './types';

export class Cartea2017Tikhonov {
  /**
   * Cartea, Donnelly & Jaimungal (2017) Tikhonov-Regularized Optimal Execution
   * under Order-Flow / Drift Model Uncertainty:
   * Regularizes drift signal via shrinkage factor w = 1 / (1 + lambda * sigma_alpha^2)
   * and augments inventory urgency kappa = sqrt((phi + lambda) / eta).
   */
  static evaluate(input: Cartea2017TikhonovInput): Cartea2017TikhonovOutput {
    const q = input.inventorySharesQ;
    const eta = Math.max(1e-8, input.temporaryImpactEta);
    const phi = Math.max(0, input.riskAversionPhi);
    const lambda = Math.max(0, input.ambiguityPenaltyLambda);
    const sigmaSq = Math.max(0, input.signalVarianceSigmaSq);
    const T = Math.max(1e-3, input.remainingHorizonSecT);

    const regularizedUrgencyKappa = Math.sqrt((phi + lambda) / eta);
    const shrinkageFactor = 1 / (1 + lambda * sigmaSq);
    const filteredAlphaSignal = input.rawDriftSignalAlpha * shrinkageFactor;

    const kappaT = regularizedUrgencyKappa * T;
    const cothKappaT =
      kappaT > 20 ? 1 : Math.cosh(kappaT) / Math.max(1e-9, Math.sinh(kappaT));

    const inventoryTerm = regularizedUrgencyKappa * q * cothKappaT;
    const alphaAdjustment = filteredAlphaSignal / (2 * eta);
    const optimalLiquidationRateSharesPerSec = inventoryTerm - alphaAdjustment;

    const regime =
      shrinkageFactor <= 0.5
        ? 'AMBIGUITY_DAMPED'
        : Math.abs(alphaAdjustment) > Math.abs(inventoryTerm)
          ? 'ALPHA_DRIVEN'
          : 'INVENTORY_URGENT';

    return {
      regularizedUrgencyKappa: Number(regularizedUrgencyKappa.toFixed(6)),
      shrinkageFactor: Number(shrinkageFactor.toFixed(6)),
      filteredAlphaSignal: Number(filteredAlphaSignal.toFixed(6)),
      optimalLiquidationRateSharesPerSec: Number(
        optimalLiquidationRateSharesPerSec.toFixed(6)
      ),
      regime,
    };
  }
}
