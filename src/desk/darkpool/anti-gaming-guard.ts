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

  public constructor(config?: Partial<AntiGamingConfig>) {
    this.config = {
      maxOrderRatePerSec: config?.maxOrderRatePerSec ?? 20,
      minRestingTimeMs: config?.minRestingTimeMs ?? 50,
      cancellationRatioThreshold: config?.cancellationRatioThreshold ?? 0.85,
      smallOrderSniffingThreshold: config?.smallOrderSniffingThreshold ?? 10,
    };
  }

  public validateOrder(order: DarkOrder): { isAllowed: boolean; reason?: string } {
    let act = this.activity.get(order.participantId);
    if (!act) {
      act = { orderSubmissions: 0, cancellations: 0, lastOrderTimestampMs: 0, suspiciousPings: 0 };
      this.activity.set(order.participantId, act);
    }

    if (order.quantity < this.config.smallOrderSniffingThreshold) {
      act.suspiciousPings += 1;
      if (act.suspiciousPings > 5) {
        return { isAllowed: false, reason: 'Predatory small-order sniffing detected' };
      }
    }

    const timeDiff = order.timestampMs - act.lastOrderTimestampMs;
    if (timeDiff < this.config.minRestingTimeMs && timeDiff >= 0 && act.orderSubmissions > 5) {
      return { isAllowed: false, reason: 'Excessive high-frequency order rate' };
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
