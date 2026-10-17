import type {
  AlmgrenChriss2001RiskInput,
  AlmgrenChriss2001RiskOutput,
} from './types';

export class AlmgrenChriss2001Risk {
  /**
   * Almgren & Chriss (2001) Optimal Execution of Portfolio Transactions:
   * Evaluates efficient frontier Expected Shortfall E[x], Variance V[x],
   * characteristic urgency kappa = sqrt(lambda * sigma^2 / eta), and half-life ln(2)/kappa.
   */
  static evaluate(input: AlmgrenChriss2001RiskInput): AlmgrenChriss2001RiskOutput {
    const X0 = input.initialSharesX0;
    const sigma = Math.max(1e-8, input.volatilityPerSecSigma);
    const eta = Math.max(1e-8, input.temporaryImpactEta);
    const gamma = Math.max(0, input.permanentImpactGamma);
    const lambda = Math.max(1e-12, input.riskAversionLambda);
    const T = Math.max(1e-3, input.horizonSecT);

    const urgencyRateKappa = Math.sqrt((lambda * sigma * sigma) / eta);
    const halfLifeSec = Math.LN2 / Math.max(1e-9, urgencyRateKappa);
    const expectedPermanentCostUsd = 0.5 * gamma * X0 * X0;

    const kappaT = urgencyRateKappa * T;
    const cothKappaT =
      kappaT > 20 ? 1 : Math.cosh(kappaT) / Math.max(1e-9, Math.sinh(kappaT));
    const expectedTemporaryCostUsd =
      eta * X0 * X0 * urgencyRateKappa * cothKappaT * 0.5;
    const expectedShortfallUsd =
      expectedPermanentCostUsd + expectedTemporaryCostUsd;
    const varianceApprox = (sigma * sigma * X0 * X0) / (2 * urgencyRateKappa);
    const utilityAdjustedCostUsd =
      expectedShortfallUsd + lambda * varianceApprox;

    const regime =
      kappaT < 0.25
        ? 'RISK_NEUTRAL_TWAP'
        : kappaT > 2.0
          ? 'AGGRESSIVE_URGENT'
          : 'MODERATE_FRONT_LOAD';

    return {
      urgencyRateKappa: Number(urgencyRateKappa.toFixed(6)),
      halfLifeSec: Number(halfLifeSec.toFixed(6)),
      expectedPermanentCostUsd: Number(expectedPermanentCostUsd.toFixed(6)),
      expectedTemporaryCostUsd: Number(expectedTemporaryCostUsd.toFixed(6)),
      expectedShortfallUsd: Number(expectedShortfallUsd.toFixed(6)),
      utilityAdjustedCostUsd: Number(utilityAdjustedCostUsd.toFixed(6)),
      regime,
    };
  }
}
