/** Paper Trading Orchestrator — end-to-end pipeline glue.
 * Phase 04: Qwen signals routed to paper_trades_v3 (source='qwen'), never to live. */

import { getVibeState } from './vibe-controller';
import { runSwarmConsensus } from '../intelligence/signal-consensus-swarm';
import { validateSignal } from '../intelligence/signal-validator';
import type { SignalCandidate } from '../intelligence/signal-validator';
import { recordPrediction } from '../intelligence/prediction-accuracy-tracker';
import { logger } from '../../shared/utils/logger';
import { isQwenEnabled } from './qwen-drawdown-monitor';
import { getPortfolio, saveTrades, savePaperTradeV3, POSITION_SIZE_PCT, MIN_AI_CONFIDENCE } from './paper-trading-persistence';
import { runPaperTradingLoop } from './paper-trading-orchestrator-runner';
import { tryReservePaperCapital } from './paper-capital-reservation';

// Re-export persistence functions for consumers
export { getPortfolio, saveTrades, loadTrades, savePaperTradeV3, __resetPortfolioForTests, resetPortfolio } from './paper-trading-persistence';
export { resetCapitalReservations } from './paper-capital-reservation';

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
  if (candidate.expectedEdge < minEdge) return;

  const reservation = tryReservePaperCapital({
    currentCapital: portfolio.capital,
    currentPositionsCount: portfolio.positions.length,
    maxPositions,
    maxExposure: vibe.maxExposure,
    positionSizePct: POSITION_SIZE_PCT,
  });
  if (!reservation) return;

  try {
    if (!isEndgame) {
      const swarm = await runSwarmConsensus(candidate);
      if (!swarm.approved) {
        logger.info('[PaperOrchestrator] Swarm REJECT', { type: candidate.signalType });
        reservation.release();
        return;
      }

      const validation = await validateSignal(candidate);
      if (!validation.valid || validation.confidence < MIN_AI_CONFIDENCE) {
        logger.info('[PaperOrchestrator] AI REJECT', { type: candidate.signalType, conf: validation.confidence });
        reservation.release();
        return;
      }
    } else {
      logger.info('[PaperOrchestrator] Endgame — skip AI (mathematical)', { edge: candidate.expectedEdge });
    }

    const market = candidate.markets[0];
    if (!market) {
      reservation.release();
      return;
    }

    const size = Math.min(reservation.size, vibe.maxExposure);
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
    reservation.commit();
    saveTrades();

    // Persist to source-tagged paper_trades_v3 for Qwen A/B P&L tracking
    void savePaperTradeV3(trade);

    recordPrediction({
      id: trade.id, marketId: trade.marketId, title: market.title,
      predictedOutcome: trade.side, confidence: trade.signalConfidence,
      predictedAt: Date.now(), marketYesPrice: market.yesPrice,
      strategy: candidate.signalType, actualOutcome: null, resolvedAt: null, correct: null,
    });

    logger.info('[PaperOrchestrator] Trade OPEN', { id: trade.id, side: trade.side, size, entryPrice: trade.entryPrice });
  } catch (err) {
    reservation.release();
    throw err;
  }
}

/** Ingest a MARL market maker fill into the paper portfolio. */
export function recordMarlPaperFill(
  marketId: string,
  side: 'buy' | 'sell',
  amount: number,
  price: number,
  strategy = 'marl-avellaneda-stoikov'
): PaperTrade {
  const portfolio = getPortfolio();
  const notional = amount * price;
  const paperSide: 'YES' | 'NO' = side === 'buy' ? 'YES' : 'NO';
  const trade: PaperTrade = {
    id: `marl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    marketId,
    side: paperSide,
    size: notional,
    entryPrice: price,
    strategy,
    source: deriveSource(strategy),
    signalConfidence: 0.95,
    swarmApproved: true,
    aiValidated: true,
    timestamp: Date.now(),
  };

  portfolio.capital -= notional;
  portfolio.positions.push(trade);
  saveTrades();
  void savePaperTradeV3(trade);
  logger.info('[PaperOrchestrator] MARL Maker Fill recorded', {
    id: trade.id, marketId, side: trade.side, size: notional, price,
  });
  return trade;
}

// ─── Position settlement — delegated to paper-trading-persistence ─────────────

export { settleStalePositions as checkPositions } from './paper-trading-persistence';

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function startPaperTrading(config?: {
  capitalUsdc?: number;
  intervalMs?: number;
  maxPositions?: number;
}): Promise<void> {
  return runPaperTradingLoop(processCandidate, config);
}
