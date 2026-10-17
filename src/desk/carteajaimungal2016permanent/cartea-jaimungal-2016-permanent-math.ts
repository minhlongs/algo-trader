import type {
  CarteaJaimungal2016PermanentInput,
  CarteaJaimungal2016PermanentOutput,
} from './types';

export class CarteaJaimungal2016Permanent {
  static evaluate(
    input: CarteaJaimungal2016PermanentInput
  ): CarteaJaimungal2016PermanentOutput {
    const k = Math.max(1e-8, input.temporaryImpactK);
    const b = Math.max(0, input.permanentImpactB);
    const alpha = Math.max(1e-8, input.terminalPenaltyAlpha);
    const phi = Math.max(1e-10, input.runningPenaltyPhi);
    const tau = Math.max(1, input.remainingHorizonSeconds);
    const wellPosedConvexityCondition = 2 * alpha > b;

    const kappa = Math.sqrt(phi / k);
    const effAlpha = Math.max(1e-6, alpha - 0.5 * b);
    const zeta = effAlpha / Math.sqrt(k * phi);
    const sinhVal = Math.sinh(kappa * tau);
    const coshVal = Math.cosh(kappa * tau);
    const numer = zeta * coshVal + sinhVal;
    const denom = zeta * sinhVal + coshVal;
    const optimalLiquidationRateNu =
      input.inventorySharesQ * kappa * (numer / Math.max(1e-8, denom));
    const permanentPriceDropExpected = b * input.inventorySharesQ;

    const regime = !wellPosedConvexityCondition
      ? 'DEGENERATE_PENALTY_GUARD'
      : b >= alpha
        ? 'HIGH_PERMANENT_IMPACT_DRIFT'
        : 'WELL_POSED_HYPERBOLIC_DECAY';

    return {
      characteristicKappa: Number(kappa.toFixed(6)),
      effectiveTerminalZeta: Number(zeta.toFixed(6)),
      optimalLiquidationRateNu: Number(optimalLiquidationRateNu.toFixed(4)),
      permanentPriceDropExpected: Number(permanentPriceDropExpected.toFixed(6)),
      wellPosedConvexityCondition,
      regime,
    };
  }
}
