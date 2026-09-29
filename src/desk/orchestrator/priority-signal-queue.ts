/**
 * Priority Signal Queue
 * Priority-weighted queue with urgency, edge, Sharpe, and expiry scoring.
 * Implements backpressure shedding at capacity (default 50), strictly protecting
 * risk-reducing and HIGH urgency intents from eviction.
 */

import { logger } from '../../shared/utils/logger';
import type { QueueStatus, UnifiedTradeIntent, IntentPriority } from './orchestrator-types';

export interface QueueEntry {
  readonly intent: UnifiedTradeIntent;
  readonly priority: IntentPriority;
  readonly enqueuedAt: number;
}

export class PrioritySignalQueue {
  private items: QueueEntry[] = [];
  private readonly maxCapacity: number;
  private shedCounter = 0;

  constructor(maxCapacity = 50) {
    this.maxCapacity = Math.max(1, maxCapacity);
  }

  public computePriority(intent: UnifiedTradeIntent, now = Date.now()): IntentPriority {
    const urgencyScore = intent.urgency === 'HIGH' ? 1000 : intent.urgency === 'MEDIUM' ? 100 : 10;
    const riskReductionBoost = intent.isRiskReducing ? 500 : 0;
    const edgeScore = Math.max(0, Math.min(50, intent.expectedEdgeBps / 10));
    const sharpeScore = Math.max(0, Math.min(50, intent.expectedSharpe * 10));

    const remainingMs = intent.expiresAt > 0 ? Math.max(0, intent.expiresAt - now) : intent.timeToExpiryMs;
    const maxHorizonMs = 86_400_000;
    const expiryScore = Math.max(0, Math.min(50, 50 * (1 - remainingMs / maxHorizonMs)));

    const compositePriority = urgencyScore + riskReductionBoost + edgeScore + sharpeScore + expiryScore;
    return { urgencyScore, edgeScore, sharpeScore, expiryScore, riskReductionBoost, compositePriority };
  }

  public isProtected(intent: UnifiedTradeIntent): boolean {
    return intent.isRiskReducing || intent.urgency === 'HIGH';
  }

  public enqueue(intent: UnifiedTradeIntent): boolean {
    const priority = this.computePriority(intent);
    const entry: QueueEntry = { intent, priority, enqueuedAt: Date.now() };

    if (this.items.length >= this.maxCapacity) {
      const sheddableIndices = this.items
        .map((item, idx) => ({ idx, item }))
        .filter(({ item }) => !this.isProtected(item.intent))
        .sort((a, b) => a.item.priority.compositePriority - b.item.priority.compositePriority);

      if (sheddableIndices.length > 0) {
        const victimIdx = sheddableIndices[0].idx;
        const victim = this.items.splice(victimIdx, 1)[0];
        this.shedCounter++;
        logger.warn('Backpressure shedding evicted lowest-priority intent', {
          evictedId: victim.intent.intentId,
          engineId: victim.intent.engineId,
          priority: victim.priority.compositePriority,
        });
      } else {
        if (!this.isProtected(intent)) {
          this.shedCounter++;
          logger.warn('Backpressure shedding rejected incoming un-protected intent', {
            droppedId: intent.intentId,
            engineId: intent.engineId,
          });
          return false;
        }
        logger.warn('Queue at capacity with all protected items; permitting protected intent', {
          intentId: intent.intentId,
        });
      }
    }

    const insertIdx = this.items.findIndex(
      (e) => e.priority.compositePriority < priority.compositePriority
    );
    if (insertIdx === -1) {
      this.items.push(entry);
    } else {
      this.items.splice(insertIdx, 0, entry);
    }
    return true;
  }

  public dequeue(): UnifiedTradeIntent | undefined {
    return this.items.shift()?.intent;
  }

  public peek(): UnifiedTradeIntent | undefined {
    return this.items[0]?.intent;
  }

  public size(): number {
    return this.items.length;
  }

  public isEmpty(): boolean {
    return this.items.length === 0;
  }

  public clear(): void {
    this.items = [];
  }

  public getAll(): readonly UnifiedTradeIntent[] {
    return this.items.map((e) => e.intent);
  }

  public getEntries(): readonly QueueEntry[] {
    return [...this.items];
  }

  public getStatus(): QueueStatus {
    const timestamps = this.items.map((e) => e.enqueuedAt);
    return {
      depth: this.items.length,
      maxCapacity: this.maxCapacity,
      highUrgencyCount: this.items.filter((e) => e.intent.urgency === 'HIGH').length,
      riskReducingCount: this.items.filter((e) => e.intent.isRiskReducing).length,
      shedCount: this.shedCounter,
      oldestTimestamp: timestamps.length > 0 ? Math.min(...timestamps) : undefined,
      newestTimestamp: timestamps.length > 0 ? Math.max(...timestamps) : undefined,
    };
  }
}
