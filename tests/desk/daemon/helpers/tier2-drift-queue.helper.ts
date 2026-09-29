/**
 * Tier 2 BVA Tests: Zero Accounting Drift & Priority Queue Boundaries
 */

import { describe, it, expect } from 'vitest';
import { verifyZeroDrift } from './daemon-test-harness';
import {
  createMockArbIntent,
  createMockMarlIntent,
  createMockAmmIntent,
  createMockAlphaIntent,
} from './mock-desk-components';
import type { UnifiedTradeIntent } from '../../../src/desk/orchestrator/orchestrator-types';

export function computePriorityScore(intent: UnifiedTradeIntent): number {
  const urgencyWeight = intent.urgency === 'HIGH' ? 50 : intent.urgency === 'MEDIUM' ? 25 : 10;
  const riskBoost = intent.isRiskReducing ? 100 : 0;
  return riskBoost + urgencyWeight + intent.expectedEdgeBps;
}

export class BoundedPriorityQueue {
  private items: UnifiedTradeIntent[] = [];

  constructor(public readonly maxCapacity = 50) {}

  public push(intent: UnifiedTradeIntent): boolean {
    if (this.items.length >= this.maxCapacity) {
      const lowest = this.items[this.items.length - 1];
      if (!lowest || computePriorityScore(intent) <= computePriorityScore(lowest)) {
        return false;
      }
      this.items.pop();
    }
    this.items.push(intent);
    this.items.sort((a, b) => computePriorityScore(b) - computePriorityScore(a));
    return true;
  }

  public drain(): UnifiedTradeIntent[] {
    const res = [...this.items];
    this.items = [];
    return res;
  }

  public size(): number { return this.items.length; }
}

export function registerTier2DriftQueueTests(): void {
  describe('Tier 2: Zero Accounting Drift Boundaries', () => {
    it('verifies exact zero drift (|delta| = 0)', () => {
      const res = verifyZeroDrift(100_000, { arbitrage: 50_000, marl: 50_000 }, 0);
      expect(res.valid).toBe(true);
      expect(res.driftUsd).toBe(0);
    });

    it('passes boundary drift |delta| = 9.99e-5 ($0.0000999 < 1e-4)', () => {
      const res = verifyZeroDrift(100_000, { arbitrage: 99_999.9999001 }, 0);
      expect(res.driftUsd).toBeCloseTo(0.0000999, 7);
      expect(res.valid).toBe(true);
    });

    it('fails boundary drift |delta| = 1.00e-4 ($0.0001000 not strictly < 1e-4)', () => {
      const res = verifyZeroDrift(100_000, { arbitrage: 99_999.9999000 }, 0);
      expect(res.driftUsd).toBeCloseTo(0.0001, 6);
      expect(res.valid).toBe(false);
    });

    it('fails boundary drift |delta| = 1.01e-4 ($0.0001010 >= 1e-4)', () => {
      const res = verifyZeroDrift(100_000, { arbitrage: 99_999.9998990 }, 0);
      expect(res.valid).toBe(false);
    });

    it('handles negative drift symmetrically: -9.99e-5 passes', () => {
      const res = verifyZeroDrift(100_000, { arbitrage: 100_000.0000999 }, 0);
      expect(res.valid).toBe(true);
    });

    it('handles negative drift symmetrically: -1.01e-4 fails', () => {
      const res = verifyZeroDrift(100_000, { arbitrage: 100_000.0001010 }, 0);
      expect(res.valid).toBe(false);
    });

    it('tolerates IEEE 754 precision artifacts (0.1 + 0.2 - 0.3)', () => {
      const nav = 0.3;
      const allocated = { arbitrage: 0.1, marl: 0.2 };
      const res = verifyZeroDrift(nav, allocated, 0);
      expect(res.valid).toBe(true);
      expect(res.driftUsd).toBeLessThan(1e-15);
    });

    it('passes on large institutional NAV ($1e9) when drift is 5e-5', () => {
      const res = verifyZeroDrift(1_000_000_000, { arb: 500_000_000, marl: 499_999_999.99995 }, 0);
      expect(res.valid).toBe(true);
    });

    it('verifies sub-cent unallocated cash ($0.00002) with 0 drift', () => {
      const res = verifyZeroDrift(100_000.00002, { arb: 100_000 }, 0.00002);
      expect(res.valid).toBe(true);
    });
  });

  describe('Tier 2: Priority Queue & Intent Expiry Boundaries', () => {
    it('empty queue returns 0 items on poll', () => {
      const q = new BoundedPriorityQueue(50);
      expect(q.drain()).toEqual([]);
      expect(q.size()).toBe(0);
    });

    it('single intent queue returns exact 1 item', () => {
      const q = new BoundedPriorityQueue(50);
      q.push(createMockArbIntent());
      expect(q.size()).toBe(1);
      expect(q.drain()).toHaveLength(1);
    });

    it('accepts up to max queue capacity boundary (exact 50 items)', () => {
      const q = new BoundedPriorityQueue(50);
      for (let i = 0; i < 50; i++) {
        const ok = q.push(createMockArbIntent({ intentId: `intent-${i}`, expectedEdgeBps: i }));
        expect(ok).toBe(true);
      }
      expect(q.size()).toBe(50);
    });

    it('sheds lowest priority item when 51st intent arrives with higher priority', () => {
      const q = new BoundedPriorityQueue(50);
      for (let i = 0; i < 50; i++) {
        q.push(createMockAlphaIntent({ intentId: `low-${i}`, expectedEdgeBps: 10 + i }));
      }
      const topArb = createMockArbIntent({ intentId: 'top-arb', urgency: 'HIGH', expectedEdgeBps: 100 });
      const pushed = q.push(topArb);
      expect(pushed).toBe(true);
      expect(q.size()).toBe(50);
      const drained = q.drain();
      expect(drained[0]?.intentId).toBe('top-arb');
    });

    it('drops incoming intent when 51st intent has lower priority than lowest in queue', () => {
      const q = new BoundedPriorityQueue(50);
      for (let i = 0; i < 50; i++) {
        q.push(createMockArbIntent({ intentId: `high-${i}`, urgency: 'HIGH', expectedEdgeBps: 50 + i }));
      }
      const lowIntent = createMockAlphaIntent({ intentId: 'low-drop', urgency: 'LOW', expectedEdgeBps: 1 });
      const pushed = q.push(lowIntent);
      expect(pushed).toBe(false);
      expect(q.size()).toBe(50);
    });

    it('filters out intent expiring exactly at now (expiresAt === now)', () => {
      const now = 1_000_000;
      const intent = createMockArbIntent({ expiresAt: now });
      const unexpired = [intent].filter((i) => i.expiresAt > now);
      expect(unexpired).toHaveLength(0);
    });

    it('preserves intent expiring at now + 1ms', () => {
      const now = 1_000_000;
      const intent = createMockArbIntent({ expiresAt: now + 1 });
      const unexpired = [intent].filter((i) => i.expiresAt > now);
      expect(unexpired).toHaveLength(1);
    });

    it('filters out intent expiring at now - 1ms', () => {
      const now = 1_000_000;
      const intent = createMockArbIntent({ expiresAt: now - 1 });
      const unexpired = [intent].filter((i) => i.expiresAt > now);
      expect(unexpired).toHaveLength(0);
    });

    it('correctly ranks intent with 0 bps expected edge against negative edge (-10 bps)', () => {
      const zeroEdge = createMockMarlIntent({ expectedEdgeBps: 0, urgency: 'MEDIUM' });
      const negEdge = createMockAmmIntent({ expectedEdgeBps: -10, urgency: 'MEDIUM' });
      const scoreZero = computePriorityScore(zeroEdge);
      const scoreNeg = computePriorityScore(negEdge);
      expect(scoreZero).toBeGreaterThan(scoreNeg);
    });

    it('handles extreme expected edge (1,000,000 bps) without overflow', () => {
      const massive = createMockArbIntent({ expectedEdgeBps: 1_000_000, urgency: 'HIGH' });
      const score = computePriorityScore(massive);
      expect(score).toBe(1_000_050);
      expect(Number.isFinite(score)).toBe(true);
    });
  });
}
