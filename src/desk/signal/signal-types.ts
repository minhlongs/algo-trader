/**
 * Signal Feed Types
 * Shared type definitions for the signal feed subsystem.
 * Schema: {id, ts, market, side, size, confidence, strategy, ttl}
 */

/** Core signal emitted by strategy engine */
export interface Signal {
  id: string;
  ts: number;
  market: string;
  side: 'BUY' | 'SELL';
  size: number;
  confidence: number; // 0..1
  strategy: string;
  ttl: number; // seconds until stale
  expiresAt: number; // Unix ms = ts + ttl*1000
}

/** Subscription record per subscriber */
export interface SignalSubscription {
  id: string;
  subscriberId: string;
  chatId?: number;
  tier: 'FREE' | 'PRO' | 'ENTERPRISE';
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Tier-based delivery config */
export const TIER_SIGNAL_CONFIG = {
  FREE: {
    sseEnabled: false,
    minIntervalMs: 24 * 60 * 60 * 1000,
    minConfidence: 0.7,
  },
  PRO: {
    sseEnabled: false,
    minIntervalMs: 60 * 60 * 1000,
    minConfidence: 0.6,
  },
  ENTERPRISE: {
    sseEnabled: true,
    minIntervalMs: 0,
    minConfidence: 0.5,
  },
} as const;

export type TierKey = keyof typeof TIER_SIGNAL_CONFIG;
