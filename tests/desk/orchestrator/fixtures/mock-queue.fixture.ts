/**
 * Mock Priority Signal Queue Fixture
 * Priority-weighted queue with urgency, edge, Sharpe, expiry scoring and shedding
 */

import type {
  UnifiedTradeIntent,
  IntentPriority,
  QueueStatus,
} from './harness-types';
import { calculateMockPriority } from './mock-engines.fixture';

export class MockPriorityQueue {
  private items: Array<{ intent: UnifiedTradeIntent; priority: IntentPriority; enqueuedAt: number }> = [];
  private readonly maxCapacity: number;
  private shedCount = 0;

  constructor(maxCapacity = 50) {
    this.maxCapacity = Math.max(1, maxCapacity);
  }

  public enqueue(intent: UnifiedTradeIntent, now = Date.now()): boolean {
    const priority = calculateMockPriority(intent, now);
    const entry = { intent, priority, enqueuedAt: now };

    if (this.items.length >= this.maxCapacity) {
      const sheddable = this.items
        .map((item, idx) => ({ idx, item }))
        .filter(({ item }) => !item.intent.isRiskReducing && item.intent.urgency !== 'HIGH')
        .sort((a, b) => a.item.priority.compositePriority - b.item.priority.compositePriority);

      if (sheddable.length > 0) {
        this.items.splice(sheddable[0].idx, 1);
        this.shedCount++;
      } else {
        if (!intent.isRiskReducing && intent.urgency !== 'HIGH') {
          this.shedCount++;
          return false;
        }
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

  public getAll(): readonly UnifiedTradeIntent[] {
    return this.items.map((i) => i.intent);
  }

  public getStatus(): QueueStatus {
    return {
      depth: this.items.length,
      maxCapacity: this.maxCapacity,
      highUrgencyCount: this.items.filter((i) => i.intent.urgency === 'HIGH').length,
      riskReducingCount: this.items.filter((i) => i.intent.isRiskReducing).length,
      shedCount: this.shedCount,
      oldestTimestamp: this.items[this.items.length - 1]?.enqueuedAt,
      newestTimestamp: this.items[0]?.enqueuedAt,
    };
  }

  public clear(): void {
    this.items = [];
    this.shedCount = 0;
  }
}
