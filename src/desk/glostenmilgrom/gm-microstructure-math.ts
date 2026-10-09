import { QuoteState, TradeDirection } from './gm-microstructure-types';

export class GlostenMilgromMath {
  public static computePosteriors(
    p: number,
    alpha: number,
    gamma: number
  ): { pIfBuy: number; pIfSell: number } {
    const probBuyGivenH = alpha + (1.0 - alpha) * gamma;
    const probBuyGivenL = (1.0 - alpha) * gamma;
    const probBuy = p * probBuyGivenH + (1.0 - p) * probBuyGivenL;
    const pIfBuy = Math.min(1.0, Math.max(0.0, (p * probBuyGivenH) / Math.max(1e-12, probBuy)));

    const probSellGivenH = (1.0 - alpha) * (1.0 - gamma);
    const probSellGivenL = alpha + (1.0 - alpha) * (1.0 - gamma);
    const probSell = p * probSellGivenH + (1.0 - p) * probSellGivenL;
    const pIfSell = Math.min(1.0, Math.max(0.0, (p * probSellGivenH) / Math.max(1e-12, probSell)));

    return { pIfBuy, pIfSell };
  }

  public static calculateQuotes(
    VL: number,
    VH: number,
    p: number,
    alpha: number,
    gamma: number
  ): QuoteState {
    const { pIfBuy, pIfSell } = this.computePosteriors(p, alpha, gamma);
    const valueRange = VH - VL;
    const ask = VL + valueRange * pIfBuy;
    const bid = VL + valueRange * pIfSell;
    const spread = Math.max(0.0, ask - bid);
    const midPrice = 0.5 * (ask + bid);

    return {
      ask,
      bid,
      spread,
      midPrice,
      posteriorProbabilityHigh: p,
      posteriorIfBuy: pIfBuy,
      posteriorIfSell: pIfSell,
    };
  }

  public static updateBelief(
    trade: TradeDirection,
    p: number,
    alpha: number,
    gamma: number
  ): number {
    const { pIfBuy, pIfSell } = this.computePosteriors(p, alpha, gamma);
    return trade === 1 ? pIfBuy : pIfSell;
  }
}
