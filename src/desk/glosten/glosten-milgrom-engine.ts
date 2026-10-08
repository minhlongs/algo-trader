import { GlostenMilgromParameters, GlostenQuoteSpread, SequentialBayesianStep, TradeAction } from './glosten-types';

export class GlostenMilgromEngine {
  public computeQuotes(p: number, params: GlostenMilgromParameters): GlostenQuoteSpread {
    const { highAssetValueVHigh: VH, lowAssetValueVLow: VL, fractionInformedTradersAlpha: alpha } = params;

    if (VH <= VL) throw new Error('V_High must be strictly greater than V_Low');
    if (p <= 0 || p >= 1) throw new Error('Prior probability must be in (0, 1)');
    if (alpha < 0 || alpha >= 1) throw new Error('Alpha fraction of informed traders must be in [0, 1)');

    const expectedValue = p * VH + (1.0 - p) * VL;

    // P(Buy | V_H) = alpha + (1 - alpha) * 0.5 = 0.5 * (1 + alpha)
    // P(Buy | V_L) = (1 - alpha) * 0.5 = 0.5 * (1 - alpha)
    // P(Buy) = p * 0.5 * (1 + alpha) + (1 - p) * 0.5 * (1 - alpha)
    const probBuyGivenH = 0.5 * (1.0 + alpha);
    const probBuyGivenL = 0.5 * (1.0 - alpha);
    const probBuy = p * probBuyGivenH + (1.0 - p) * probBuyGivenL;

    // Bayes update on Buy: P(V_H | Buy) = (p * P(Buy | V_H)) / P(Buy)
    const pGivenBuy = (p * probBuyGivenH) / probBuy;
    const ask = pGivenBuy * VH + (1.0 - pGivenBuy) * VL;

    // P(Sell | V_H) = 0.5 * (1 - alpha)
    // P(Sell | V_L) = alpha + 0.5 * (1 - alpha) = 0.5 * (1 + alpha)
    const probSellGivenH = 0.5 * (1.0 - alpha);
    const probSellGivenL = 0.5 * (1.0 + alpha);
    const probSell = p * probSellGivenH + (1.0 - p) * probSellGivenL;

    // Bayes update on Sell: P(V_H | Sell) = (p * P(Sell | V_H)) / P(Sell)
    const pGivenSell = (p * probSellGivenH) / probSell;
    const bid = pGivenSell * VH + (1.0 - pGivenSell) * VL;

    const spread = ask - bid;
    const adverseSelectionPct = (spread / expectedValue) * 100.0;

    return {
      askPriceUsd: Number(ask.toFixed(4)),
      bidPriceUsd: Number(bid.toFixed(4)),
      midPriceUsd: Number(expectedValue.toFixed(4)),
      bidAskSpreadUsd: Number(spread.toFixed(4)),
      adverseSelectionSpreadPct: Number(adverseSelectionPct.toFixed(4)),
    };
  }

  public simulateSequentialTrades(
    trades: TradeAction[],
    params: GlostenMilgromParameters
  ): SequentialBayesianStep[] {
    const { highAssetValueVHigh: VH, lowAssetValueVLow: VL, fractionInformedTradersAlpha: alpha } = params;
    let currentP = params.priorProbabilityHigh;

    const history: SequentialBayesianStep[] = [];

    for (let i = 0; i < trades.length; i++) {
      const action = trades[i]!;
      const quotes = this.computeQuotes(currentP, params);

      const probBuyGivenH = 0.5 * (1.0 + alpha);
      const probBuyGivenL = 0.5 * (1.0 - alpha);
      const probSellGivenH = 0.5 * (1.0 - alpha);
      const probSellGivenL = 0.5 * (1.0 + alpha);

      let posteriorP = currentP;
      let executedPrice = quotes.midPriceUsd;

      if (action === 'BUY') {
        const pBuy = currentP * probBuyGivenH + (1.0 - currentP) * probBuyGivenL;
        posteriorP = (currentP * probBuyGivenH) / pBuy;
        executedPrice = quotes.askPriceUsd;
      } else {
        const pSell = currentP * probSellGivenH + (1.0 - currentP) * probSellGivenL;
        posteriorP = (currentP * probSellGivenH) / pSell;
        executedPrice = quotes.bidPriceUsd;
      }

      history.push({
        tradeIndex: i + 1,
        tradeAction: action,
        priorProbabilityHigh: Number(currentP.toFixed(4)),
        posteriorProbabilityHigh: Number(posteriorP.toFixed(4)),
        askPriceUsd: quotes.askPriceUsd,
        bidPriceUsd: quotes.bidPriceUsd,
        executedPriceUsd: executedPrice,
        expectedAssetValueUsd: Number((posteriorP * VH + (1.0 - posteriorP) * VL).toFixed(4)),
      });

      currentP = posteriorP;
    }

    return history;
  }
}
