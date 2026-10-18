// SPDX-License-Identifier: MIT
/**
 * Wave 338 — Kyle (1985) Continuous Auctions and Insider Trading Equilibrium
 * Computes linear equilibrium Kyle's Lambda (λ = √Σ0 / (2 * σu)), insider trading intensity β,
 * market depth (1/λ), and post-auction residual variance Σ1 = Σ0 / 2.
 */

export interface Kyle1985AuctionInput {
  readonly priorPrice0: number;
  readonly assetValueStdSigmaV: number;
  readonly noiseVolumeStdSigmaU: number;
  readonly aggregateOrderFlowY: number;
  readonly privateSignalValuationV?: number;
}

export interface Kyle1985AuctionOutput {
  readonly kyleLambda: number;
  readonly marketDepthInverseLambda: number;
  readonly insiderIntensityBeta: number;
  readonly clearingPrice: number;
  readonly priceImpactDelta: number;
  readonly postAuctionVarianceSigma1: number;
  readonly expectedInsiderProfit: number;
}

export class Kyle1985AuctionEngine {
  public solveLinearEquilibrium(input: Kyle1985AuctionInput): Kyle1985AuctionOutput {
    const sigmaV = Math.max(1e-6, input.assetValueStdSigmaV);
    const sigmaU = Math.max(1e-6, input.noiseVolumeStdSigmaU);

    // Kyle (1985) Theorem 1: λ = σ_v / (2 * σ_u), β = σ_u / σ_v
    const kyleLambda = sigmaV / (2 * sigmaU);
    const marketDepthInverseLambda = 1 / Math.max(1e-9, kyleLambda);
    const insiderIntensityBeta = sigmaU / sigmaV;

    const priceImpactDelta = kyleLambda * input.aggregateOrderFlowY;
    const clearingPrice = input.priorPrice0 + priceImpactDelta;
    const postAuctionVarianceSigma1 = 0.5 * sigmaV * sigmaV;
    const expectedInsiderProfit = 0.5 * sigmaV * sigmaU;

    return {
      kyleLambda: Number(kyleLambda.toFixed(6)),
      marketDepthInverseLambda: Number(marketDepthInverseLambda.toFixed(6)),
      insiderIntensityBeta: Number(insiderIntensityBeta.toFixed(6)),
      clearingPrice: Number(clearingPrice.toFixed(6)),
      priceImpactDelta: Number(priceImpactDelta.toFixed(6)),
      postAuctionVarianceSigma1: Number(postAuctionVarianceSigma1.toFixed(6)),
      expectedInsiderProfit: Number(expectedInsiderProfit.toFixed(6)),
    };
  }
}
