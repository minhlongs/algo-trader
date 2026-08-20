/**
 * Trade Executor — pure functions for paper trade simulation.
 *
 * Extracted from paper-trading-loop.ts to keep loop orchestration under 200 LOC.
 * Contains price simulation, ID generation, trade sizing, and trade closure logic.
 * All functions are stateless; no class instance required.
 */

import type { PaperTradeRecord } from './paper-trading-loop';
import type { TradingPipeline } from '../trading-pipeline';

// ── Symbol → deterministic base price ────────────────────────────────────────

/**
 * Derive a base price from the symbol name via a deterministic hash.
 * Maps to a reasonable crypto-ish price range $50 — $80 000.
 */
export function basePriceForSymbol(symbol: string): number {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = ((hash << 5) - hash + symbol.charCodeAt(i)) | 0;
  }
  return Math.abs(hash % 79950) + 50;
}

// ── Price tick simulation ─────────────────────────────────────────────────────

/** Apply small random variance (±0.25%) to simulate a price tick. */
export function simulatePriceTick(basePrice: number): number {
  const variance = (Math.random() - 0.5) * 0.005; // ±0.25%
  return basePrice * (1 + variance);
}

// ── Trade ID generation ───────────────────────────────────────────────────────

/** Generate a unique trade ID from a counter. */
export function nextId(counter: number): string {
  return `paper-${Date.now()}-${counter}`;
}

// ── Trade closure ─────────────────────────────────────────────────────────────

/** Calculate closure fee as 0.1% of USD notional (simulates CLOB taker fee). */
function closureFee(sizeUsd: number, _price: number): number {
  return sizeUsd * 0.001;
}

/**
 * Close the most recent open trade in the array.
 *
 * Sets exitPrice, pnlUsd, and closedAt on the trade record.
 * Mutates the array element in place and returns it.
 * Returns undefined if there are no open trades.
 */
export function closePaperTrade(
  trades: PaperTradeRecord[],
  holdDurationMs: number,
): PaperTradeRecord | undefined {
  const open = trades.find((t) => t.exitPrice === undefined);
  if (!open) return undefined;

  const exitPrice = simulatePriceTick(open.entryPrice);
  const rawPnl = open.side === 'BUY'
    ? (exitPrice - open.entryPrice) * (open.sizeUsd / open.entryPrice)
    : (open.entryPrice - exitPrice) * (open.sizeUsd / open.entryPrice);
  const fee = closureFee(open.sizeUsd, exitPrice);

  open.exitPrice = exitPrice;
  open.pnlUsd = rawPnl - fee;
  open.closedAt = open.openedAt + holdDurationMs;
  open.durationMs = holdDurationMs;
  return open;
}

// ── Order sizing ──────────────────────────────────────────────────────────────

/**
 * Calculate position size in USD, capped at $1 000.
 * Falls back to $100 when pipeline is unavailable.
 */
export function calculateOrderSize(
  pipeline: TradingPipeline | undefined,
  maxConcurrentTrades: number,
): number {
  if (!pipeline) return 100;
  try {
    const wallet = pipeline.wallet.getWallet('managed-paper-trading');
    const balance = wallet?.currentBalance ?? 100;
    const fraction = Math.min(0.05, 1 / Math.max(maxConcurrentTrades, 1));
    return Math.min(balance * fraction, 1000);
  } catch {
    return 100;
  }
}
