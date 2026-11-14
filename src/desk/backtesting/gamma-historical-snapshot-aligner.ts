/**
 * Gamma Historical Snapshot Aligner
 *
 * Pure parsing and point-in-time carry-forward alignment helpers for
 * `GammaHistoricalProvider`. Every emitted snapshot and market row carries
 * `source: 'prices-history'`.
 */

import type { GammaMarket } from '../polymarket/gamma-client';
import { L2_SOURCE_PRICES_HISTORY, type PricesHistoryRow } from '../polymarket/l2/l2-source-labels';
import type { HistoricalMarketData, HistoricalSnapshot } from './types';
import { parseJsonStringArray } from './backtest-price-regimes';

export function parseGammaMarketRow(r: Record<string, unknown>): GammaMarket {
  const conditionId = String(r.conditionId ?? r.id ?? '');
  const parsedPrices = parseJsonStringArray(r.outcomePrices);
  const outcomePrices = parsedPrices.length >= 2 ? parsedPrices : ['0.5', '0.5'];
  const parsedOutcomes = parseJsonStringArray(r.outcomes);
  const outcomes = parsedOutcomes.length >= 2 ? parsedOutcomes : ['Yes', 'No'];
  const clobTokenIds = parseJsonStringArray(r.clobTokenIds);
  const yesPrice = parseFloat(outcomePrices[0] ?? '0.5') || 0.5;
  const noPrice = parseFloat(outcomePrices[1] ?? String(1 - yesPrice)) || 1 - yesPrice;
  const yesTokenId = clobTokenIds[0] ?? String(r.yesTokenId ?? `${conditionId}-yes`);
  const noTokenId = clobTokenIds[1] ?? String(r.noTokenId ?? `${conditionId}-no`);

  return {
    id: String(r.id ?? conditionId),
    question: String(r.question ?? ''),
    conditionId,
    slug: String(r.slug ?? ''),
    outcomes,
    outcomePrices,
    volume: Number(r.volumeNum ?? r.volume ?? 0),
    liquidity: Number(r.liquidityNum ?? r.liquidity ?? 0),
    endDate: String(r.end_date_iso ?? r.endDate ?? ''),
    active: r.active !== false,
    closed: r.closed === true,
    resolved: r.resolved === true,
    tokens: [
      { token_id: yesTokenId, outcome: outcomes[0] ?? 'Yes', price: yesPrice },
      { token_id: noTokenId, outcome: outcomes[1] ?? 'No', price: noPrice },
    ],
    yesTokenId,
    noTokenId,
    yesPrice,
  };
}

export function buildAlignedSnapshots(
  observed: ReadonlyArray<{ market: GammaMarket; rows: PricesHistoryRow[] }>,
  days: number,
  maxTicks: number,
): HistoricalSnapshot[] {
  const now = Date.now();
  const startTime = now - days * 24 * 60 * 60 * 1000;
  const snapshots: HistoricalSnapshot[] = [];

  for (let i = 0; i < maxTicks; i++) {
    const progress = i / (maxTicks - 1 || 1);
    const gridMs = startTime + progress * (now - startTime);
    const markets: HistoricalMarketData[] = observed.map(({ market, rows }) => ({
      conditionId: market.conditionId,
      question: market.question,
      source: L2_SOURCE_PRICES_HISTORY,
      yesTokenId: market.yesTokenId,
      noTokenId: market.noTokenId,
      yesPrice: carryForwardPriceAt(rows, gridMs),
      volume: market.volume,
      liquidity: market.liquidity,
      closed: market.closed,
      endDate: market.endDate,
    }));
    snapshots.push({
      timestamp: new Date(gridMs).toISOString(),
      source: L2_SOURCE_PRICES_HISTORY,
      markets,
    });
  }
  return snapshots;
}

/** Point-in-time carry-forward: latest price at or before `gridMs`, else first observed point. */
export function carryForwardPriceAt(rows: readonly PricesHistoryRow[], gridMs: number): number {
  let chosen = rows[0]!;
  for (const row of rows) {
    if (row.t <= gridMs) chosen = row;
    else break;
  }
  return Math.max(0.001, Math.min(0.999, chosen.price));
}
