/**
 * Basket Pricer & Depth Walker
 * Evaluates net profitability for multi-outcome prediction market baskets
 * by walking orderbook levels, modeling AMM price impact, and netting fees and gas costs.
 */

import { MultiTokenPool } from '../pool/multi-token-pool';
import { OrderbookSnapshot } from '../types/amm-types';
import { ArbitrageOpportunity } from '../types/arbitrage-types';

export interface BasketPricingConfig {
  gasLimit?: number; // baseline 500,000 gas buffer
  gasPriceGwei?: number;
  ethPriceUsd?: number;
  fixedGasUsd?: number;
  mintFeeBps?: number;
  mergeFeeBps?: number;
  takerFeeBps?: number;
  minProfitHurdleUsd?: number;
}

export interface BasketValuation {
  maxExecutableSets: number;
  optimalSets: number;
  grossEdge: number;
  netEdge: number;
  expectedProfitUsd: number;
  expectedRoi: number;
  totalCostUsd: number;
  totalRevenueUsd: number;
  estimatedFeesUsd: number;
  estimatedGasUsd: number;
  vwapPrices: number[];
  isProfitable: boolean;
}

export class BasketPricer {
  public static readonly BASELINE_GAS_BUFFER = 500_000;

  public static calculateGasCostUsd(config?: BasketPricingConfig): number {
    if (config?.fixedGasUsd !== undefined) return config.fixedGasUsd;
    const gasLimit = config?.gasLimit ?? this.BASELINE_GAS_BUFFER;
    const gasPriceGwei = config?.gasPriceGwei ?? 30;
    const nativePriceUsd = config?.ethPriceUsd ?? 0.5; // Polygon MATIC/POL default
    return Number((gasLimit * gasPriceGwei * 1e-9 * nativePriceUsd).toFixed(4));
  }

  public static priceOpportunity(
    opp: ArbitrageOpportunity,
    config?: BasketPricingConfig,
    orderbooks?: Map<number, OrderbookSnapshot> | OrderbookSnapshot[],
    _pool?: MultiTokenPool
  ): BasketValuation {
    const books = this.normalizeOrderbooks(orderbooks);
    const gasCostUsd = this.calculateGasCostUsd(config);
    const takerFeeRate = (config?.takerFeeBps ?? 10) / 10000;
    const mintFeeRate = (config?.mintFeeBps ?? 0) / 10000;
    const mergeFeeRate = (config?.mergeFeeBps ?? 0) / 10000;
    const minHurdle = config?.minProfitHurdleUsd ?? 0.1;

    if (books.size > 0 && opp.legs.length > 0) {
      return this.walkDepth(opp, books, gasCostUsd, takerFeeRate, mintFeeRate, mergeFeeRate, minHurdle);
    }

    const sets = opp.maxExecutableSets > 0 ? opp.maxExecutableSets : 100;
    const isOverpriced = opp.type === 'OVERPRICED_BASKET' || opp.type === 'SYNTHETIC_DISCREPANCY';
    const sumPrices = opp.legs.reduce((acc, l) => acc + l.price, 0);
    const grossEdge = isOverpriced ? sumPrices - 1.0 : 1.0 - sumPrices;
    const tradingFees = sets * sumPrices * takerFeeRate;
    const totalFees = tradingFees + (isOverpriced ? sets * mintFeeRate : sets * mergeFeeRate);
    const totalRevenue = isOverpriced ? sets * sumPrices : sets * 1.0;
    const totalCost = isOverpriced ? sets * 1.0 : sets * sumPrices;
    const netProfitUsd = Number((totalRevenue - totalCost - totalFees - gasCostUsd).toFixed(4));
    const netEdge = Number((grossEdge - (totalFees + gasCostUsd) / sets).toFixed(6));
    const expectedRoi = totalCost > 0 ? Number((netProfitUsd / totalCost).toFixed(6)) : 0;

    return {
      maxExecutableSets: sets,
      optimalSets: sets,
      grossEdge: Number(grossEdge.toFixed(6)),
      netEdge,
      expectedProfitUsd: netProfitUsd,
      expectedRoi,
      totalCostUsd: Number(totalCost.toFixed(4)),
      totalRevenueUsd: Number(totalRevenue.toFixed(4)),
      estimatedFeesUsd: Number(totalFees.toFixed(4)),
      estimatedGasUsd: gasCostUsd,
      vwapPrices: opp.legs.map((l) => l.price),
      isProfitable: netProfitUsd >= minHurdle,
    };
  }

  public static walkDepth(
    opp: ArbitrageOpportunity,
    books: Map<number, OrderbookSnapshot>,
    gasCostUsd: number,
    takerFeeRate: number,
    mintFeeRate: number,
    mergeFeeRate: number,
    minHurdle: number
  ): BasketValuation {
    const isOverpriced = opp.type === 'OVERPRICED_BASKET' || opp.type === 'SYNTHETIC_DISCREPANCY';
    let [bestSets, maxProfit, bestCost, bestRevenue, bestFees] = [0, -Infinity, 0, 0, 0];
    let bestVwap: number[] = opp.legs.map((l) => l.price);
    const maxWalkSets = Math.min(opp.maxExecutableSets || 1000, 5000);
    const step = Math.max(1, Math.floor(maxWalkSets / 40));

    for (let sets = step; sets <= maxWalkSets; sets += step) {
      let feasible = true;
      const vwapList: number[] = [];
      let legCostOrRevSum = 0;

      for (const leg of opp.legs) {
        const book = books.get(leg.outcomeIndex);
        if (!book) {
          vwapList.push(leg.price);
          legCostOrRevSum += leg.price * sets;
          continue;
        }
        const levels = isOverpriced ? book.bids : book.asks;
        const fill = this.simulateLevelFill(levels, sets);
        if (fill.filled < sets) {
          feasible = false;
          break;
        }
        vwapList.push(fill.vwap);
        legCostOrRevSum += fill.total;
      }

      if (!feasible) break;
      const fees = legCostOrRevSum * takerFeeRate + (isOverpriced ? sets * mintFeeRate : sets * mergeFeeRate);
      const revenue = isOverpriced ? legCostOrRevSum : sets * 1.0;
      const cost = isOverpriced ? sets * 1.0 : legCostOrRevSum;
      const profit = revenue - cost - fees - gasCostUsd;

      if (profit > maxProfit) {
        [maxProfit, bestSets, bestVwap, bestCost, bestRevenue, bestFees] = [
          profit, sets, vwapList, cost, revenue, fees,
        ];
      } else if (profit < maxProfit - 0.5) {
        break; // Edge collapsing past peak
      }
    }

    const optimalSets = bestSets > 0 ? bestSets : 0;
    const finalProfit = bestSets > 0 ? Number(maxProfit.toFixed(4)) : 0;
    const sumBestVwap = bestVwap.reduce((a, b) => a + b, 0);
    const grossEdge = isOverpriced ? sumBestVwap - 1.0 : 1.0 - sumBestVwap;
    const netEdge = optimalSets > 0 ? finalProfit / optimalSets : 0;

    return {
      maxExecutableSets: maxWalkSets,
      optimalSets,
      grossEdge: Number(grossEdge.toFixed(6)),
      netEdge: Number(netEdge.toFixed(6)),
      expectedProfitUsd: finalProfit,
      expectedRoi: bestCost > 0 ? Number((finalProfit / bestCost).toFixed(6)) : 0,
      totalCostUsd: Number(bestCost.toFixed(4)),
      totalRevenueUsd: Number(bestRevenue.toFixed(4)),
      estimatedFeesUsd: Number(bestFees.toFixed(4)),
      estimatedGasUsd: gasCostUsd,
      vwapPrices: bestVwap.map((p) => Number(p.toFixed(4))),
      isProfitable: finalProfit >= minHurdle,
    };
  }

  private static simulateLevelFill(
    levels: { price: number; size: number }[],
    targetSize: number
  ): { filled: number; total: number; vwap: number } {
    let remaining = targetSize;
    let total = 0;
    for (const lvl of levels) {
      if (remaining <= 0) break;
      const fill = Math.min(remaining, lvl.size);
      total += fill * lvl.price;
      remaining -= fill;
    }
    const filled = targetSize - remaining;
    return { filled, total, vwap: filled > 0 ? total / filled : 0 };
  }

  private static normalizeOrderbooks(
    input?: Map<number, OrderbookSnapshot> | OrderbookSnapshot[]
  ): Map<number, OrderbookSnapshot> {
    const map = new Map<number, OrderbookSnapshot>();
    if (!input) return map;
    if (input instanceof Map) return new Map(input);
    for (const snap of input) map.set(snap.outcomeIndex, snap);
    return map;
  }
}
