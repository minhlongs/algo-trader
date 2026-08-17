/**
 * Paper Trading Entry Point — conditionally starts the paper trading loop.
 *
 * Activated by PAPER_TRADING_ENABLED=true env var.
 * Reads configuration from env vars with sensible defaults.
 * Designed to be called once during worker startup.
 */

import { PaperTradingLoop } from '../../desk/paper-trading/paper-trading-loop';
import { logger } from '../../shared/utils/logger';
import type { PaperTradingConfig } from '../../desk/paper-trading/paper-trading-loop';

const DEFAULT_SYMBOLS = ['BTC/USD', 'ETH/USD'];
const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_MAX_CONCURRENT = 3;
const DEFAULT_HOLD_DURATION_MS = 60_000;

function buildConfig(): PaperTradingConfig {
  const symbolsRaw = process.env.PAPER_TRADING_SYMBOLS;
  const symbols = symbolsRaw
    ? symbolsRaw.split(',').map((s) => s.trim())
    : DEFAULT_SYMBOLS;

  return {
    symbols,
    timeframe: process.env.PAPER_TRADING_TIMEFRAME ?? '5m',
    intervalMs: Number(process.env.PAPER_TRADING_INTERVAL_MS) || DEFAULT_INTERVAL_MS,
    maxConcurrentTrades: Number(process.env.PAPER_TRADING_MAX_CONCURRENT) || DEFAULT_MAX_CONCURRENT,
    holdDurationMs: Number(process.env.PAPER_TRADING_HOLD_DURATION_MS) || DEFAULT_HOLD_DURATION_MS,
  };
}

/**
 * Conditionally start the paper trading loop.
 * No-op when PAPER_TRADING_ENABLED is not set or is falsy.
 */
export function initPaperTrading(): void {
  if (process.env.PAPER_TRADING_ENABLED !== 'true') {
    logger.info('[PaperTrading] Disabled (PAPER_TRADING_ENABLED != true)');
    return;
  }

  const config = buildConfig();
  const loop = new PaperTradingLoop(config);
  loop.start();

  logger.info('[PaperTrading] Initialized and started', {
    symbols: config.symbols,
    intervalMs: config.intervalMs,
    maxConcurrent: config.maxConcurrentTrades,
  });
}
