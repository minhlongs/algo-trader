/**
 * Whale Tracker V2 — Pure Helpers and Types
 *
 * Submodule extracted from whale-tracker-v2.ts to keep files under 200 lines.
 * Contains config types, pure computation functions, and internal types.
 */

import type { BaseStrategyConfig } from './base-polymarket-strategy';

// ── Config ─────────────────────────────────────────────────────────────────────

export interface WhaleTrackerConfig extends BaseStrategyConfig {
  /** Multiplier of median size to qualify as whale order */
  whaleThreshold: number;
  /** Whale bid/ask volume ratio to trigger signal */
  imbalanceRatio: number;
  /** Minimum whale events in window to confirm pattern */
  minWhaleEvents: number;
  /** Whale detection window in ms */
  whaleWindowMs: number;
  /** Minimum total whale volume in USDC */
  minWhaleVolume: number;
}

export const DEFAULT_CONFIG: WhaleTrackerConfig = {
  whaleThreshold: 10,
  imbalanceRatio: 3.0,
  minWhaleEvents: 2,
  whaleWindowMs: 60_000,
  minWhaleVolume: 500,
  minVolume: 0,
  takeProfitPct: 0.04,
  stopLossPct: 0.025,
  maxHoldMs: 10 * 60_000,
  maxPositions: 3,
  cooldownMs: 120_000,
  positionSize: '15',
};

// ── Internal types ──────────────────────────────────────────────────────────

export interface WhaleEvent {
  timestamp: number;
  side: 'bid' | 'ask';
  price: number;
  size: number;
}

// ── Pure helpers (exported for testing) ──────────────────────────────────────

/** Calculate median size from a list of orderbook levels. Returns 0 for empty arrays. */
export function calcMedianSize(levels: { size: string }[]): number {
  if (levels.length === 0) return 0;
  const sizes = levels.map(l => parseFloat(l.size)).sort((a, b) => a - b);
  const mid = Math.floor(sizes.length / 2);
  return sizes.length % 2 === 0
    ? ((sizes[mid - 1] ?? 0) + (sizes[mid] ?? 0)) / 2
    : (sizes[mid] ?? 0);
}

/**
 * Detect whale orders from an orderbook.
 * A level qualifies as a whale order if its size > median * threshold.
 */
export function detectWhaleOrders(
  book: { bids: { price: string; size: string }[]; asks: { price: string; size: string }[] },
  threshold: number,
): WhaleEvent[] {
  const median = calcMedianSize([...book.bids, ...book.asks]);
  if (median === 0) return [];
  const cutoff = median * threshold;
  const now = Date.now();
  const events: WhaleEvent[] = [];

  for (const level of book.bids) {
    const size = parseFloat(level.size);
    if (size > cutoff) events.push({ timestamp: now, side: 'bid', price: parseFloat(level.price), size });
  }
  for (const level of book.asks) {
    const size = parseFloat(level.size);
    if (size > cutoff) events.push({ timestamp: now, side: 'ask', price: parseFloat(level.price), size });
  }
  return events;
}

/** Calculate whale imbalance from a list of whale events. */
export function calcWhaleImbalance(events: WhaleEvent[]): { bidVolume: number; askVolume: number; ratio: number } {
  let bidVolume = 0;
  let askVolume = 0;
  for (const e of events) {
    if (e.side === 'bid') bidVolume += e.size;
    else askVolume += e.size;
  }
  const ratio = askVolume === 0 ? (bidVolume > 0 ? Infinity : 0) : bidVolume / askVolume;
  return { bidVolume, askVolume, ratio };
}

/** Determine entry signal based on whale imbalance and config thresholds. */
export function shouldEnter(
  imbalance: { ratio: number; bidVolume: number; askVolume: number },
  config: WhaleTrackerConfig,
): 'buy-yes' | 'buy-no' | null {
  const totalVolume = imbalance.bidVolume + imbalance.askVolume;
  if (totalVolume < config.minWhaleVolume) return null;
  if (imbalance.ratio >= config.imbalanceRatio) return 'buy-yes';
  if (imbalance.ratio > 0 && (1 / imbalance.ratio) >= config.imbalanceRatio) return 'buy-no';
  if (imbalance.bidVolume === 0 && imbalance.askVolume >= config.minWhaleVolume) return 'buy-no';
  return null;
}

/** Append whale events to per-market history and prune events outside the window. */
export function appendAndPruneWhaleEvents(
  historyMap: Map<string, WhaleEvent[]>,
  tokenId: string,
  events: WhaleEvent[],
  windowMs: number,
  now = Date.now(),
): void {
  let history = historyMap.get(tokenId);
  if (!history) { history = []; historyMap.set(tokenId, history); }
  history.push(...events);
  const cutoff = now - windowMs;
  const firstValid = history.findIndex(e => e.timestamp >= cutoff);
  if (firstValid > 0) history.splice(0, firstValid);
  else if (firstValid === -1) history.length = 0;
}

/** Evaluate whether recent whale activity indicates an opposing whale reversal. */
export function evaluateWhaleReversalExit(
  side: 'yes' | 'no',
  recentEvents: WhaleEvent[],
  config: Pick<WhaleTrackerConfig, 'minWhaleEvents' | 'imbalanceRatio'>,
): { exit: boolean; reason: string } {
  if (recentEvents.length < config.minWhaleEvents) return { exit: false, reason: '' };
  const imbalance = calcWhaleImbalance(recentEvents);
  if (side === 'yes' && imbalance.askVolume > imbalance.bidVolume * config.imbalanceRatio) {
    return { exit: true, reason: `whale-reversal (ask dominance ratio=${(imbalance.askVolume / Math.max(imbalance.bidVolume, 0.01)).toFixed(2)})` };
  }
  if (side === 'no' && imbalance.bidVolume > imbalance.askVolume * config.imbalanceRatio) {
    return { exit: true, reason: `whale-reversal (bid dominance ratio=${(imbalance.bidVolume / Math.max(imbalance.askVolume, 0.01)).toFixed(2)})` };
  }
  return { exit: false, reason: '' };
}
