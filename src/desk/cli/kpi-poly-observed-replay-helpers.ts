/**
 * Helper adapters and post-replay telemetry builders for `kpi-poly-observed-replay`.
 */

import type { BacktestTrade, HistoricalSnapshot } from '../backtesting/types';
import type { ClobClient, RawOrderBook } from '../polymarket/clob-client';
import type { FeeScheduleResolver } from '../polymarket/fee-schedule-resolver';
import type { GammaClient, GammaEvent, GammaMarket } from '../polymarket/gamma-client';
import type { ReplayedBookStep } from '../polymarket/l2/l2-replay';
import { parseLevels } from '../polymarket/orderbook-levels';
import { calcMakerRebatePerShare } from '../polymarket/polymarket-fee-calculator';
import type { QuoteFill } from '../strategies/polymarket/quant-alpha/toxicity-aware-market-maker-state';
import type { KpiClosedCycle, KpiMakerMarkoutSample } from './kpi-poly-types';

export function twoSidedMid(
  book?: { bids: ReadonlyArray<{ price: string; size: string }>; asks: ReadonlyArray<{ price: string; size: string }> },
): number | null {
  if (!book) return null;
  const bids = parseLevels([...book.bids]).filter((l) => l.price > 0 && l.size > 0);
  const asks = parseLevels([...book.asks]).filter((l) => l.price > 0 && l.size > 0);
  if (bids.length === 0 || asks.length === 0) return null;
  const bestBid = bids.reduce((m, l) => Math.max(m, l.price), 0);
  const bestAsk = asks.reduce((m, l) => Math.min(m, l.price), Infinity);
  return Number.isFinite(bestAsk) && bestBid > 0 ? (bestBid + bestAsk) / 2 : null;
}

export function buildObservedClobClient(
  bookByAsset: ReadonlyMap<string, RawOrderBook>,
  getNowMs: () => number,
): ClobClient {
  return {
    async getOrderBook(tokenId: string): Promise<RawOrderBook> {
      return bookByAsset.get(tokenId) ?? { bids: [], asks: [], timestamp: getNowMs() };
    },
    async getPrice(tokenId: string, side?: string): Promise<number> {
      const book = bookByAsset.get(tokenId);
      if (!book) return 0;
      const bids = parseLevels(book.bids).filter((l) => l.price > 0 && l.size > 0);
      const asks = parseLevels(book.asks).filter((l) => l.price > 0 && l.size > 0);
      if (side?.toUpperCase() === 'BUY') {
        return asks.length > 0 ? asks.reduce((m, l) => Math.min(m, l.price), Infinity) : 0;
      }
      if (side?.toUpperCase() === 'SELL') {
        return bids.length > 0 ? bids.reduce((m, l) => Math.max(m, l.price), 0) : 0;
      }
      return twoSidedMid(book) ?? 0;
    },
    async getMidPrice(tokenId: string): Promise<number> {
      return this.getPrice(tokenId);
    },
  };
}

export function buildObservedGammaClient(
  markets: readonly GammaMarket[],
  liveEvents: readonly GammaEvent[],
): GammaClient {
  return {
    getMarkets: async (params) => markets.slice(0, params?.limit ?? 100),
    getMarket: async (cid) => markets.find((m) => m.conditionId === cid) ?? null,
    getMarketGroup: async () => null,
    searchMarkets: async (q) =>
      markets.filter((m) => m.question.toLowerCase().includes(q.toLowerCase())),
    getTrending: async (limit = 15) => markets.slice(0, limit),
    getEvents: async (limit = 20) => liveEvents.slice(0, limit),
  };
}

export function snapshotMarketsToGamma(snapshot?: HistoricalSnapshot): GammaMarket[] {
  if (!snapshot) return [];
  return snapshot.markets.map((m) => ({
    id: m.conditionId,
    question: m.question,
    conditionId: m.conditionId,
    slug: m.conditionId,
    outcomes: ['Yes', 'No'],
    outcomePrices: [String(m.yesPrice), String(Math.max(0, 1 - m.yesPrice))],
    volume: m.volume,
    liquidity: m.liquidity,
    endDate: m.endDate,
    active: !m.closed,
    closed: m.closed,
    tokens: [
      ...(m.yesTokenId ? [{ token_id: m.yesTokenId, outcome: 'Yes', price: m.yesPrice }] : []),
      ...(m.noTokenId ? [{ token_id: m.noTokenId, outcome: 'No', price: Math.max(0, 1 - m.yesPrice) }] : []),
    ],
    yesTokenId: m.yesTokenId ?? '',
    noTokenId: m.noTokenId,
    yesPrice: m.yesPrice,
  }));
}

export function buildCyclesFromClosedTrades(
  closedTrades: readonly BacktestTrade[],
  tokenToCluster: ReadonlyMap<string, string>,
): KpiClosedCycle[] {
  return closedTrades.map((tr) => ({
    eventClusterId: tokenToCluster.get(tr.tokenId) ?? tr.marketId ?? tr.tokenId,
    netPnlPusd: tr.pnl ?? 0,
    feeAndSlippagePusd: Math.max(0, tr.venueCostUsd ?? 0),
    notionalPusd: tr.price * tr.size,
  }));
}

function findHorizonMid(steps: readonly ReplayedBookStep[], targetMs: number): number | null {
  for (const step of steps) {
    if (step.t < targetMs) continue;
    const mid = twoSidedMid(step);
    if (mid !== null) return mid;
  }
  return null;
}

export async function buildRealMakerMarkouts(
  fills: readonly QuoteFill[],
  l2Steps: readonly ReplayedBookStep[],
  feeResolver: FeeScheduleResolver,
): Promise<KpiMakerMarkoutSample[]> {
  if (fills.length === 0 || l2Steps.length === 0) return [];
  const byAsset = new Map<string, ReplayedBookStep[]>();
  for (const step of l2Steps) {
    const arr = byAsset.get(step.assetId);
    if (arr) arr.push(step);
    else byAsset.set(step.assetId, [step]);
  }
  for (const arr of byAsset.values()) {
    arr.sort((a, b) => a.t - b.t);
  }

  const samples: KpiMakerMarkoutSample[] = [];
  for (const fill of fills) {
    if (!(fill.entryPrice > 0)) continue;
    const steps = byAsset.get(fill.tokenId);
    if (!steps || steps.length === 0) continue;
    const midAt60s = findHorizonMid(steps, fill.atMs + 60_000);
    if (midAt60s === null) continue;
    const midAt5s = findHorizonMid(steps, fill.atMs + 5_000);
    const midAt300s = findHorizonMid(steps, fill.atMs + 300_000);
    let makerRebateBps = 0;
    try {
      const schedule = await feeResolver.resolve(fill.tokenId);
      if (schedule !== null) {
        makerRebateBps = (calcMakerRebatePerShare(schedule, fill.entryPrice) / fill.entryPrice) * 10_000;
      }
    } catch {
      makerRebateBps = 0;
    }
    samples.push({
      side: 'buy',
      fillPrice: fill.entryPrice,
      ...(midAt5s !== null ? { midAt5s } : {}),
      midAt60s,
      ...(midAt300s !== null ? { midAt300s } : {}),
      makerRebateBps,
      liquidityRewardBps: 0,
    });
  }
  return samples;
}
