import type {
  Bouchaud2018TradesBookInput,
  Bouchaud2018TradesBookOutput,
} from './types';

export class Bouchaud2018TradesBook {
  /**
   * Bouchaud, Bonart, Donier & Gould (2018) Trades, Quotes and Prices:
   * Models latent liquidity buffer D_eff = D_vis * (1 + L_latent) and
   * propagator impact delta_p = G(l) * eps * sgn(Q) * sqrt(|Q| / D_eff).
   */
  static evaluate(
    input: Bouchaud2018TradesBookInput
  ): Bouchaud2018TradesBookOutput {
    const q = input.signedOrderVolumeLots;
    const dVis = Math.max(1e-6, input.visibleBookDepthLots);
    const latentMult = Math.max(0, input.latentLiquidityMultiplier);
    const gLag = Math.max(0, input.propagatorKernelAtLagG);
    const eps = Math.max(0, input.surpriseInnovationEpsilon);

    const effectiveTotalDepthLots = dVis * (1 + latentMult);
    const latentAbsorptionRatio =
      (effectiveTotalDepthLots - dVis) / effectiveTotalDepthLots;
    const linearKyleLambda = gLag / effectiveTotalDepthLots;
    const signQ = q >= 0 ? 1 : -1;
    const propagatorPriceImpactTicks =
      signQ * gLag * eps * Math.sqrt(Math.abs(q) / effectiveTotalDepthLots);

    const regime =
      eps >= 1.5
        ? 'SURPRISE_SHOCK'
        : latentAbsorptionRatio >= 0.5
          ? 'LATENT_ABSORBED'
          : 'VISIBLE_DEPLETED';

    return {
      effectiveTotalDepthLots: Number(effectiveTotalDepthLots.toFixed(6)),
      linearKyleLambda: Number(linearKyleLambda.toFixed(6)),
      propagatorPriceImpactTicks: Number(propagatorPriceImpactTicks.toFixed(6)),
      latentAbsorptionRatio: Number(latentAbsorptionRatio.toFixed(6)),
      regime,
    };
  }
}
