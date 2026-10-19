/**
 * Split-Merge Arbitrage Scanner
 *
 * Scans Gamma markets for mispriced binary contracts where YES + NO < $0.98.
 *
 * @module desk/arbitrage/split-merge-scanner
 */

import {
  type SplitMergeOpportunity,
  type GammaMarket,
  FEE_THRESHOLD,
  POLY_FEE,
  MIN_PROFIT,
  MIN_VOLUME,
  parseOutcomePrices,
} from './split-merge-types';

/**
 * Scan a list of Gamma API markets for split-merge arb opportunities.
 * Only binary markets (yes + no prices) are applicable.
 */
export function scanSplitMergeArb(markets: GammaMarket[]): SplitMergeOpportunity[] {
  const opportunities: SplitMergeOpportunity[] = [];

  for (const m of markets) {
    if (m.closed || m.active === false) continue;

    const prices = parseOutcomePrices(m.outcomePrices);
    if (!prices) continue;

    const [yesPrice, noPrice] = prices;
    const totalCost = yesPrice + noPrice;

    // Must be strictly below fee threshold to net a positive return
    if (totalCost >= FEE_THRESHOLD) continue;

    // Merge: 1 YES + 1 NO → $1.00 payout, minus 2% fee on gross profit
    const grossProfit = 1.0 - totalCost;
    const profit = grossProfit - POLY_FEE;
    if (profit < MIN_PROFIT) continue;

    // Volume gate — ensure sufficient liquidity to fill both sides
    const volume = Number(m.volume ?? 0);
    if (volume < MIN_VOLUME) continue;

    opportunities.push({
      marketId: String(m.conditionId ?? ''),
      title: String(m.question ?? ''),
      yesPrice,
      noPrice,
      totalCost,
      profit,
      profitPercent: profit * 100,
    });
  }

  // Sort by highest profit first
  return opportunities.sort((a, b) => b.profit - a.profit);
}
