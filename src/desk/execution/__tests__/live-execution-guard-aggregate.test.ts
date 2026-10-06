/**
 * Live Execution Guard — Aggregate Exposure Tests
 */

import { describe, it, expect } from 'vitest';
import { LiveExecutionGuard } from '../live-execution-guard';
import { LivePositionTracker } from '../live-position-tracker';
import type { LiveOrderRequest } from '../types';

function makeOrder(overrides: Partial<LiveOrderRequest> = {}): LiveOrderRequest {
  return {
    tokenId: '0x1234567890abcdef',
    side: 'BUY',
    size: 100,
    price: 0.5,
    orderType: 'GTC',
    strategyName: 'test-strat',
    ...overrides,
  };
}

describe('LiveExecutionGuard — Aggregate Exposure', () => {
  it('rejects order when projected aggregate exposure exceeds limit', () => {
    const tracker = new LivePositionTracker(1000);
    // Fill 3 positions each of size 100 @ 0.50 = $50 exposure each -> total $150
    for (let i = 0; i < 3; i++) {
      tracker.recordFill({
        tokenId: `0x${i.toString(16).padStart(8, '0')}`,
        side: 'BUY',
        size: 100,
        price: 0.5,
        filledAt: Date.now(),
        orderId: `order-${i}`,
      });
    }

    const custom = new LiveExecutionGuard({
      capitalUsdc: 1000,
      maxPositionFraction: 0.10, // 10% = $100 per position
      maxAggregateExposureFraction: 0.20, // 20% = $200 total exposure limit
    });
    custom.setEnabled(true);
    custom.attachTracker(tracker);

    // Current exposure is $150.
    // Order 1: size 80 @ 0.50 = $40 -> projected $190 <= $200 -> approved
    const smallOrder = makeOrder({ size: 80, price: 0.5 });
    expect(custom.guardOrder(smallOrder).approved).toBe(true);

    // Order 2: size 120 @ 0.50 = $60 -> projected $210 > $200 -> rejected
    const bigOrder = makeOrder({ size: 120, price: 0.5 });
    const result = custom.guardOrder(bigOrder);
    expect(result.approved).toBe(false);
    expect(result.reason).toContain('Projected aggregate exposure');
    expect(result.checks.aggregateExposureOk).toBe(false);
  });
});
