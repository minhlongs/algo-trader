import { KyleEquilibriumResult, KyleMarketParameters, OrderImpactEvaluation } from './kyle-types';

export class KyleLambdaEngine {
  public computeEquilibrium(params: KyleMarketParameters): KyleEquilibriumResult {
    const { fundamentalVarianceSigmaV2: sigmaV2, noiseOrderFlowVarianceSigmaU2: sigmaU2 } = params;

    if (sigmaV2 <= 0 || sigmaU2 <= 0) {
      throw new Error('Variances of fundamental value and noise flow must be positive');
    }

    // In Kyle's (1985) static single-auction equilibrium:
    // beta = sqrt(sigma_u^2 / sigma_v^2)
    // lambda = (beta * sigma_v^2) / (beta^2 * sigma_v^2 + sigma_u^2) = 0.5 * sqrt(sigma_v^2 / sigma_u^2)
    const beta = Math.sqrt(sigmaU2 / sigmaV2);
    const lambda = 0.5 * Math.sqrt(sigmaV2 / sigmaU2);
    const depth = 1.0 / lambda;

    // Expected profit = 0.5 * sqrt(sigma_v^2 * sigma_u^2)
    const expectedProfit = 0.5 * Math.sqrt(sigmaV2 * sigmaU2);

    // Posterior variance of value conditional on total order flow:
    // Var(v | y) = 0.5 * sigma_v^2 -> 50% price efficiency improvement
    const priceEfficiencyPct = 50.0;

    return {
      kyleLambda: Number(lambda.toFixed(6)),
      informedOrderBeta: Number(beta.toFixed(6)),
      marketLiquidityDepth: Number(depth.toFixed(4)),
      expectedInformedProfitUsd: Number(expectedProfit.toFixed(2)),
      priceEfficiencyPct,
    };
  }

  public evaluateOrderExecution(
    p0: number,
    orderFlow: number,
    params: KyleMarketParameters
  ): OrderImpactEvaluation {
    if (p0 <= 0) {
      throw new Error('Initial price must be positive');
    }

    const { kyleLambda } = this.computeEquilibrium(params);
    const impactUsd = kyleLambda * orderFlow;
    const executedPrice = p0 + impactUsd;
    const slippageBps = (impactUsd / p0) * 10000.0;

    return {
      unperturbedPriceUsd: Number(p0.toFixed(2)),
      netOrderFlowShares: orderFlow,
      executedPriceUsd: Number(executedPrice.toFixed(4)),
      permanentPriceImpactUsd: Number(impactUsd.toFixed(4)),
      slippageBps: Number(slippageBps.toFixed(2)),
    };
  }
}
