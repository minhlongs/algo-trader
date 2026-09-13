/** Paper Trading Orchestrator Runner — loop, NATS, timer and metrics. */

import { createMessageBus, getMessageBus } from '../../shared/messaging/create-message-bus';
import { Topics } from '../../shared/messaging/topic-schema';
import { startNatsEventLoop } from './nats-event-loop';
import { initVibeController } from './vibe-controller';
import type { SignalCandidate } from '../intelligence/signal-validator';
import { startResolutionChecker } from '../intelligence/prediction-accuracy-tracker';
import { logger } from '../../shared/utils/logger';
import { scanAndTrade as scanMarkets } from './paper-trading-market-scanner';
import {
  getPortfolio,
  saveTrades,
  loadTrades,
  settleStalePositions,
} from './paper-trading-persistence';

export async function publishMetrics(): Promise<void> {
  try {
    const bus = getMessageBus();
    if (!bus.isConnected()) return;
    const portfolio = getPortfolio();
    await bus.publish(Topics.SYSTEM_METRICS, {
      source: 'paper-trading-orchestrator',
      capital: portfolio.capital,
      openPositions: portfolio.positions.length,
      totalPnl: portfolio.totalPnl,
      winCount: portfolio.winCount,
      lossCount: portfolio.lossCount,
      timestamp: Date.now(),
    }, 'paper-trading-orchestrator');
  } catch { /* non-critical */ }
}

export async function runPaperTradingLoop(
  candidateProcessor: (candidate: SignalCandidate, maxPositions: number) => Promise<void>,
  config?: {
    capitalUsdc?: number;
    intervalMs?: number;
    maxPositions?: number;
  },
): Promise<void> {
  const intervalMs = config?.intervalMs ?? 30_000;
  const maxPositions = config?.maxPositions ?? 5;
  if (config?.capitalUsdc) {
    const p = getPortfolio();
    p.capital = config.capitalUsdc;
  }

  logger.info('[PaperOrchestrator] Starting', { capital: getPortfolio().capital, intervalMs, maxPositions });

  loadTrades();
  await initVibeController();
  const loop = await startNatsEventLoop();
  const bus = await createMessageBus();

  // Consume validated signals from augmented pipeline
  type ValidatedEnvelope = { original: Record<string, unknown> };
  await bus.subscribe<ValidatedEnvelope>('signal.validated', async (envelope) => {
    const raw = envelope.data.original;
    const candidate: SignalCandidate = {
      signalType: (raw['signalType'] as SignalCandidate['signalType']) ?? 'simple-arb',
      markets: (raw['markets'] as SignalCandidate['markets']) ?? [],
      expectedEdge: (raw['expectedEdge'] as number) ?? 0,
      reasoning: (raw['reasoning'] as string) ?? '',
    };
    await candidateProcessor(candidate, maxPositions);
  });

  // Self-contained multi-strategy scan: Gamma API → detect edges → process
  const ticker = setInterval(async () => {
    await scanMarkets(candidateProcessor, maxPositions);
    await settleStalePositions().catch(err => logger.error('[PaperOrchestrator] Check error', { err }));
    await publishMetrics();
  }, intervalMs);

  const shutdown = async () => {
    clearInterval(ticker);
    await loop.stop();
    saveTrades();
    const p = getPortfolio();
    logger.info('[PaperOrchestrator] Shutdown', { totalPnl: p.totalPnl, closed: p.closedTrades.length });
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  // Start prediction accuracy checker (polls resolved markets every 5 min)
  startResolutionChecker();

  logger.info('[PaperOrchestrator] Active', { subscribing: 'signal.validated', intervalMs, predictionTracking: true });
}
