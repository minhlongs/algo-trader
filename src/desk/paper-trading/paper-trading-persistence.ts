/**
 * Persistence layer for paper trading loop (Cloudflare KV & D1).
 */

import { logger } from '../core/logger';
import {
  type D1Database,
  type KVStore,
  type PaperTradeRecord,
  STATE_KEY,
} from './paper-trading-types';

export interface LoadedLoopState {
  tradeCounter?: number;
  startTime?: number;
}

/**
 * Load state from KV before running a tick.
 * Replaces existing trades array content and returns counter & start time.
 */
export async function loadLoopState(
  kv: KVStore | undefined,
  trades: PaperTradeRecord[],
): Promise<LoadedLoopState | null> {
  if (!kv) return null;
  try {
    const raw = await kv.get(STATE_KEY, 'json');
    if (raw && typeof raw === 'object') {
      const state = raw as { trades?: PaperTradeRecord[]; tradeCounter?: number; startTime?: number };
      trades.length = 0;
      if (Array.isArray(state.trades)) trades.push(...state.trades);
      const tradeCounter = typeof state.tradeCounter === 'number'
        ? Math.max(state.tradeCounter, trades.length)
        : undefined;
      return {
        tradeCounter,
        startTime: typeof state.startTime === 'number' ? state.startTime : undefined,
      };
    }
  } catch (err) {
    logger.warn('[PaperTradingLoop] State load failed', { err });
  }
  return null;
}

/**
 * Persist state to KV after a tick.
 * Returns the put() promise so callers can await it before the worker invocation ends.
 */
export function saveLoopState(
  kv: KVStore | undefined,
  trades: PaperTradeRecord[],
  tradeCounter: number,
  startTime?: number,
): Promise<void> {
  if (!kv) {
    logger.debug('[PaperTradingLoop] saveState skipped: no KV');
    return Promise.resolve();
  }
  const payload = JSON.stringify({
    trades,
    tradeCounter,
    startTime,
  });
  logger.debug(
    `[PaperTradingLoop] saveState writing ${payload.length} bytes, trades=${trades.length}, counter=${tradeCounter}`
  );
  return kv
    .put(STATE_KEY, payload)
    .then(() => {
      logger.debug('[PaperTradingLoop] saveState KV put succeeded');
    })
    .catch((err) => {
      logger.error('[PaperTradingLoop] saveState KV put FAILED', { err });
    });
}

/**
 * Persist closed trade to paper_trades_v3 table via D1 binding.
 */
export async function persistClosedTradeToD1(
  db: D1Database | undefined,
  closed: PaperTradeRecord,
): Promise<void> {
  if (!db) {
    logger.warn('[PaperTradingLoop] persistClosedTrade skipped: no D1 binding');
    return;
  }
  const side = closed.side === 'BUY' ? 'YES' : 'NO';
  const now = Date.now();
  try {
    const result = await db
      .prepare(
        `INSERT INTO paper_trades_v3
          (id, market_id, side, size_usd, entry_price, exit_price, pnl, strategy, source, confidence, status, created_at, closed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'paper-loop', 'paper-loop', 0.5, 'closed', ?, ?)
         ON CONFLICT (id) DO NOTHING`,
      )
      .bind(
        closed.id,
        closed.symbol,
        side,
        closed.sizeUsd,
        closed.entryPrice,
        closed.exitPrice ?? null,
        closed.pnlUsd ?? null,
        closed.openedAt,
        now,
      )
      .run();
    logger.info('[PaperTradingLoop] D1 persist succeeded', {
      id: closed.id,
      success: result.success,
    });
  } catch (err) {
    logger.error('[PaperTradingLoop] D1 persist failed', {
      id: closed.id,
      err: String(err),
      dbExists: !!db,
    });
  }
}
