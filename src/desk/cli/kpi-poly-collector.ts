/**
 * Observed-data collector for `npm run kpi:poly`.
 *
 * Collects ONLY real Polymarket data carrying `recorded-l2`, `data-api-v2`, or
 * `prices-history` provenance labels, runs the 3 Quant Alpha paper strategies
 * directly against replayed `recorded-l2` order books with `GammaFeeScheduleResolver`,
 * and builds `KpiEvaluationInput`. Never calls `simulateMarketRegimeTick`,
 * never calls `backtest-mock-factory`, and never sends an order to the exchange.
 */

import { join } from 'node:path';
import { GammaHistoricalProvider } from '../backtesting/gamma-historical-provider';
import type { HistoricalSnapshot } from '../backtesting/types';
import { createGammaFeeScheduleResolver } from '../polymarket/fee-schedule-resolver';
import { createPolymarketDataApiClient, type PolymarketDataApiClient } from '../polymarket/polymarket-data-api-client';
import type { DataApiV2TradeRow, PricesHistoryRow } from '../polymarket/l2/l2-source-labels';
import { GammaClientImpl } from '../polymarket/strategy-runner-types';
import {
  computeCapitalLockupFromTrades, computeStressMetrics, estimateClusterDeployableCapacity,
  estimateSimMakerFillRate, filterOutFiveMinContracts, filterOutFiveMinEvents,
} from './kpi-poly-book-metrics';
import { captureOrLoadL2Steps, loadAllReplayedL2Steps } from './kpi-poly-l2-capture';
import { runObservedQuantAlphaReplay } from './kpi-poly-observed-replay';
import type { KpiEvaluationInput } from './kpi-poly-types';

const QUANT_ALPHA_TRIALS = 3;
const YEAR_MS = 365 * 86_400_000;

export function inferPeriodsPerYear(
  equityCurve: ReadonlyArray<{ timestamp: string }>,
): number {
  const deltas: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = Date.parse(equityCurve[i - 1]!.timestamp);
    const curr = Date.parse(equityCurve[i]!.timestamp);
    if (Number.isFinite(prev) && Number.isFinite(curr) && curr > prev) {
      deltas.push(curr - prev);
    }
  }
  if (deltas.length === 0) return 24 * 365;
  deltas.sort((a, b) => a - b);
  const medianMs = deltas[Math.floor(deltas.length / 2)]!;
  return Math.max(1, Math.round(YEAR_MS / medianMs));
}

export interface CollectKpiInputOptions {
  days?: number;
  capitalUsdc?: number;
  l2Dir?: string;
  /** Capture window (ms) when `--record-ms` passed or no JSONL exists yet. */
  recordMs?: number;
  maxMarkets?: number;
}

async function fetchRetroactiveRows(
  dataClient: PolymarketDataApiClient,
  snapshots: readonly HistoricalSnapshot[],
): Promise<{ priceRows: PricesHistoryRow[]; tradeRows: DataApiV2TradeRow[]; tokenIds: string[] }> {
  const markets = snapshots[snapshots.length - 1]?.markets ?? [];
  const tokenIds = markets
    .flatMap((m) => [m.yesTokenId, m.noTokenId])
    .filter((id): id is string => Boolean(id));
  const topMarkets = markets.slice(0, 6);

  const [priceBatches, tradeBatches] = await Promise.all([
    Promise.all(
      topMarkets.map(async (m) =>
        m.yesTokenId
          ? dataClient.fetchPricesHistory({ tokenId: m.yesTokenId, interval: '1w', fidelity: 60 }).catch(() => [])
          : [],
      ),
    ),
    Promise.all(
      topMarkets.map(async (m) =>
        dataClient
          .fetchTrades({ conditionId: m.conditionId, limit: 40 })
          .then((r) => r.trades)
          .catch(() => []),
      ),
    ),
  ]);

  return { priceRows: priceBatches.flat(), tradeRows: tradeBatches.flat(), tokenIds };
}

export async function collectPolymarketKpiInput(
  options: CollectKpiInputOptions = {},
): Promise<KpiEvaluationInput> {
  const days = options.days ?? 14;
  const capitalUsdc = options.capitalUsdc ?? 10_000;
  const l2Dir = options.l2Dir ?? join(process.cwd(), 'data', 'polymarket-l2');
  const maxMarkets = options.maxMarkets ?? 10;

  const dataClient = createPolymarketDataApiClient();
  const feeResolver = createGammaFeeScheduleResolver();
  const provider = new GammaHistoricalProvider({ dataApiClient: dataClient, maxMarkets });
  const gammaClient = new GammaClientImpl();

  const [rawSnapshots, rawEvents] = await Promise.all([
    provider.fetchHistoricalSnapshots(days, 3_600_000),
    gammaClient.getEvents(20).catch(() => []),
  ]);
  const snapshots = filterOutFiveMinContracts(rawSnapshots);
  const liveEvents = filterOutFiveMinEvents(rawEvents);
  const eventMarkets = liveEvents.flatMap((ev) => ev.markets);

  const { priceRows, tradeRows, tokenIds } = await fetchRetroactiveRows(dataClient, snapshots);
  const eventTokenIds = eventMarkets
    .flatMap((m) => [m.yesTokenId, m.noTokenId])
    .filter((id): id is string => Boolean(id));
  const captureAssetIds = [...new Set([...tokenIds.slice(0, 12), ...eventTokenIds.slice(0, 12)])];

  const existingSteps = await loadAllReplayedL2Steps(l2Dir);
  const captureDurationMs =
    options.recordMs !== undefined ? options.recordMs : existingSteps.length === 0 ? 8_000 : 0;
  const l2Steps =
    captureDurationMs > 0
      ? await captureOrLoadL2Steps({ l2Dir, assetIds: captureAssetIds, captureDurationMs })
      : existingSteps;

  const tokenToCluster = new Map<string, string>();
  for (const m of snapshots[snapshots.length - 1]?.markets ?? []) {
    if (m.yesTokenId) tokenToCluster.set(m.yesTokenId, m.conditionId);
    if (m.noTokenId) tokenToCluster.set(m.noTokenId, m.conditionId);
  }
  for (const ev of liveEvents) {
    for (const m of ev.markets) {
      const clusterId = ev.id || m.conditionId;
      if (m.yesTokenId) tokenToCluster.set(m.yesTokenId, clusterId);
      if (m.noTokenId) tokenToCluster.set(m.noTokenId, clusterId);
    }
  }

  const replay = await runObservedQuantAlphaReplay({
    snapshots, l2Steps, liveEvents, feeResolver, capitalUsdc, tokenToCluster,
  });

  const firstSnapMs = Date.parse(snapshots[0]?.timestamp ?? '');
  const lastSnapMs = Date.parse(snapshots[snapshots.length - 1]?.timestamp ?? '');
  const observationSpanDays =
    Number.isFinite(firstSnapMs) && Number.isFinite(lastSnapMs)
      ? Math.max(0, (lastSnapMs - firstSnapMs) / 86_400_000)
      : 0;
  const paperShadowDays =
    l2Steps.length >= 2
      ? Math.max(0, (l2Steps[l2Steps.length - 1]!.t - l2Steps[0]!.t) / 86_400_000)
      : 0;

  const clusterLosses = new Map<string, number>();
  for (const c of replay.closedCycles) {
    clusterLosses.set(c.eventClusterId, (clusterLosses.get(c.eventClusterId) ?? 0) + c.netPnlPusd);
  }
  const eventClusterLossPctNav = [...clusterLosses.values()].map((pnl) =>
    pnl < 0 ? (Math.abs(pnl) / capitalUsdc) * 100 : 0,
  );
  const refMs = l2Steps.length > 0 ? l2Steps[l2Steps.length - 1]!.t : Date.now();

  return {
    provenance: { snapshots, priceRows, tradeRows, l2Steps },
    performance: {
      initialNavPusd: capitalUsdc,
      equityCurve: replay.equityCurve,
      closedCycles: replay.closedCycles,
      relayerAndApiCostPusd: 0,
      lockedCapitalAvgPusd:
        replay.closedCycles.reduce((s, c) => s + c.notionalPusd, 0) / Math.max(1, snapshots.length),
      observationSpanDays,
      paperShadowDays,
      mode: 'sim-90d',
      strategyClass: 'market-making',
      nTrials: QUANT_ALPHA_TRIALS,
      periodsPerYear: inferPeriodsPerYear(replay.equityCurve),
    },
    execution: {
      simMakerFillRate: estimateSimMakerFillRate(l2Steps, tradeRows),
      liveMakerFillRate: null,
      basketAttempts: replay.basketAttempts,
      completeBaskets: replay.completeBaskets,
      postOnlySubmitted: 0,
      postOnlyRejected: 0,
    },
    adverseSelection: { markouts: replay.markouts },
    calibration: { forecasts: [] },
    capital: computeCapitalLockupFromTrades(snapshots, replay.allTrades, refMs, eventMarkets),
    stress: computeStressMetrics(replay.closedCycles, replay.closedTrades),
    capacity: { deployableCapacityPusd: estimateClusterDeployableCapacity(l2Steps, tokenToCluster) },
    tailAndSettlement: {
      eventClusterLossPctNav,
      undetectedGhostFills: null,
      maxUnexplainedTokenDiscrepancy: null,
      onChainReconciled: false,
    },
  };
}
