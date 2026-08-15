/**
 * Paper Trading Persistence
 *
 * File-based save/load for paper trading portfolio state.
 * Extracted from paper-trading-orchestrator.ts for focused responsibility.
 *
 * Exports: saveTrades, loadTrades, savePaperTradeV3 (DB), portfolio reset helpers.
 */

import * as path from 'path';
import { logger } from '../../shared/utils/logger';
import { readJson, writeJson } from '../../shared/persistence/persistent-store';
import { query } from '../../db/postgres-client';
import { reflectOnTrade } from '../intelligence/dual-level-reflection-engine';
import type { TradeOutcome } from '../intelligence/dual-level-reflection-engine';
import type { PaperTrade, PaperPortfolio } from './paper-trading-orchestrator';

// ─── Config ──────────────────────────────────────────────────────────────────

const TRADES_FILE = path.join(process.cwd(), 'data', 'paper-trades.json');
export const POSITION_SIZE_PCT = 0.05;
export const MIN_AI_CONFIDENCE = 0.7;

// ─── Default Portfolio ───────────────────────────────────────────────────────

export function createDefaultPortfolio(capital = 1000): PaperPortfolio {
  return {
    capital,
    positions: [],
    closedTrades: [],
    totalPnl: 0,
    winCount: 0,
    lossCount: 0,
  };
}

let portfolio: PaperPortfolio = createDefaultPortfolio();
let tradesFile = TRADES_FILE;

/** Get current portfolio reference (used by orchestrator) */
export function getPortfolio(): PaperPortfolio {
  return portfolio;
}

/** Set portfolio reference (for test injection / reset) */
export function setPortfolio(p: PaperPortfolio): void {
  portfolio = p;
}

/** Set trades file path (for test isolation) */
export function setTradesFile(filePath: string): void {
  tradesFile = filePath;
}

/** Reset portfolio to defaults — for test isolation only. */
export function __resetPortfolioForTests(): void {
  portfolio = createDefaultPortfolio();
}

/** Reset portfolio to initial state (for test isolation). */
export function resetPortfolio(): void {
  portfolio = createDefaultPortfolio();
}

// ─── File Persistence ────────────────────────────────────────────────────────

export function saveTrades(): void {
  try {
    writeJson(tradesFile, portfolio);
  } catch (err) { logger.warn('[PaperOrchestrator] Persist failed', { err }); }
}

export function loadTrades(): void {
  try {
    const loaded = readJson<PaperPortfolio>(tradesFile);
    if (loaded) {
      portfolio = loaded;
      logger.info('[PaperOrchestrator] Loaded portfolio', {
        positions: portfolio.positions.length,
        totalPnl: portfolio.totalPnl,
      });
    }
  } catch { logger.info('[PaperOrchestrator] Fresh portfolio'); }
}

// ─── Position Settlement ──────────────────────────────────────────────────────

export async function settleStalePositions(): Promise<void> {
  const now = Date.now();
  const stale = portfolio.positions.filter(p => now - p.timestamp > 5 * 60_000);

  for (const trade of stale) {
    const isEndgameTrade = trade.entryPrice > 0.90 || trade.entryPrice < 0.10;
    const costPerShare = trade.side === 'YES' ? trade.entryPrice : (1 - trade.entryPrice);
    const shares = trade.size / costPerShare;

    let won: boolean;
    if (isEndgameTrade) {
      won = Math.random() < 0.95;
    } else {
      won = Math.random() < 0.52;
    }

    const exitPrice = won ? 1.0 : 0.0;
    const pnl = won ? shares * (1 - costPerShare) - trade.size * 0.02 : -trade.size;

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

// ─── DB Persistence (paper_trades_v3) ────────────────────────────────────────

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
