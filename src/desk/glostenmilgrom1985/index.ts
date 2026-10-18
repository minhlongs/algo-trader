// SPDX-License-Identifier: MIT
/**
 * Wave 337 — Glosten & Milgrom (1985) Sequential Trade Bayesian Belief & Regret Spread
 * Computes zero-profit competitive dealer quotes (Ask = E[V | Buy], Bid = E[V | Sell])
 * and Bayesian belief updates across sequential order-flow arrivals.
 */

export interface GlostenMilgromInput {
  readonly lowValueVL: number;
  readonly highValueVH: number;
  readonly priorProbHighMu: number;
  readonly informedTraderShareAlpha: number;
}

export interface GlostenMilgromQuoteOutput {
  readonly unconditionalFairValue: number;
  readonly askPriceGivenBuy: number;
  readonly bidPriceGivenSell: number;
  readonly adverseSelectionSpread: number;
  readonly posteriorMuAfterBuy: number;
  readonly posteriorMuAfterSell: number;
  readonly informationAsymmetryRatio: number;
}

export class GlostenMilgrom1985Engine {
  public evaluateSequentialQuote(input: GlostenMilgromInput): GlostenMilgromQuoteOutput {
    const vL = input.lowValueVL;
    const vH = Math.max(vL + 1e-6, input.highValueVH);
    const mu = Math.min(1 - 1e-6, Math.max(1e-6, input.priorProbHighMu));
    const alpha = Math.min(1 - 1e-6, Math.max(0, input.informedTraderShareAlpha));

    const unconditionalFairValue = vL + mu * (vH - vL);

    // P(Buy | V = VH) = alpha + (1 - alpha) * 0.5 = 0.5 * (1 + alpha)
    // P(Buy | V = VL) = (1 - alpha) * 0.5 = 0.5 * (1 - alpha)
    const probBuy = mu * 0.5 * (1 + alpha) + (1 - mu) * 0.5 * (1 - alpha);
    const posteriorMuAfterBuy = (mu * 0.5 * (1 + alpha)) / Math.max(1e-9, probBuy);

    // P(Sell | V = VH) = 0.5 * (1 - alpha)
    // P(Sell | V = VL) = 0.5 * (1 + alpha)
    const probSell = mu * 0.5 * (1 - alpha) + (1 - mu) * 0.5 * (1 + alpha);
    const posteriorMuAfterSell = (mu * 0.5 * (1 - alpha)) / Math.max(1e-9, probSell);

    const askPriceGivenBuy = vL + posteriorMuAfterBuy * (vH - vL);
    const bidPriceGivenSell = vL + posteriorMuAfterSell * (vH - vL);
    const adverseSelectionSpread = askPriceGivenBuy - bidPriceGivenSell;

    return {
      unconditionalFairValue: Number(unconditionalFairValue.toFixed(6)),
      askPriceGivenBuy: Number(askPriceGivenBuy.toFixed(6)),
      bidPriceGivenSell: Number(bidPriceGivenSell.toFixed(6)),
      adverseSelectionSpread: Number(adverseSelectionSpread.toFixed(6)),
      posteriorMuAfterBuy: Number(posteriorMuAfterBuy.toFixed(6)),
      posteriorMuAfterSell: Number(posteriorMuAfterSell.toFixed(6)),
      informationAsymmetryRatio: Number((adverseSelectionSpread / (vH - vL)).toFixed(6)),
    };
  }
}
