/**
 * Herd Behavior Series Tracker & Return Series Utilities
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import { calcReturn } from './herd-behavior-math-helpers';

export interface ValidMarketPrices {
  market: GammaMarket;
  prices: number[];
}

export interface MarketReturnEntry {
  market: GammaMarket;
  ret: number;
}

export interface ProcessedReturnSeries {
  returnSeries: number[][];
  marketReturns: MarketReturnEntry[];
}

export class HerdPriceHistoryTracker {
  private readonly priceHistory = new Map<string, number[]>();

  public recordPrice(tokenId: string, price: number, returnWindow: number): void {
    let history = this.priceHistory.get(tokenId);
    if (!history) {
      history = [];
      this.priceHistory.set(tokenId, history);
    }
    history.push(price);
    if (history.length > returnWindow + 1) {
      history.splice(0, history.length - (returnWindow + 1));
    }
  }

  public getPrices(tokenId: string): number[] {
    return this.priceHistory.get(tokenId) ?? [];
  }

  public buildReturnSeries(validMarkets: ValidMarketPrices[]): ProcessedReturnSeries {
    const returnSeries: number[][] = [];
    const marketReturns: MarketReturnEntry[] = [];

    for (const { market, prices } of validMarkets) {
      const returns: number[] = [];
      for (let i = 1; i < prices.length; i++) {
        returns.push(prices[i - 1] === 0 ? 0 : (prices[i] - prices[i - 1]) / prices[i - 1]);
      }
      if (returns.length > 0) {
        returnSeries.push(returns);
        marketReturns.push({ market, ret: calcReturn(prices) });
      }
    }

    return { returnSeries, marketReturns };
  }
}
