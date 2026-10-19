import type {
  CarteaJaimungal2016CointegratedInput,
  CarteaJaimungal2016CointegratedOutput,
} from './types';

export class CarteaJaimungal2016Cointegrated {
  static evaluate(
    input: CarteaJaimungal2016CointegratedInput
  ): CarteaJaimungal2016CointegratedOutput {
    const kappa = Math.max(1e-6, input.meanReversionKappa);
    const k = Math.max(1e-8, input.temporaryImpactK);
    const phi = Math.max(1e-8, input.runningInventoryPenaltyPhi);
    const tau = Math.max(1, input.remainingHorizonSeconds);

    const spreadMispricingDelta = input.currentSpreadX - input.equilibriumTheta;
    const halfLifeSeconds = Math.LN2 / kappa;
    const decayFactor = (1 - Math.exp(-kappa * tau)) / kappa;

    const meanReversionSignalRate = (-kappa * spreadMispricingDelta * decayFactor) / (2 * k);
    const gamma = Math.sqrt(phi / k);
    const inventoryDampingRate = -gamma * Math.tanh(gamma * tau) * input.currentInventoryQ;
    const optimalSpreadTradingRateNu = meanReversionSignalRate + inventoryDampingRate;

    const regime =
      Math.abs(meanReversionSignalRate) < 1e-3 && Math.abs(inventoryDampingRate) < 1e-3
        ? 'NEUTRAL_EQUILIBRIUM_BAND'
        : Math.abs(inventoryDampingRate) > Math.abs(meanReversionSignalRate)
          ? 'INVENTORY_UNWIND_DOMINANT'
          : 'CONVERGENCE_ALPHA_ENTRY';

    return {
      spreadMispricingDelta: Number(spreadMispricingDelta.toFixed(6)),
      halfLifeSeconds: Number(halfLifeSeconds.toFixed(4)),
      meanReversionSignalRate: Number(meanReversionSignalRate.toFixed(4)),
      inventoryDampingRate: Number(inventoryDampingRate.toFixed(4)),
      optimalSpreadTradingRateNu: Number(optimalSpreadTradingRateNu.toFixed(4)),
      regime,
    };
  }
}
