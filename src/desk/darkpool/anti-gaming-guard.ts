/**
 * Anti-Gaming & Information Sniffing Guard
 * Identifies predatory pinging, rapid micro-cancellations, and quote probing behaviors.
 *
 * @module desk/darkpool/anti-gaming-guard
 */

import { AntiGamingConfig, DarkOrder } from './darkpool-types';

interface ParticipantActivity {
  orderSubmissions: number;
  cancellations: number;
  lastOrderTimestampMs: number;
  lastSeenServerMs: number;
  suspiciousPings: number;
}

export class AntiGamingGuard {
  private readonly activity = new Map<string, ParticipantActivity>();
  private readonly config: AntiGamingConfig;
  private readonly maxTrackedParticipants: number;
  private readonly inactivityWindowMs: number;
  private readonly clock: () => number;

  public constructor(
    config?: Partial<AntiGamingConfig>,
    maxTrackedParticipants: number = 5000,
    inactivityWindowMs: number = 60_000,
    clock: () => number = () => Date.now()
  ) {
    this.config = {
      maxOrderRatePerSec: config?.maxOrderRatePerSec ?? 20,
      minRestingTimeMs: config?.minRestingTimeMs ?? 50,
      cancellationRatioThreshold: config?.cancellationRatioThreshold ?? 0.85,
      smallOrderSniffingThreshold: config?.smallOrderSniffingThreshold ?? 10,
    };
    this.maxTrackedParticipants = maxTrackedParticipants;
    this.inactivityWindowMs = inactivityWindowMs;
    this.clock = clock;
  }

  public validateOrder(order: DarkOrder): { isAllowed: boolean; reason?: string } {
    const serverNow = this.clock();
    let act = this.activity.get(order.participantId);

    if (!act) {
      if (this.activity.size >= this.maxTrackedParticipants) {
        // Eviction uses trusted server clock, never client-supplied timestamps
        let evictedKey: string | undefined;

        // Tier 1: Evict participants inactive on trusted server clock
        for (const [id, record] of this.activity.entries()) {
          if (serverNow - record.lastSeenServerMs > this.inactivityWindowMs) {
            evictedKey = id;
            break;
          }
        }

        // Tier 2: If all recently active, evict least suspicious LRU entry (never fail closed for flow)
        if (evictedKey === undefined) {
          let oldestCleanKey: string | undefined;
          let oldestCleanTime = Infinity;
          let trueOldestKey: string | undefined;
          let trueOldestTime = Infinity;

          for (const [id, record] of this.activity.entries()) {
            if (record.lastSeenServerMs < trueOldestTime) {
              trueOldestTime = record.lastSeenServerMs;
              trueOldestKey = id;
            }
            if (record.suspiciousPings === 0 && record.lastSeenServerMs < oldestCleanTime) {
              oldestCleanTime = record.lastSeenServerMs;
              oldestCleanKey = id;
            }
          }
          evictedKey = oldestCleanKey ?? trueOldestKey;
        }

        if (evictedKey !== undefined) {
          this.activity.delete(evictedKey);
        }
      }

      act = {
        orderSubmissions: 0,
        cancellations: 0,
        lastOrderTimestampMs: 0,
        lastSeenServerMs: serverNow,
        suspiciousPings: 0,
      };
      this.activity.set(order.participantId, act);
    } else {
      act.lastSeenServerMs = serverNow;
      // Re-insert to refresh LRU order
      this.activity.delete(order.participantId);
      this.activity.set(order.participantId, act);
    }

    if (order.quantity < this.config.smallOrderSniffingThreshold) {
      act.suspiciousPings += 1;
      if (act.suspiciousPings > 5) {
        return { isAllowed: false, reason: 'Predatory small-order sniffing detected' };
      }
    }

    if (act.lastOrderTimestampMs > 0) {
      const timeDiff = order.timestampMs - act.lastOrderTimestampMs;
      if (timeDiff < 0) {
        return { isAllowed: false, reason: 'Invalid non-monotonic order timestamp' };
      }
      if (timeDiff < this.config.minRestingTimeMs && act.orderSubmissions > 5) {
        return { isAllowed: false, reason: 'Excessive high-frequency order rate' };
      }
    }

    act.orderSubmissions += 1;
    act.lastOrderTimestampMs = order.timestampMs;
    return { isAllowed: true };
  }

  public recordCancellation(participantId: string): void {
    const act = this.activity.get(participantId);
    if (act) {
      act.cancellations += 1;
    }
  }

  public isParticipantThrottled(participantId: string): boolean {
    const act = this.activity.get(participantId);
    if (!act || act.orderSubmissions < 10) return false;
    const ratio = act.cancellations / act.orderSubmissions;
    return ratio >= this.config.cancellationRatioThreshold;
  }
}
