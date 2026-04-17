/**
 * Signal Feed Types
 * Shared type definitions for the signal feed subsystem.
 * Schema: {id, ts, market, side, size, confidence, strategy, ttl}
 */

/** Core signal emitted by strategy engine */
export interface Signal {
  id: string;           // sha256(strategy+market+side+bucketTs)
  ts: number;           // Unix ms of signal generation
  market: string;       // e.g. "BTC-USD", "TRUMP-WIN"
  side: 'BUY' | 'SELL';
  size: number;         // normalized position size (0..1)
  confidence: number;   // 0..1
  strategy: string;     // strategy name
  ttl: number;          // seconds until stale
  expiresAt: number;    // Unix ms = ts + ttl*1000
}

/** Subscription record per subscriber */
export interface SignalSubscription {
  id: string;
  subscriberId: string;   // Better Auth user ID
  chatId?: number;        // Telegram chat ID
  tier: 'FREE' | 'PRO' | 'ENTERPRISE';
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Tier-based delivery config */
export const TIER_SIGNAL_CONFIG = {
  FREE: {
    sseEnabled: false,
    minIntervalMs: 24 * 60 * 60 * 1000, // daily digest
    minConfidence: 0.7,
  },
  PRO: {
    sseEnabled: false,
    minIntervalMs: 60 * 60 * 1000,      // hourly
    minConfidence: 0.6,
  },
  ENTERPRISE: {
    sseEnabled: true,
    minIntervalMs: 0,                    // realtime
    minConfidence: 0.5,
  },
} as const;

export type TierKey = keyof typeof TIER_SIGNAL_CONFIG;
