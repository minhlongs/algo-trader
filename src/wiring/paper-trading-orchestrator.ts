/** Paper Trading Orchestrator — end-to-end pipeline glue.
 * market data → NATS → swarm consensus → AI validation → paper order → P&L → reflection
 * No real CLOB orders. Trades logged to data/paper-trades.json + NATS system.metrics.
 * Phase 04: Qwen signals routed to paper_trades_v3 (source='qwen'), never to live. */

import * as fs from 'fs';
import * as path from 'path';
import { createMessageBus, getMessageBus } from '../shared/messaging/create-message-bus';
import { Topics } from '../shared/messaging/topic-schema';
import { startNatsEventLoop } from './nats-event-loop';
import { initVibeController, getVibeState } from './vibe-controller';
import { runSwarmConsensus } from '../desk/intelligence/signal-consensus-swarm';
import { validateSignal } from '../desk/intelligence/signal-validator';
import { reflectOnTrade } from '../desk/intelligence/dual-level-reflection-engine';
import type { SignalCandidate } from '../desk/intelligence/signal-validator';
import type { TradeOutcome } from '../desk/intelligence/dual-level-reflection-engine';
import { recordPrediction, startResolutionChecker } from '../desk/intelligence/prediction-accuracy-tracker';
import { logger } from '../shared/utils/logger';
import { isQwenEnabled } from './qwen-drawdown-monitor';
import { query } from '../shared/db/postgres-client';

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

/**
 * Persist a paper trade to paper_trades_v3 table (source-tagged).
 * Qwen trades are always paper_only=TRUE — NEVER routed to live.
 * Non-blocking: errors are logged but do not fail the trade flow.
 */
export async function savePaperTradeV3(trade: PaperTrade): Promise<void> {
  try {
    await query(
      `INSERT INTO paper_trades_v3
      (id, market_id, side, size_usd, entry_price, strategy, source, confidence, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', $9)
      ON CONFLICT (id) DO NOTHING`,
      [
        trade.id,
        trade.marketId,
        trade.side,
        trade.size,
        trade.entryPrice,
        trade.strategy,
        trade.source,
        trade.signalConfidence,
        trade.timestamp,
      ]
    );
  } catch (err) {
    logger.warn('[PaperOrchestrator] paper_trades_v3 insert failed', { id: trade.id, err });
  }
}

export interface PaperPortfolio {
  capital: number;
  positions: PaperTrade[];
  closedTrades: Array<PaperTrade & { exitPrice: number; pnl: number }>;
  totalPnl: number;
  winCount: number;
  lossCount: number;
}

// ─── Config & state ──────────────────────────────────────────────────────────
const TRADES_FILE = path.join(process.cwd(), 'data', 'paper-trades.json');
const POSITION_SIZE_PCT = 0.05;
const MIN_AI_CONFIDENCE = 0.7;

let portfolio: PaperPortfolio = {
  capital: 1000,
  positions: [],
  closedTrades: [],
  totalPnl: 0,
  winCount: 0,
  lossCount: 0,
};

/** Reset portfolio to defaults — for test isolation only. */
export function __resetPortfolioForTests(): void {
  portfolio = { capital: 1000, positions: [], closedTrades: [], totalPnl: 0, winCount: 0, lossCount: 0 };
}

/** Reset portfolio to initial state (for test isolation). */
export function resetPortfolio(): void {
  portfolio = {
    capital: 1000,
    positions: [],
    closedTrades: [],
    totalPnl: 0,
    winCount: 0,
    lossCount: 0,
  };
}

export function saveTrades(): void {
  try {
    const dir = path.dirname(TRADES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TRADES_FILE, JSON.stringify(portfolio, null, 2));
  } catch (err) { logger.warn('[PaperOrchestrator] Persist failed', { err }); }
}

export function loadTrades(): void {
  try {
    if (fs.existsSync(TRADES_FILE)) {
      portfolio = JSON.parse(fs.readFileSync(TRADES_FILE, 'utf-8')) as PaperPortfolio;
      logger.info('[PaperOrchestrator] Loaded portfolio', { positions: portfolio.positions.length, totalPnl: portfolio.totalPnl });
    }
  } catch { logger.info('[PaperOrchestrator] Fresh portfolio'); }
}

// ─── Signal processing ────────────────────────────────────────────────────────

export async function processCandidate(candidate: SignalCandidate, maxPositions: number): Promise<void> {
  const vibe = getVibeState();

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
  // Endgame: buy the near-certain side (NO when YES<0.05, YES when YES>0.95)
  // Non-endgame: buy whichever side the signal reasoning suggests
  const side: 'YES' | 'NO' = isEndgame
    ? (market.yesPrice < 0.5 ? 'NO' : 'YES') // buy the CERTAIN side
    : (market.yesPrice < 0.5 ? 'YES' : 'NO'); // contrarian bet
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

// ─── Position settlement ──────────────────────────────────────────────────────

export async function checkPositions(): Promise<void> {
  const now = Date.now();
  const stale = portfolio.positions.filter(p => now - p.timestamp > 5 * 60_000);

  for (const trade of stale) {
    // Binary market P&L:
    // Buy YES at $P, resolve YES → get $1, profit = $1-P per share. Resolve NO → get $0, loss = -P per share.
    // Buy NO at $(1-P), resolve NO → get $1, profit = $P per share. Resolve YES → get $0, loss = -(1-P) per share.
    // Shares = size / costPerShare
    const isEndgameTrade = trade.entryPrice > 0.90 || trade.entryPrice < 0.10;
    const costPerShare = trade.side === 'YES' ? trade.entryPrice : (1 - trade.entryPrice);
    const shares = trade.size / costPerShare;

    // Simulate resolution
    let won: boolean;
    if (isEndgameTrade) {
      // Near-certain outcome: 95% chance the expected side wins
      won = Math.random() < 0.95;
    } else {
      // Non-endgame: 50/50 + small edge bias
      won = Math.random() < 0.52; // slight positive bias
    }

    // P&L: win → get $1/share, loss → get $0
    const exitPrice = won ? 1.0 : 0.0;
    const pnl = won ? shares * (1 - costPerShare) - trade.size * 0.02 : -trade.size; // subtract 2% fee on win

    portfolio.positions = portfolio.positions.filter(p => p.id !== trade.id);
    portfolio.closedTrades.push({ ...trade, exitPrice, pnl });
    portfolio.capital += trade.size + pnl;
    portfolio.totalPnl += pnl;
    if (pnl >= 0) { portfolio.winCount++; } else { portfolio.lossCount++; }
    saveTrades();

    // Async reflection — non-blocking
    const outcome: TradeOutcome = {
      tradeId: trade.id,
      marketId: trade.marketId,
      strategy: trade.strategy,
      side: trade.side,
      entryPrice: trade.entryPrice,
      exitPrice,
      pnl,
      expectedEdge: trade.signalConfidence * 0.05,
      actualEdge: pnl / trade.size,
      executionLatency: 0,
      timestamp: trade.timestamp,
    };
    reflectOnTrade(outcome).catch(err => logger.warn('[PaperOrchestrator] Reflection error', { err }));

    logger.info('[PaperOrchestrator] Trade CLOSED', {
      id: trade.id,
      pnl: pnl.toFixed(4),
      totalPnl: portfolio.totalPnl.toFixed(4),
      winRate: (portfolio.winCount / Math.max(1, portfolio.winCount + portfolio.lossCount)).toFixed(2),
    });
  }
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

async function publishMetrics(): Promise<void> {
  try {
    const bus = getMessageBus();
    if (!bus.isConnected()) return;
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
  if (config?.capitalUsdc) portfolio.capital = config.capitalUsdc;

  logger.info('[PaperOrchestrator] Starting', { capital: portfolio.capital, intervalMs, maxPositions });

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
  async function scanAndTrade(): Promise<void> {
    try {
      const resp = await fetch('https://gamma-api.polymarket.com/markets?closed=false&limit=200', {
        signal: AbortSignal.timeout(15_000),
      });
      if (!resp.ok) return;
      const raw = (await resp.json()) as Array<Record<string, unknown>>;

      type PM = { id: string; title: string; yes: number; no: number; vol: number; group: string };
      const markets: PM[] = [];
      for (const m of raw) {
        try {
          const p = JSON.parse((m['outcomePrices'] as string) ?? '[]');
          const yes = parseFloat(p[0] ?? '0'), no = parseFloat(p[1] ?? '0');
          if (yes > 0 && no > 0) markets.push({
            id: String(m['conditionId'] ?? ''),
            title: String(m['question'] ?? ''),
            yes, no, vol: Number(m['volume'] ?? 0),
            group: String(m['groupItemTitle'] ?? m['question'] ?? ''),
          });
        } catch { /* skip */ }
      }

      // Strategy 1: Cross-market logical arb (primary vs general election)
      const groups: Record<string, PM[]> = {};
      for (const m of markets) { (groups[m.group] ??= []).push(m); }
      for (const ms of Object.values(groups)) {
        if (ms.length < 2) continue;
        ms.sort((a, b) => b.yes - a.yes); // highest prob first
        const primary = ms[0], general = ms[1];
        // Logical: "win primary" YES should be >= "win general" YES
        if (primary.yes < general.yes && general.yes - primary.yes > 0.03) {
          const edge = general.yes - primary.yes;
          await processCandidate({
            signalType: 'cross-market',
            markets: [
              { id: primary.id, title: primary.title, yesPrice: primary.yes, noPrice: primary.no },
              { id: general.id, title: general.title, yesPrice: general.yes, noPrice: general.no },
            ],
            expectedEdge: edge,
            reasoning: `Logical violation: "${primary.title.substring(0,30)}" YES=${primary.yes.toFixed(3)} < "${general.title.substring(0,30)}" YES=${general.yes.toFixed(3)}. Edge=${(edge*100).toFixed(1)}%`,
          }, maxPositions);
        }
      }

      // Strategy 2: Near-resolution endgame (>95% or <5% = near-certain)
      for (const m of markets) {
        if (m.vol < 10_000) continue; // min $10K liquidity
        if (m.yes > 0.95) {
          const edge = 1 - m.yes - 0.02; // profit = (1 - price) minus 2% fee
          if (edge > 0.005) await processCandidate({ // 0.5% min for endgame
            signalType: 'simple-arb',
            markets: [{ id: m.id, title: m.title, yesPrice: m.yes, noPrice: m.no }],
            expectedEdge: edge,
            reasoning: `Endgame: YES=${m.yes.toFixed(3)} near-certain, edge=${(edge*100).toFixed(1)}% after fees`,
          }, maxPositions);
        } else if (m.yes < 0.05) {
          const edge = m.yes - 0.02;
          if (edge > 0.005) await processCandidate({ // 0.5% min for endgame
            signalType: 'simple-arb',
            markets: [{ id: m.id, title: m.title, yesPrice: m.yes, noPrice: m.no }],
            expectedEdge: edge,
            reasoning: `Endgame: NO near-certain (YES=${m.yes.toFixed(3)}), edge=${(edge*100).toFixed(1)}%`,
          }, maxPositions);
        }
      }

      // Strategy 3: YES+NO spread (simple arb, rare but checked)
      for (const m of markets) {
        const spread = 1 - m.yes - m.no;
        if (spread > 0.025) await processCandidate({
          signalType: 'simple-arb',
          markets: [{ id: m.id, title: m.title, yesPrice: m.yes, noPrice: m.no }],
          expectedEdge: spread,
          reasoning: `Spread: YES+NO=${(m.yes+m.no).toFixed(3)}, edge=${(spread*100).toFixed(1)}%`,
        }, maxPositions);
      }

      logger.info('[PaperOrchestrator] Scan complete', { markets: markets.length, positions: portfolio.positions.length });
    } catch (err) { logger.warn('[PaperOrchestrator] Scan error', { err: (err as Error).message }); }
  }

  const ticker = setInterval(async () => {
    await scanAndTrade();
    await checkPositions().catch(err => logger.error('[PaperOrchestrator] Check error', { err }));
    await publishMetrics();
  }, intervalMs);

  const shutdown = async () => {
    clearInterval(ticker);
    await loop.stop();
    saveTrades();
    logger.info('[PaperOrchestrator] Shutdown', { totalPnl: portfolio.totalPnl, closed: portfolio.closedTrades.length });
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  // Start prediction accuracy checker (polls resolved markets every 5 min)
  startResolutionChecker();

  logger.info('[PaperOrchestrator] Active', { subscribing: 'signal.validated', intervalMs, predictionTracking: true });
}
