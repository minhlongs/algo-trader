export interface Bouchaud2018TradesBookInput {
  readonly signedOrderVolumeLots: number;
  readonly visibleBookDepthLots: number;
  readonly latentLiquidityMultiplier: number;
  readonly propagatorKernelAtLagG: number;
  readonly surpriseInnovationEpsilon: number;
}

export interface Bouchaud2018TradesBookOutput {
  readonly effectiveTotalDepthLots: number;
  readonly linearKyleLambda: number;
  readonly propagatorPriceImpactTicks: number;
  readonly latentAbsorptionRatio: number;
  readonly regime: 'LATENT_ABSORBED' | 'VISIBLE_DEPLETED' | 'SURPRISE_SHOCK';
}
