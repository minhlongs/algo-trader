/**
 * Paper Trading Entry Point — conditionally starts the paper trading loop.
 *
 * Activated by PAPER_TRADING_ENABLED=true env var.
 * Reads configuration from CF Worker env bindings (NOT process.env —
 * CF Workers [vars] are only available via the env object passed to handlers).
 * Designed to be called once during worker startup.
 */

import { PaperTradingLoop, type D1Database } from '../../desk/paper-trading/paper-trading-loop';
import { loadLoopState } from '../../desk/paper-trading/paper-trading-persistence';
import { buildLoopStatus } from '../../desk/paper-trading/paper-trading-metrics';
import { logger } from '../../shared/utils/logger';
import type {
  PaperTradingConfig,
  KVStore,
  PaperTradeRecord,
  PaperTradingStatus,
} from '../../desk/paper-trading/paper-trading-loop';
import { asKVStore } from '../../desk/paper-trading/paper-trading-loop';

const DEFAULT_SYMBOLS = ['BTC/USD', 'ETH/USD'];
const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_MAX_CONCURRENT = 3;
const DEFAULT_HOLD_DURATION_MS = 60_000;

/** Env bindings from CF Worker (forwarded from handler env object).
 *  Uses Record<string, unknown> so the Env type (_InternalEnv & Record<string,unknown>)
 *  is assignable without complaints.
 */
export type PaperTradingEnv = Record<string, unknown>;

function buildConfig(env?: PaperTradingEnv): PaperTradingConfig {
  const symbolsRaw = String(env?.PAPER_TRADING_SYMBOLS ?? '');
  const symbols = symbolsRaw
    ? symbolsRaw.split(',').map((s) => s.trim())
    : DEFAULT_SYMBOLS;

  return {
    symbols,
    timeframe: String(env?.PAPER_TRADING_TIMEFRAME ?? '5m'),
    intervalMs: Number(env?.PAPER_TRADING_INTERVAL_MS) || DEFAULT_INTERVAL_MS,
    maxConcurrentTrades: Number(env?.PAPER_TRADING_MAX_CONCURRENT) || DEFAULT_MAX_CONCURRENT,
    holdDurationMs: Number(env?.PAPER_TRADING_HOLD_DURATION_MS) || DEFAULT_HOLD_DURATION_MS,
  };
}

/**
 * Conditionally start the paper trading loop.
 * No-op when PAPER_TRADING_ENABLED is not set or is falsy.
 *
 * Accepts env bindings from CF Worker handler (env object) instead of
 * reading process.env, which is undefined in CF Workers runtime.
 */
let paperTradingLoop: PaperTradingLoop | undefined;

export function stopPaperTrading(): void {
  paperTradingLoop?.stop();
  paperTradingLoop = undefined;
}

export function initPaperTrading(kv?: KVStore, env?: PaperTradingEnv, db?: D1Database): boolean {
  if (String(env?.QWEN_KILL ?? process.env.QWEN_KILL ?? '') === '1') {
    stopPaperTrading();
    logger.info('[PaperTrading] Initialization blocked by L1 kill switch (QWEN_KILL=1)');
    return false;
  }
  // Accept both CF Worker env bindings (preferred) and process.env (tests/Node.js)
  const enabled = String(env?.PAPER_TRADING_ENABLED ?? process.env.PAPER_TRADING_ENABLED ?? '');
  if (enabled !== 'true') {
    logger.info('[PaperTrading] Disabled (PAPER_TRADING_ENABLED != true)');
    return false;
  }

  const config = buildConfig({
    PAPER_TRADING_SYMBOLS: env?.PAPER_TRADING_SYMBOLS ?? process.env.PAPER_TRADING_SYMBOLS,
    PAPER_TRADING_TIMEFRAME: env?.PAPER_TRADING_TIMEFRAME ?? process.env.PAPER_TRADING_TIMEFRAME,
    PAPER_TRADING_INTERVAL_MS: env?.PAPER_TRADING_INTERVAL_MS ?? process.env.PAPER_TRADING_INTERVAL_MS,
    PAPER_TRADING_MAX_CONCURRENT: env?.PAPER_TRADING_MAX_CONCURRENT ?? process.env.PAPER_TRADING_MAX_CONCURRENT,
    PAPER_TRADING_HOLD_DURATION_MS: env?.PAPER_TRADING_HOLD_DURATION_MS ?? process.env.PAPER_TRADING_HOLD_DURATION_MS,
  } as PaperTradingEnv);
  stopPaperTrading();
  paperTradingLoop = new PaperTradingLoop(config, undefined, kv, db);
  paperTradingLoop.start();

  logger.info('[PaperTrading] Initialized and started', {
    symbols: config.symbols,
    intervalMs: config.intervalMs,
    maxConcurrent: config.maxConcurrentTrades,
  });
  return true;
}

/**
 * Run one tick of the paper trading loop.
 * CF Workers are stateless per invocation — setInterval does not survive
 * across cron trigger boundaries. Each scheduled tick runs a single iteration
 * via this entry point rather than relying on a long-lived timer.
 * State is loaded from KV before the tick and saved after.
 *
 * Returns diagnostic info so callers can verify the tick actually ran.
 */
export async function runPaperTradingTick(kv?: KVStore, env?: PaperTradingEnv, db?: D1Database): Promise<{
  ok: true;
  initialized: boolean;
  killed?: boolean;
  tradesBefore: number;
  tradesAfter: number;
  hasKv: boolean;
}> {
  if (String(env?.QWEN_KILL ?? process.env.QWEN_KILL ?? '') === '1') {
    paperTradingLoop?.stop();
    paperTradingLoop = undefined;
    logger.info('[PaperTrading] Tick blocked by L1 kill switch (QWEN_KILL=1)');
    return { ok: true, initialized: false, killed: true, tradesBefore: 0, tradesAfter: 0, hasKv: !!kv };
  }
  if (!paperTradingLoop) {
    // Cron triggers hit `scheduled` directly — initialize the loop on first tick
    // so the stateless worker has a live PaperTradingLoop to run against.
    initPaperTrading(kv, env, db);
    if (!paperTradingLoop) {
      return { ok: true, initialized: false, tradesBefore: 0, tradesAfter: 0, hasKv: false };
    }
  }
  if (kv) paperTradingLoop.setKV(kv);
  if (db) paperTradingLoop.setDB(db);
  await paperTradingLoop.loadState();
  const tradesBefore = paperTradingLoop.getTrades().length;
  await paperTradingLoop.runTick();
  const tradesAfter = paperTradingLoop.getTrades().length;
  return {
    ok: true,
    initialized: true,
    tradesBefore,
    tradesAfter,
    hasKv: !!kv,
  };
}

/**
 * Read-only paper trading status snapshot for GET /api/v1/paper-trading/status.
 * Reads persisted KV state (STATE_KEY = 'paper-trading-loop-state') without mutating KV or D1.
 */
export async function getPaperTradingStatus(
  kv?: KVStore,
  env?: PaperTradingEnv,
): Promise<{
  ok: true;
  enabled: boolean;
  killed: boolean;
  state: PaperTradingStatus;
  tradeCounter: number;
}> {
  const killed = String(env?.QWEN_KILL ?? process.env.QWEN_KILL ?? '') === '1';
  const enabled = String(env?.PAPER_TRADING_ENABLED ?? process.env.PAPER_TRADING_ENABLED ?? '') === 'true';
  if (killed) {
    stopPaperTrading();
  }
  const running = enabled && !killed;
  const trades: PaperTradeRecord[] = paperTradingLoop ? paperTradingLoop.getTrades() : [];
  const loaded = await loadLoopState(asKVStore(kv), trades);
  const inMemoryState = paperTradingLoop?.getState?.();
  const startTime = loaded?.startTime ?? (running ? inMemoryState?.startTime : undefined);
  const state = buildLoopStatus(running, trades, startTime);
  const tradeCounter = typeof loaded?.tradeCounter === 'number' ? loaded.tradeCounter : trades.length;
  return {
    ok: true,
    enabled,
    killed,
    state,
    tradeCounter,
  };
}

/** Test hook: reset the module-level loop reference. */
export function __resetPaperTradingLoop(): void {
  paperTradingLoop = undefined;
}