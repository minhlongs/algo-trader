/**
 * Observed paper-mode replay for `npm run kpi:poly`.
 *
 * Drives the 3 Quant Alpha strategies directly against replayed `recorded-l2`
 * order books and live Gamma markets/events — never calling `backtest-mock-factory`
 * or synthesising synthetic spreads around mid-prices.
 */

import type { BacktestTrade, HistoricalSnapshot } from '../backtesting/types';
import { BacktestOrderManager } from '../backtesting/backtest-order-manager';
import type { EventBus } from '../events/event-bus';
import type { RawOrderBook } from '../polymarket/clob-client';
import type { FeeScheduleResolver } from '../polymarket/fee-schedule-resolver';
import type { GammaEvent } from '../polymarket/gamma-client';
import type { ReplayedBookStep } from '../polymarket/l2/l2-replay';
import { evaluatePolyRisk } from '../risk/poly-fail-closed-risk-engine';
import { ToxicityAwareMarketMakerStrategy } from '../strategies/polymarket/quant-alpha/toxicity-aware-market-maker';
import { NegRiskBundleArbitrageStrategy } from '../strategies/polymarket/quant-alpha/negrisk-bundle-arbitrage';
import { PrimarySourceNewsLatencyStrategy } from '../strategies/polymarket/quant-alpha/primary-source-news-latency';
import {
  buildCyclesFromClosedTrades,
  buildObservedClobClient,
  buildObservedGammaClient,
  buildRealMakerMarkouts,
  snapshotMarketsToGamma,
  twoSidedMid,
} from './kpi-poly-observed-replay-helpers';
import type { KpiClosedCycle, KpiMakerMarkoutSample } from './kpi-poly-types';

export interface ObservedReplayOutput {
  allTrades: BacktestTrade[];
  closedTrades: BacktestTrade[];
  closedCycles: KpiClosedCycle[];
  equityCurve: Array<{ timestamp: string; equity: number }>;
  basketAttempts: number;
  completeBaskets: number;
  markouts: KpiMakerMarkoutSample[];
}

export async function runObservedQuantAlphaReplay(params: {
  snapshots: readonly HistoricalSnapshot[];
  l2Steps: readonly ReplayedBookStep[];
  liveEvents: readonly GammaEvent[];
  feeResolver: FeeScheduleResolver;
  capitalUsdc: number;
  tokenToCluster: ReadonlyMap<string, string>;
}): Promise<ObservedReplayOutput> {
  const realDateNow = Date.now.bind(Date);
  const perCap = params.capitalUsdc / 3;
  let nowMs = params.l2Steps[0]?.t ?? realDateNow();
  const bookByAsset = new Map<string, RawOrderBook>();
  const markPrices = new Map<string, number>();
  const latestMarkets = snapshotMarketsToGamma(params.snapshots[params.snapshots.length - 1]);
  const sampleToken = latestMarkets[0]?.yesTokenId || 'kpi-preflight-token';
  const lastObs = params.l2Steps.length > 0 ? params.l2Steps[params.l2Steps.length - 1]!.t : 'unknown';
  evaluatePolyRisk(
    { tokenId: sampleToken, side: 'buy', price: 0.5, size: 10, orderType: 'GTC' },
    {
      nowMs: typeof lastObs === 'number' ? lastObs : realDateNow(),
      killSwitch: 'inactive',
      marketData: { observedAtMs: lastObs },
      feeSchedule: { tokenId: sampleToken, rate: 0.04, exponent: 1 },
      positionReconciliation: { reconciled: true, reconciledAtMs: realDateNow(), openPositionCount: 0 },
      riskBudget: { maxNotionalUsd: params.capitalUsdc * 0.25, currentDrawdownPct: 0 },
    },
  );

  const clob = buildObservedClobClient(bookByAsset, () => nowMs);
  const gamma = buildObservedGammaClient(latestMarkets, params.liveEvents);
  const eventBus: EventBus = { emit: () => {}, on: () => {}, off: () => {} };

  const oms = [
    new BacktestOrderManager(perCap, { feeResolver: params.feeResolver }),
    new BacktestOrderManager(perCap, { feeResolver: params.feeResolver }),
    new BacktestOrderManager(perCap, { feeResolver: params.feeResolver }),
  ] as const;
  const mm = new ToxicityAwareMarketMakerStrategy(
    { clob, gamma, eventBus, orderManager: oms[0], feeResolver: params.feeResolver },
    { cooldownMs: 0 },
  );
  const nr = new NegRiskBundleArbitrageStrategy(
    { clob, gamma, eventBus, orderManager: oms[1], feeResolver: params.feeResolver },
    { legNotionalPusd: Math.min(500, perCap * 0.15), minCapitalPerEventPusd: Math.min(5_000, perCap * 0.4), cooldownMs: 0 },
  );
  const nl = new PrimarySourceNewsLatencyStrategy(
    { clob, gamma, eventBus, orderManager: oms[2], feeResolver: params.feeResolver, clock: () => nowMs },
  );

  const equityCurve: Array<{ timestamp: string; equity: number }> = [];
  if (params.l2Steps.length > 0) {
    const stride = Math.max(1, Math.floor(params.l2Steps.length / 8));
    try {
      Date.now = () => nowMs;
      for (let i = 0; i < params.l2Steps.length; i++) {
        const step = params.l2Steps[i]!;
        nowMs = step.t;
        const rawBook: RawOrderBook = { bids: [...step.bids], asks: [...step.asks], timestamp: step.t };
        bookByAsset.set(step.assetId, rawBook);
        const mid = twoSidedMid(rawBook);
        if (mid !== null) markPrices.set(step.assetId, mid);
        if ((i + 1) % stride === 0 || i === params.l2Steps.length - 1) {
          const stepIso = new Date(step.t).toISOString();
          for (const om of oms) {
            om.setCurrentTimestamp(stepIso);
            om.updatePrices(markPrices);
          }
          await mm.execute();
          await nr.execute();
          await nl.execute();
          equityCurve.push({
            timestamp: stepIso,
            equity: oms[0].getCurrentEquity() + oms[1].getCurrentEquity() + oms[2].getCurrentEquity(),
          });
        }
      }
    } finally {
      Date.now = realDateNow;
    }
  }
  if (equityCurve.length === 0) {
    equityCurve.push(...params.snapshots.map((s) => ({ timestamp: s.timestamp, equity: params.capitalUsdc })));
  }

  const allTrades = oms.flatMap((om) => om.getTrades());
  const closedTrades = allTrades.filter((t) => t.pnl !== null);
  const basket = nr.getBasketTelemetry();
  const markouts = await buildRealMakerMarkouts(
    mm.getMarkoutTelemetry(nowMs).fills,
    params.l2Steps,
    params.feeResolver,
  );

  return {
    allTrades,
    closedTrades,
    closedCycles: buildCyclesFromClosedTrades(closedTrades, params.tokenToCluster),
    equityCurve,
    basketAttempts: basket.attempts,
    completeBaskets: basket.complete,
    markouts,
  };
}
