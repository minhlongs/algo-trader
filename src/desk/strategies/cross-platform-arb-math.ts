/**
 * Cross-Platform Arbitrage Pure Spread, Matching & Confidence Math
 */

import type { PlatformPrice, ArbOpportunity } from './cross-platform-arb-types';

/**
 * Compute confidence tier based on quote freshness (<10s) and spread percentage.
 */
export function computeArbConfidence(
  priceList: PlatformPrice[],
  spreadPercent: number,
  now = Date.now(),
): 'high' | 'medium' | 'low' {
  const freshness = priceList.every((p) => now - p.timestamp < 10_000);
  if (freshness && spreadPercent > 2) return 'high';
  if (freshness && spreadPercent > 1) return 'medium';
  return 'low';
}

/**
 * Evaluate whether an asset's cross-platform prices yield an arbitrage opportunity.
 */
export function evaluateAssetArb(
  asset: string,
  priceList: PlatformPrice[],
  minSpreadPercent: number,
  now = Date.now(),
): ArbOpportunity | null {
  if (priceList.length < 2) return null;
  const sortedByAsk = [...priceList].sort((a, b) => a.ask - b.ask);
  const sortedByBid = [...priceList].sort((a, b) => b.bid - a.bid);
  const bestAsk = sortedByAsk[0];
  const bestBid = sortedByBid[0];
  if (!bestAsk || !bestBid || bestAsk.platform === bestBid.platform) return null;

  const spread = bestBid.bid - bestAsk.ask;
  const spreadPercent = (spread / bestAsk.ask) * 100;
  if (spreadPercent < minSpreadPercent) return null;

  return {
    asset,
    buyPlatform: bestAsk.platform,
    sellPlatform: bestBid.platform,
    buyPrice: bestAsk.ask,
    sellPrice: bestBid.bid,
    spread,
    spreadPercent,
    estimatedProfit: spread,
    confidence: computeArbConfidence(priceList, spreadPercent, now),
    timestamp: now,
  };
}

/**
 * Upsert a platform price into the bounded asset price map.
 */
export function upsertPlatformPrice(
  prices: Map<string, PlatformPrice[]>,
  asset: string,
  price: PlatformPrice,
  maxAssets: number,
): void {
  const existing = prices.get(asset) ?? [];
  const idx = existing.findIndex((p) => p.platform === price.platform);
  if (idx >= 0) {
    existing[idx] = price;
  } else {
    existing.push(price);
  }
  if (prices.size >= maxAssets && !prices.has(asset)) {
    const firstKey = prices.keys().next().value;
    if (firstKey) prices.delete(firstKey);
  }
  prices.set(asset, existing);
}
