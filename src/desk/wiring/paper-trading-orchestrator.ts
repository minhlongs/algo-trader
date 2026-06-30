/** Paper Trading Orchestrator — end-to-end pipeline glue.
 * market data → NATS → swarm consensus → AI validation → paper order → P&L → reflection
 * No real CLOB orders. Trades logged to data/paper-trades.json + NATS system.metrics.
 * Phase 04: Qwen signals routed to paper_trades_v3 (source='qwen'), never to live. */

import { createMessageBus, getMessageBus } from '../../shared/messaging/create-message-bus';
import { Topics } from '../../shared/messaging/topic-schema';
import { startNatsEventLoop } from './nats-event-loop';
import { initVibeController, getVibeState } from './vibe-controller';
import { runSwarmConsensus } from '../intelligence/signal-consensus-swarm';
import { validateSignal } from '../intelligence/signal-validator';
import type { SignalCandidate } from '../intelligence/signal-validator';
import { recordPrediction, startResolutionChecker } from '../intelligence/prediction-accuracy-tracker';
import { logger } from '../../shared/utils/logger';
import { isQwenEnabled } from './qwen-drawdown-monitor';
import { scanAndTrade as scanMarkets } from './paper-trading-market-scanner';
import {
  getPortfolio,
  saveTrades,
  loadTrades,
  savePaperTradeV3,
  settleStalePositions,
  __resetPortfolioForTests,
  resetPortfolio,
  POSITION_SIZE_PCT,
  MIN_AI_CONFIDENCE,
} from './paper-trading-persistence';

// Re-export persistence functions for consumers
export { saveTrades, loadTrades, savePaperTradeV3, __resetPortfolioForTests, resetPortfolio } from './paper-trading-persistence';

// ─── Types ───────────────────────────────────────────────────────────────────
export interface PaperTrade {
  id: string;
  marketId: string;
  side: 'YES' | 'NO';
  size: number; // USDC
  entryPrice: number;
  strategy: string;
  /** Source tag for A/B P&L ledger: 'qwen' | 'deepseek' | 'swarm' | 'legacy' */
  source: string;
  signalConfidence: number;
  swarmApproved: boolean;
  aiValidated: boolean;
  timestamp: number;
}

/** Derive source tag from strategy name prefix */
export function deriveSource(strategy: string): string {
  if (strategy.startsWith('qwen')) return 'qwen';
  if (strategy.startsWith('deepseek')) return 'deepseek';
  if (strategy.startsWith('swarm')) return 'swarm';
  return 'legacy';
}

export interface PaperPortfolio {
  capital: number;
  positions: PaperTrade[];
  closedTrades: Array<PaperTrade & { exitPrice: number; pnl: number }>;
  totalPnl: number;
  winCount: number;
  lossCount: number;
}

// ─── Signal processing ────────────────────────────────────────────────────────

export async function processCandidate(candidate: SignalCandidate, maxPositions: number): Promise<void> {
  const vibe = getVibeState();
  const portfolio = getPortfolio();

  // L1+L2: check Qwen kill switch and swarm-enabled flag before processing
  const source = deriveSource(candidate.signalType ?? '');
  if (source === 'qwen' && !isQwenEnabled()) {
    logger.info('[PaperOrchestrator] Qwen signal BLOCKED — kill switch or drawdown disable', {
      signalType: candidate.signalType,
    });
    return;
  }

  // Endgame signals are mathematical — use lower threshold (0.5% min)
  const isEndgame = candidate.reasoning.includes('Endgame') || candidate.reasoning.includes('near-certain');
  const minEdge = isEndgame ? 0.005 : Math.max(0.01, vibe.minEdge / 100);
  if (portfolio.positions.length >= maxPositions || candidate.expectedEdge < minEdge || portfolio.capital <= 0) return;
  if (!isEndgame) {
    // Non-endgame: run swarm consensus + AI validation
    const swarm = await runSwarmConsensus(candidate);
    if (!swarm.approved) { logger.info('[PaperOrchestrator] Swarm REJECT', { type: candidate.signalType }); return; }

    const validation = await validateSignal(candidate);
    if (!validation.valid || validation.confidence < MIN_AI_CONFIDENCE) {
      logger.info('[PaperOrchestrator] AI REJECT', { type: candidate.signalType, conf: validation.confidence });
      return;
    }
  } else {
    logger.info('[PaperOrchestrator] Endgame — skip AI (mathematical)', { edge: candidate.expectedEdge });
  }

  const market = candidate.markets[0];
  if (!market) return;

  const size = Math.min(portfolio.capital * POSITION_SIZE_PCT, vibe.maxExposure);
  const side: 'YES' | 'NO' = isEndgame
    ? (market.yesPrice < 0.5 ? 'NO' : 'YES')
    : (market.yesPrice < 0.5 ? 'YES' : 'NO');
  const entryPrice = side === 'YES' ? market.yesPrice : market.noPrice;
  const trade: PaperTrade = {
    id: `paper-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    marketId: market.id,
    side,
    size,
    entryPrice,
    strategy: candidate.signalType,
    source,
    signalConfidence: isEndgame ? candidate.expectedEdge : 0.8,
    swarmApproved: !isEndgame,
    aiValidated: !isEndgame,
    timestamp: Date.now(),
  };

  portfolio.capital -= size;
  portfolio.positions.push(trade);
  saveTrades();

  // Persist to source-tagged paper_trades_v3 for Qwen A/B P&L tracking
  void savePaperTradeV3(trade);

  // Record prediction for accuracy tracking (no money needed)
  recordPrediction({
    id: trade.id,
    marketId: trade.marketId,
    title: market.title,
    predictedOutcome: trade.side,
    confidence: trade.signalConfidence,
    predictedAt: Date.now(),
    marketYesPrice: market.yesPrice,
    strategy: candidate.signalType,
    actualOutcome: null,
    resolvedAt: null,
    correct: null,
  });

  logger.info('[PaperOrchestrator] Trade OPEN', { id: trade.id, side: trade.side, size, entryPrice: trade.entryPrice });
}

// ─── Position settlement — delegated to paper-trading-persistence ─────────────

export { settleStalePositions as checkPositions } from './paper-trading-persistence';

// ─── Metrics ──────────────────────────────────────────────────────────────────

async function publishMetrics(): Promise<void> {
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

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function startPaperTrading(config?: {
  capitalUsdc?: number;
  intervalMs?: number;
  maxPositions?: number;
}): Promise<void> {
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
    await processCandidate(candidate, maxPositions);
  });

  // Self-contained multi-strategy scan: Gamma API → detect edges → process
  const ticker = setInterval(async () => {
    await scanMarkets(processCandidate, maxPositions);
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
