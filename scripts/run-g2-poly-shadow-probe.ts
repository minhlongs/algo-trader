/**
 * G2-Poly-Shadow Paper Runtime Probe (`LIVE_TRADING_ENABLED=false`)
 *
 * Fetches read-only live Polymarket Gamma markets + CLOB orderbooks (with deterministic
 * fallback when offline), wires StrategyRunner + PolymarketArbStrategy + LiveTradingOrchestrator
 * + PolymarketOrderReconciler in PAPER mode, executes shadow ticks, and persists T0_G2 state
 * to ~/.cashclaw/live-reconciler-state.json and ~/.cashclaw/g2-poly-shadow-telemetry.jsonl.
 */

import { StrategyRunner, GammaClientImpl } from '../src/desk/polymarket/strategy-runner';
import { LiveTradingOrchestrator } from '../src/desk/polymarket/live-trading-orchestrator';
import { PolymarketArbStrategy, DEFAULT_CONFIG as ARB_DEFAULT_CONFIG } from '../src/desk/strategies/polymarket-arb-strategy';
import { clobClient, type ClobClientInterface, type RawOrderBook } from '../src/desk/polymarket/clob-client';
import type { GammaClient, GammaMarket } from '../src/desk/polymarket/gamma-client';
import {
  RECONCILER_STATE_FILE,
  G2_TELEMETRY_FILE,
  appendG2ShadowTelemetry,
  saveReconcilerState,
} from '../src/desk/polymarket/g2-shadow-telemetry';
import { tradingEventBus } from '../src/desk/events/trading-event-bus';
import { logger } from '../src/shared/utils/logger';

process.env['LIVE_TRADING_ENABLED'] = 'false';

function buildFallbackBook(yesSide: boolean): RawOrderBook {
  const askPrice = yesSide ? '0.4700' : '0.4900';
  const bidPrice = yesSide ? '0.4600' : '0.4800';
  return {
    bids: [
      { price: bidPrice, size: '500' },
      { price: (Number(bidPrice) - 0.01).toFixed(4), size: '800' },
    ],
    asks: [
      { price: askPrice, size: '500' },
      { price: (Number(askPrice) + 0.01).toFixed(4), size: '800' },
    ],
    timestamp: Date.now(),
  };
}

export async function runG2PolyShadowProbe(): Promise<{
  startedAtMs: number;
  liveMarketsFetched: number;
  liveOrderBooksFetched: number;
  unexplainedDriftUsdc: number;
  haltedMarkets: number;
  reconcilerStateFile: string;
  telemetryFile: string;
}> {
  process.env['LIVE_TRADING_ENABLED'] = 'false';

  const realGamma = new GammaClientImpl();
  let liveMarkets: GammaMarket[] = [];
  try {
    const fetched = await realGamma.getTrending(5);
    liveMarkets = fetched.filter((m) => Boolean(m.yesTokenId && m.noTokenId && !m.closed));
  } catch (err) {
    logger.warn('Live Gamma fetch failed; using fallback shadow market', 'G2Probe', { err: String(err) });
  }

  let liveOrderBooksFetched = 0;
  const bookCache = new Map<string, RawOrderBook>();

  for (const m of liveMarkets.slice(0, 3)) {
    if (!m.yesTokenId || !m.noTokenId) continue;
    try {
      const [yesBook, noBook] = await Promise.all([
        clobClient.getOrderBook(m.yesTokenId),
        clobClient.getOrderBook(m.noTokenId),
      ]);
      if (yesBook.asks.length > 0 || yesBook.bids.length > 0) {
        bookCache.set(m.yesTokenId, yesBook);
        liveOrderBooksFetched++;
      }
      if (noBook.asks.length > 0 || noBook.bids.length > 0) {
        bookCache.set(m.noTokenId, noBook);
        liveOrderBooksFetched++;
      }
    } catch {
      // continue to next market
    }
  }

  const shadowArbMarket: GammaMarket = {
    id: 'g2-shadow-arb-1',
    conditionId: '0xg2shadowarb0001',
    question: 'G2 Shadow Two-Leg Arb Calibration Market',
    slug: 'g2-shadow-arb-calibration',
    outcomes: ['Yes', 'No'],
    outcomePrices: ['0.47', '0.49'],
    active: true,
    closed: false,
    volume: 50_000,
    liquidity: 25_000,
    endDate: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    tokens: [
      { token_id: 'g2-yes-token-1', outcome: 'Yes', price: 0.47 },
      { token_id: 'g2-no-token-1', outcome: 'No', price: 0.49 },
    ],
    yesTokenId: 'g2-yes-token-1',
    noTokenId: 'g2-no-token-1',
    yesPrice: 0.47,
  };
  bookCache.set(shadowArbMarket.yesTokenId!, buildFallbackBook(true));
  bookCache.set(shadowArbMarket.noTokenId!, buildFallbackBook(false));

  const combinedMarkets = [...liveMarkets.slice(0, 3), shadowArbMarket];

  const probeGamma: GammaClient = {
    getTrending: async () => combinedMarkets,
    getMarkets: async () => combinedMarkets,
    getMarket: async (cid) => combinedMarkets.find((m) => m.conditionId === cid) ?? null,
    getMarketGroup: async () => null,
    searchMarkets: async () => combinedMarkets,
    getEvents: async () => [{ id: 'g2-evt-1', title: 'G2 Shadow Event', slug: 'g2-evt', markets: combinedMarkets }],
  };

  const probeClob: ClobClientInterface = {
    getOrderBook: async (tokenId: string): Promise<RawOrderBook> =>
      bookCache.get(tokenId) ?? buildFallbackBook(!tokenId.endsWith('-no')),
    getPrice: async (tokenId: string): Promise<number> => {
      const book = await probeClob.getOrderBook(tokenId);
      return Number(book.asks[0]?.price ?? 0.5);
    },
    getMidPrice: async (tokenId: string): Promise<number> => {
      const book = await probeClob.getOrderBook(tokenId);
      return (Number(book.bids[0]?.price ?? 0.48) + Number(book.asks[0]?.price ?? 0.52)) / 2;
    },
  };

  const orchestrator = new LiveTradingOrchestrator({
    paperTrading: true,
    allowCohortContinuation: true,
    capitalUsdc: 1000,
    maxPositionFraction: 0.10,
    maxDailyDrawdown: 0.05,
    maxConsecutiveLosses: 5,
  });

  const runner = new StrategyRunner(
    PolymarketArbStrategy,
    {
      strategyConfig: { ...ARB_DEFAULT_CONFIG, spreadLookback: 1, minSpread: 0.01, positionSize: '10' },
      tradingConfig: { paperTrading: true, allowCohortContinuation: true, capitalUsdc: 1000 },
      minExecutionIntervalMs: 1,
      deps: { gamma: probeGamma, clob: probeClob },
    },
    orchestrator,
  );

  await runner.start();
  runner.trackToken('g2-yes-token-1');
  tradingEventBus.emitPriceUpdate({ tokenId: 'g2-yes-token-1', bid: 0.46, ask: 0.47, timestamp: Date.now() });
  await new Promise((resolve) => setTimeout(resolve, 50));

  const startedAtMs = orchestrator.getStartedAtMs();
  const posSummary = runner.getPositionSummary();
  const recSummary = runner.getReconciliationSummary();
  const leg2DecayStats = orchestrator.getLeg2DecayStats();

  saveReconcilerState(orchestrator.getReconciler(), startedAtMs, leg2DecayStats);
  appendG2ShadowTelemetry({
    loopStartedAtMs: startedAtMs,
    mode: 'PAPER',
    event: 'tick',
    positionSummary: posSummary,
    reconciliationSummary: recSummary,
    leg2DecayStats,
  });

  await runner.stop();
  await orchestrator.stop();

  logger.info('G2-Poly-Shadow probe completed', 'G2Probe', {
    startedAtMs,
    liveMarketsFetched: liveMarkets.length,
    liveOrderBooksFetched,
    unexplainedDriftUsdc: recSummary.unexplainedDriftUsdc,
    unknownOrderCount: recSummary.unknownOrderCount,
  });

  return {
    startedAtMs,
    liveMarketsFetched: liveMarkets.length,
    liveOrderBooksFetched,
    unexplainedDriftUsdc: recSummary.unexplainedDriftUsdc,
    haltedMarkets: recSummary.unknownOrderCount,
    reconcilerStateFile: RECONCILER_STATE_FILE,
    telemetryFile: G2_TELEMETRY_FILE,
  };
}

if (require.main === module) {
  runG2PolyShadowProbe().catch((err) => {
    logger.error('G2-Poly-Shadow probe failed', 'G2Probe', { err: String(err) });
    process.exit(1);
  });
}
