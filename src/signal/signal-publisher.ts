/**
 * Signal Publisher
 * Ingests strategy output, deduplicates, persists to D1 (via postgres-client),
 * broadcasts via SSE, enqueues Telegram push, and warms REST cache.
 */

import { logger } from '../utils/logger';
import { signalDedupGuard, SignalDedupGuard } from './signal-dedup-guard';
import { signalTtlEnforcer } from './signal-ttl-enforcer';
import { sseBroadcaster } from './sse-signal-broadcaster';
import { telegramSignalPusher } from './telegram-signal-pusher';
import { invalidateSignalCache } from './signal-rest-cache';
import type { Signal, SignalSubscription } from './signal-types';

/** Raw input from strategy engine — id computed here */
export interface RawSignalInput {
  market: string;
  side: 'BUY' | 'SELL';
  size: number;
  confidence: number;
  strategy: string;
  ttlSec: number;
  ts?: number;
}

/** Minimal DB interface to avoid tight coupling to postgres-client */
export interface SignalStore {
  saveSignal(signal: Signal): Promise<void>;
  getSubscriptions(): Promise<SignalSubscription[]>;
}

export class SignalPublisher {
  private store: SignalStore;

  constructor(store: SignalStore) {
    this.store = store;
  }

  /**
   * Main entry point: publish a raw strategy output as a signal.
   * Returns the published Signal or null if deduplicated.
   */
  async publish(input: RawSignalInput): Promise<Signal | null> {
    const ts = input.ts ?? Date.now();
    const id = SignalDedupGuard.buildId(
      input.strategy, input.market, input.side, ts, input.ttlSec
    );

    const signal: Signal = {
      id,
      ts,
      market: input.market,
      side: input.side,
      size: input.size,
      confidence: input.confidence,
      strategy: input.strategy,
      ttl: input.ttlSec,
      expiresAt: ts + input.ttlSec * 1000,
    };

    // Dedup check — reject if same signal within TTL bucket
    if (signalDedupGuard.isDuplicate(signal)) {
      logger.debug(`[SignalPublisher] Duplicate signal dropped id=${id}`);
      return null;
    }

    // Persist to DB
    try {
      await this.store.saveSignal(signal);
    } catch (err) {
      logger.error('[SignalPublisher] DB save failed', { err });
      return null;
    }

    // Register with TTL enforcer (in-memory live cache)
    signalTtlEnforcer.register(signal);

    // Invalidate REST cache pages
    await invalidateSignalCache();

    // Broadcast to ENTERPRISE SSE subscribers
    sseBroadcaster.broadcast(signal);

    // Enqueue Telegram push per active subscription
    try {
      const subs = await this.store.getSubscriptions();
      for (const sub of subs) {
        telegramSignalPusher.enqueue(signal, sub);
      }
    } catch (err) {
      logger.warn('[SignalPublisher] Telegram push setup failed', { err });
    }

    logger.info(`[SignalPublisher] Published signal id=${id} market=${signal.market} side=${signal.side}`);
    return signal;
  }
}
