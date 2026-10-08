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
  suspiciousPings: number;
}

export class AntiGamingGuard {
  private readonly activity = new Map<string, ParticipantActivity>();
  private readonly config: AntiGamingConfig;
  private readonly maxTrackedParticipants: number;
  private readonly inactivityWindowMs: number = 60_000;

  public constructor(config?: Partial<AntiGamingConfig>, maxTrackedParticipants: number = 5000) {
    this.config = {
      maxOrderRatePerSec: config?.maxOrderRatePerSec ?? 20,
      minRestingTimeMs: config?.minRestingTimeMs ?? 50,
      cancellationRatioThreshold: config?.cancellationRatioThreshold ?? 0.85,
      smallOrderSniffingThreshold: config?.smallOrderSniffingThreshold ?? 10,
    };
    this.maxTrackedParticipants = maxTrackedParticipants;
  }

  public validateOrder(order: DarkOrder): { isAllowed: boolean; reason?: string } {
    let act = this.activity.get(order.participantId);
    if (!act) {
      if (this.activity.size >= this.maxTrackedParticipants) {
        // Evict only truly inactive participants to prevent cache-flushing state-reset attacks
        let evictedKey: string | undefined;
        for (const [id, record] of this.activity.entries()) {
          if (record.lastOrderTimestampMs > 0 && order.timestampMs - record.lastOrderTimestampMs > this.inactivityWindowMs) {
            evictedKey = id;
            break;
          }
        }
        if (evictedKey !== undefined) {
          this.activity.delete(evictedKey);
        } else {
          return { isAllowed: false, reason: 'Participant tracking capacity saturated' };
        }
      }
      act = { orderSubmissions: 0, cancellations: 0, lastOrderTimestampMs: 0, suspiciousPings: 0 };
      this.activity.set(order.participantId, act);
    } else {
      // Re-insert to keep LRU order
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
