/**
 * Observed microstructure, capacity, and cost-stress metrics derived from
 * replayed `recorded-l2` books, `data-api-v2` trades, and paper cycles.
 */

import type { BacktestTrade, HistoricalSnapshot } from '../backtesting/types';
import type { GammaEvent } from '../polymarket/gamma-client';
import type { ReplayedBookStep } from '../polymarket/l2/l2-replay';
import type { DataApiV2TradeRow } from '../polymarket/l2/l2-source-labels';
import { parseLevels } from '../polymarket/orderbook-levels';
import {
  buildQueueModel,
  createSeededRandom,
  estimateMakerQueue,
  simulateMakerFill,
} from '../polymarket/queue-aware-fill-simulator';
import { KPI_THRESHOLDS, type KpiClosedCycle, type KpiEvaluationInput } from './kpi-poly-types';

export { computeCapitalLockupFromTrades, type LockupMarketMeta } from './kpi-poly-capital-lockup';

const FIVE_MINUTE_CONTRACT_RE = /\b5[\s-]?(?:min|mins|minute|minutes|m)\b/i;

export function isExcludedFiveMinuteContract(question: string): boolean {
  return FIVE_MINUTE_CONTRACT_RE.test(question);
}

export function filterOutFiveMinContracts(snapshots: HistoricalSnapshot[]): HistoricalSnapshot[] {
  return snapshots
    .map((snap) => ({
      ...snap,
      markets: snap.markets.filter((m) => !isExcludedFiveMinuteContract(m.question)),
    }))
    .filter((snap) => snap.markets.length > 0);
}

export function filterOutFiveMinEvents(events: readonly GammaEvent[]): GammaEvent[] {
  return events
    .filter((e) => !isExcludedFiveMinuteContract(e.title))
    .map((e) => ({
      ...e,
      markets: e.markets.filter((m) => !isExcludedFiveMinuteContract(m.question)),
    }))
    .filter((e) => e.markets.length > 0);
}

export function estimateSimMakerFillRate(
  l2Steps: readonly ReplayedBookStep[],
  tradeRows: readonly DataApiV2TradeRow[],
): number | null {
  const bookSteps = l2Steps.filter((s) => s.bids.length > 0 && s.asks.length > 0);
  if (bookSteps.length === 0) return null;

  const rng = createSeededRandom(262);
  let arrivalPerMs = 0.05;
  if (tradeRows.length >= 2) {
    const sorted = [...tradeRows].sort((a, b) => a.t - b.t);
    const spanMs = Math.max(1_000, sorted[sorted.length - 1]!.t - sorted[0]!.t);
    const totalVol = sorted.reduce((acc, tr) => acc + tr.size, 0);
    arrivalPerMs = Math.max(0.005, totalVol / spanMs);
  }

  let validSteps = 0;
  let reachedCount = 0;
  for (const step of bookSteps) {
    const bids = parseLevels(step.bids).filter((lvl) => lvl.price > 0);
    if (bids.length === 0) continue;
    const bestBid = bids.reduce((max, lvl) => Math.max(max, lvl.price), -Infinity);
    validSteps += 1;
    const draw = buildQueueModel({ tier: 'standard', rng });
    const queue = estimateMakerQueue({
      levels: step.bids,
      limitPrice: bestBid,
      cancelVolumeFraction: draw.cancelVolumeFraction,
      cancelLatencyMs: draw.cancelLatencyMs,
    });
    const outcome = simulateMakerFill({ ourSize: 25, queue, aggressiveVolumePerMs: arrivalPerMs });
    if (outcome.filledSize > 0) reachedCount += 1;
  }
  return validSteps > 0 ? reachedCount / validSteps : null;
}

export function estimateClusterDeployableCapacity(
  l2Steps: readonly ReplayedBookStep[],
  tokenToCluster?: ReadonlyMap<string, string>,
): number | null {
  const latestByAsset = new Map<string, ReplayedBookStep>();
  for (const step of l2Steps) {
    if (step.bids.length > 0 && step.asks.length > 0) latestByAsset.set(step.assetId, step);
  }
  if (latestByAsset.size === 0) return null;

  const depthByCluster = new Map<string, number>();
  for (const step of latestByAsset.values()) {
    const bids = parseLevels(step.bids).filter((lvl) => lvl.price > 0);
    const asks = parseLevels(step.asks).filter((lvl) => lvl.price > 0);
    if (bids.length === 0 || asks.length === 0) continue;
    const bestBid = bids.reduce((max, lvl) => Math.max(max, lvl.price), -Infinity);
    const bestAsk = asks.reduce((min, lvl) => Math.min(min, lvl.price), Infinity);
    if (bestAsk < bestBid) continue;
    const mid = (bestBid + bestAsk) / 2;
    const halfSpread = Math.max(0.005, (bestAsk - bestBid) / 2);
    const maxImpact = halfSpread * (KPI_THRESHOLDS.MARGIN_DEGRADATION_LIMIT_PCT / 100);
    let bookDepthPusd = 0;
    for (const lvl of asks) {
      if (lvl.price - mid <= halfSpread + maxImpact) bookDepthPusd += lvl.price * lvl.size;
    }
    const clusterKey = tokenToCluster?.get(step.assetId) ?? step.assetId;
    depthByCluster.set(clusterKey, Math.max(depthByCluster.get(clusterKey) ?? 0, bookDepthPusd));
  }
  if (depthByCluster.size === 0) return null;
  return [...depthByCluster.values()].reduce((acc, v) => acc + v, 0) / depthByCluster.size;
}

export function computeStressMetrics(
  cycles: readonly KpiClosedCycle[],
  closedTrades: readonly BacktestTrade[],
): KpiEvaluationInput['stress'] {
  if (cycles.length === 0) {
    return { baselineNetPnlPusd: null, stressed15xNetPnlPusd: null, plusHalfCentSlippageNetPnlPusd: null };
  }
  const baseline = cycles.reduce((acc, c) => acc + c.netPnlPusd, 0);
  const extraHalfFeeSlippage = cycles.reduce(
    (acc, c) => acc + c.feeAndSlippagePusd * (KPI_THRESHOLDS.COST_LATENCY_STRESS_MULTIPLIER - 1),
    0,
  );
  const totalShares = closedTrades.reduce((acc, t) => acc + t.size * 2, 0);
  return {
    baselineNetPnlPusd: baseline,
    stressed15xNetPnlPusd: baseline - extraHalfFeeSlippage,
    plusHalfCentSlippageNetPnlPusd: baseline - totalShares * KPI_THRESHOLDS.SLIPPAGE_SHOCK_PRICE,
  };
}
