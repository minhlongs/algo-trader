/**
 * Basket Pricer & Depth Walker
 * Evaluates net profitability for multi-outcome prediction market baskets
 * by walking orderbook levels, modeling AMM price impact, and netting fees and gas costs.
 */

import { MultiTokenPool } from '../pool/multi-token-pool';
import { OrderbookSnapshot } from '../types/amm-types';
import { ArbitrageOpportunity } from '../types/arbitrage-types';
import type { BasketPricingConfig, BasketValuation } from './basket-pricer-types';
import {
  simulateLevelFill,
  normalizeOrderbooks,
  walkDepth,
} from './basket-pricer-walker';

export type { BasketPricingConfig, BasketValuation };
export { simulateLevelFill, normalizeOrderbooks, walkDepth };

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
    const books = normalizeOrderbooks(orderbooks);
    const gasCostUsd = this.calculateGasCostUsd(config);
    const takerFeeRate = (config?.takerFeeBps ?? 10) / 10000;
    const mintFeeRate = (config?.mintFeeBps ?? 0) / 10000;
    const mergeFeeRate = (config?.mergeFeeBps ?? 0) / 10000;
    const minHurdle = config?.minProfitHurdleUsd ?? 0.1;

    if (books.size > 0 && opp.legs.length > 0) {
      return walkDepth(opp, books, gasCostUsd, takerFeeRate, mintFeeRate, mergeFeeRate, minHurdle);
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
    return walkDepth(opp, books, gasCostUsd, takerFeeRate, mintFeeRate, mergeFeeRate, minHurdle);
  }

  public static simulateLevelFill(
    levels: { price: number; size: number }[],
    targetSize: number
  ): { filled: number; total: number; vwap: number } {
    return simulateLevelFill(levels, targetSize);
  }

  public static normalizeOrderbooks(
    input?: Map<number, OrderbookSnapshot> | OrderbookSnapshot[]
  ): Map<number, OrderbookSnapshot> {
    return normalizeOrderbooks(input);
  }
}

