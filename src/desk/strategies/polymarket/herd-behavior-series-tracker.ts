/**
 * Herd Behavior Series Tracker & Return Series Utilities
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import type { StrategyName } from '../../core/types';
import type { BaseStrategyConfig } from './base-polymarket-strategy';
import {
  calcReturn,
  calcAvgPairwiseCorrelation,
  detectHerdPeak,
  calcHerdDirection,
} from './herd-behavior-math-helpers';

export interface HerdBehaviorDetectorConfig extends BaseStrategyConfig {
  herdThreshold: number;
  returnWindow: number;
  herdEmaAlpha: number;
  minMarkets: number;
}

export const DEFAULT_CONFIG: HerdBehaviorDetectorConfig = {
  herdThreshold: 0.6,
  returnWindow: 10,
  herdEmaAlpha: 0.15,
  minMarkets: 5,
  minVolume: 5000,
  takeProfitPct: 0.025,
  stopLossPct: 0.02,
  maxHoldMs: 15 * 60_000,
  maxPositions: 4,
  cooldownMs: 120_000,
  positionSize: '10',
};

export const STRATEGY_NAME = 'herd-behavior-detector' as StrategyName;

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

export function evaluateHerdFadeSignal(
  returnSeries: number[][],
  marketReturns: MarketReturnEntry[],
  prevHerdEma: number | null,
  currentHerdEma: number | null,
  herdThreshold: number
): { avgCorr: number; direction: 'up' | 'down'; fadeSide: 'yes' | 'no' } | null {
  const avgCorr = calcAvgPairwiseCorrelation(returnSeries);
  if (prevHerdEma === null || currentHerdEma === null) return null;
  if (!detectHerdPeak(prevHerdEma, currentHerdEma, herdThreshold)) return null;

  const direction = calcHerdDirection(marketReturns.map((mr) => mr.ret));
  if (direction === 'flat') return null;

  const fadeSide: 'yes' | 'no' = direction === 'up' ? 'no' : 'yes';
  return { avgCorr, direction, fadeSide };
}

export function resolveHerdFadeEntryParams(
  market: GammaMarket,
  prices: number[],
  fadeSide: 'yes' | 'no'
): { tokenId: string; entryPrice: number } | null {
  if (!market.yesTokenId || prices.length === 0) return null;
  const currentMid = prices[prices.length - 1];
  const tokenId = fadeSide === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
  const entryPrice = fadeSide === 'yes' ? currentMid : 1 - currentMid;
  if (entryPrice <= 0 || entryPrice >= 1) return null;
  return { tokenId, entryPrice };
}
