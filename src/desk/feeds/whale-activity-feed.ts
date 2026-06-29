/**
 * Whale Activity Feed — polls Gamma API for recent trades, filters whale-size
 * activity (>= $1000 USDC), deduplicates, and publishes to NATS.
 *
 * NATS topic: 'whale.activity.detected'
 * Poll interval: configurable, default 30s
 */

import { logger } from '../../shared/utils/logger';
import { getMessageBus } from '../../shared/messaging/index';

// ---------------------------------------------------------------------------
// Public types (also consumed by whale-copy-trader)
// ---------------------------------------------------------------------------

export interface RawGammaTrade {
  id: string;
  market: string;          // conditionId or marketId
  asset: string;           // tokenId (outcome token)
  side: string;            // 'BUY' | 'SELL'
  size: string;            // USDC amount as string
  price: string;           // outcome price 0-1
  maker: string;           // wallet address
  taker: string;           // wallet address
  timestamp: number;       // unix seconds
}

export interface WhaleActivity {
  tradeId: string;
  walletAddress: string;   // initiating side (taker for market buys)
  marketId: string;
  tokenId: string;
  side: 'YES' | 'NO';
  size: number;            // USDC
  price: number;           // 0-1
  timestamp: number;       // unix ms
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GAMMA_TRADES_URL = 'https://gamma-api.polymarket.com/trades?limit=100';
const NATS_TOPIC = 'whale.activity.detected';
const WHALE_MIN_USDC = 1_000;            // trades >= $1000 are "whale"
const CACHE_MAX_SIZE = 2_000;            // max dedup cache entries
const DEFAULT_POLL_MS = 30_000;
const FETCH_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// WhaleActivityFeed class
// ---------------------------------------------------------------------------

export class WhaleActivityFeed {
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private seenTradeIds: Set<string> = new Set();
  private handlers: Array<(activity: WhaleActivity) => void> = [];
  private stopped = false;

  /** Register a handler that fires on each new whale trade */
  onWhaleActivity(handler: (activity: WhaleActivity) => void): void {
    this.handlers.push(handler);
  }

  start(pollMs = DEFAULT_POLL_MS): void {
    if (this.stopped) return;
    logger.info('[WhaleActivityFeed] Starting', { pollMs, minUsdc: WHALE_MIN_USDC });
    // Immediate first poll, then interval
    void this.poll();
    this.pollTimer = setInterval(() => { void this.poll(); }, pollMs);
  }

  stop(): void {
    this.stopped = true;
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    logger.info('[WhaleActivityFeed] Stopped');
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  private async poll(): Promise<void> {
    try {
      const resp = await fetch(GAMMA_TRADES_URL, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!resp.ok) {
        logger.warn('[WhaleActivityFeed] Gamma API non-OK', { status: resp.status });
        return;
      }

      const raw = (await resp.json()) as RawGammaTrade[];
      if (!Array.isArray(raw)) return;

      let detected = 0;
      for (const trade of raw) {
        const activity = this.parseTrade(trade);
        if (!activity) continue;
        if (this.seenTradeIds.has(activity.tradeId)) continue;

        // Trim cache before adding
        if (this.seenTradeIds.size >= CACHE_MAX_SIZE) {
          // Drop oldest entries (Set iteration order is insertion order)
          const iter = this.seenTradeIds.values();
          for (let i = 0; i < 200; i++) this.seenTradeIds.delete(iter.next().value as string);
        }
        this.seenTradeIds.add(activity.tradeId);

        detected++;
        this.emit(activity);
      }

      if (detected > 0) {
        logger.info('[WhaleActivityFeed] Whale trades detected', { count: detected });
      }
    } catch (err) {
      logger.warn('[WhaleActivityFeed] Poll error', { err: (err as Error).message });
    }
  }

  private parseTrade(raw: RawGammaTrade): WhaleActivity | null {
    try {
      const size = parseFloat(raw.size);
      const price = parseFloat(raw.price);
      if (isNaN(size) || isNaN(price)) return null;
      if (size < WHALE_MIN_USDC) return null;

      // Determine YES/NO from price: YES tokens trade near their probability
      // If price > 0.5 token is more likely the YES side, else NO side
      const side: 'YES' | 'NO' = price >= 0.5 ? 'YES' : 'NO';

      // Prefer taker as the initiating wallet (they pay spread)
      const walletAddress = raw.taker || raw.maker;
      if (!walletAddress) return null;

      return {
        tradeId: raw.id,
        walletAddress: walletAddress.toLowerCase(),
        marketId: raw.market,
        tokenId: raw.asset,
        side,
        size,
        price,
        timestamp: raw.timestamp ? raw.timestamp * 1000 : Date.now(),
      };
    } catch {
      return null;
    }
  }

  private emit(activity: WhaleActivity): void {
    // Notify local handlers
    for (const handler of this.handlers) {
      try { handler(activity); } catch (err) { logger.warn('[WhaleActivityFeed] Handler error', { err }); }
    }

    // Publish to NATS (best-effort — no NATS = degraded, not fatal)
    const bus = getMessageBus();
    if (bus.isConnected()) {
      bus.publish(NATS_TOPIC, activity, 'whale-activity-feed').catch((err) =>
        logger.warn('[WhaleActivityFeed] NATS publish failed', { err }),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Module-level singleton factory
// ---------------------------------------------------------------------------

let feedInstance: WhaleActivityFeed | null = null;

/** Start the singleton whale activity feed. Idempotent. */
export function startWhaleActivityFeed(pollMs?: number): WhaleActivityFeed {
  if (!feedInstance) {
    feedInstance = new WhaleActivityFeed();
    feedInstance.start(pollMs);
  }
  return feedInstance;
}
