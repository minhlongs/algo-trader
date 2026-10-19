/**
* Depth-walking simulation and orderbook normalization helpers for BasketPricer.
*
* @module desk/amm/arbitrage/basket-pricer-walker
*/

import type { OrderbookSnapshot } from '../types/amm-types';
import type { ArbitrageOpportunity } from '../types/arbitrage-types';
import type { BasketValuation } from './basket-pricer-types';

export function simulateLevelFill(
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

export function normalizeOrderbooks(
  input?: Map<number, OrderbookSnapshot> | OrderbookSnapshot[]
): Map<number, OrderbookSnapshot> {
  const map = new Map<number, OrderbookSnapshot>();
  if (!input) return map;
  if (input instanceof Map) return new Map(input);
  for (const snap of input) map.set(snap.outcomeIndex, snap);
  return map;
}

export function walkDepth(
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
      const fill = simulateLevelFill(levels, sets);
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
