/**
 * Consensus Bridge Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConsensusBridge } from '../../../src/signal/consensus-bridge';
import { LiveExecutionGuard } from '../../../src/desk/execution/live-execution-guard-core';
import type { BridgeSignalProposal } from '../../../src/signal/consensus-bridge-types';

describe('ConsensusBridge', () => {
  let guard: LiveExecutionGuard;
  let bridge: ConsensusBridge;
  const CAPITAL_USDC = 100_000;

  beforeEach(() => {
    guard = new LiveExecutionGuard({
      capitalUsdc: CAPITAL_USDC,
      maxPositionFraction: 0.10, // 10% = 10,000 USD max per position
      maxDailyDrawdown: 0.05,
      enabled: true,
    });

    bridge = new ConsensusBridge(guard, {
      capitalUsd: CAPITAL_USDC,
      minConfidence: 0.70,
      maxDrawdownThreshold: 0.05,
      maxExposureFraction: 0.40, // 40% = 40,000 USD max total exposure
    });
  });

  const makeProposal = (overrides: Partial<BridgeSignalProposal> = {}): BridgeSignalProposal => ({
    signalId: `sig-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    symbol: 'BTC-USD',
    side: 'BUY',
    price: 50,
    size: 100, // 50 * 100 = 5,000 USD (5% of capital)
    confidence: 0.85,
    source: 'swarm-consensus',
    timestamp: Date.now(),
    ...overrides,
  });

  it('approves valid signal proposal and creates PolymarketOrder', () => {
    const proposal = makeProposal({ symbol: 'ETH-USD' });
    const result = bridge.validateAndReserve(proposal);

    expect(result.approved).toBe(true);
    expect(result.signalId).toBe(proposal.signalId);
    expect(result.order).toBeDefined();
    expect(result.order?.side).toBe('BUY');
    expect(result.order?.price).toBe(50);
    expect(result.order?.size).toBe(100);
    expect(result.order?.tokenId).toBe('tok-ethusd');
    expect(result.reservedCapitalUsd).toBe(5_000);
    expect(result.currentExposureUsd).toBe(5_000);
    expect(result.maxAllowedExposureUsd).toBe(40_000);
  });

  it('rejects signal proposal below minimum confidence', () => {
    const proposal = makeProposal({ confidence: 0.65 }); // threshold is 0.70
    const result = bridge.validateAndReserve(proposal);

    expect(result.approved).toBe(false);
    expect(result.rejectionReason).toContain('Confidence 0.65 below threshold 0.7');
    expect(bridge.getExposureSummary().totalReservedUsd).toBe(0);
  });

  it('rejects proposal when price or size is non-positive', () => {
    const zeroPriceProposal = makeProposal({ price: 0 });
    const res1 = bridge.validateAndReserve(zeroPriceProposal);
    expect(res1.approved).toBe(false);
    expect(res1.rejectionReason).toContain('Invalid price or size');

    const negativeSizeProposal = makeProposal({ size: -10 });
    const res2 = bridge.validateAndReserve(negativeSizeProposal);
    expect(res2.approved).toBe(false);
    expect(res2.rejectionReason).toContain('Invalid price or size');
  });

  it('rejects proposal when current drawdown exceeds max threshold', () => {
    bridge.updateCurrentDrawdown(0.06); // 6% > 5% threshold
    const proposal = makeProposal();
    const result = bridge.validateAndReserve(proposal);

    expect(result.approved).toBe(false);
    expect(result.rejectionReason).toContain('Drawdown 0.06 exceeds threshold 0.05');
  });

  it('enforces aggregate portfolio exposure cap across multiple orders', () => {
    // Max allowed is 40,000 USD (0.40 * 100,000)
    // Order size 9,000 USD each (under single position limit of 10,000)
    for (let i = 0; i < 4; i++) {
      const prop = makeProposal({ signalId: `sig-batch-${i}`, price: 90, size: 100 }); // 9,000 USD
      const res = bridge.validateAndReserve(prop);
      expect(res.approved).toBe(true);
    }

    // Now total reserved is 36,000 USD.
    // 5th order of 9,000 USD would push to 45,000 USD > 40,000 USD
    const overflowProp = makeProposal({ signalId: 'sig-overflow', price: 90, size: 100 });
    const overflowResult = bridge.validateAndReserve(overflowProp);

    expect(overflowResult.approved).toBe(false);
    expect(overflowResult.rejectionReason).toContain('Aggregate portfolio exposure cap exceeded');
  });

  it('rejects when LiveExecutionGuard single position size limit is exceeded', () => {
    // Single order of 15,000 USD exceeds guard maxPositionFraction of 10% (10,000 USD)
    const largeProposal = makeProposal({ price: 150, size: 100 }); // 15,000 USD
    const result = bridge.validateAndReserve(largeProposal);

    expect(result.approved).toBe(false);
    expect(result.rejectionReason).toContain('exceeds max position');
  });

  it('releases reserved capital when orders complete or cancel', () => {
    const proposal = makeProposal({ signalId: 'sig-to-release', price: 50, size: 100 }); // 5,000 USD
    const res = bridge.validateAndReserve(proposal);
    expect(res.approved).toBe(true);
    expect(bridge.getExposureSummary().totalReservedUsd).toBe(5_000);

    const released = bridge.releaseReservation('sig-to-release');
    expect(released).toBe(true);
    expect(bridge.getExposureSummary().totalReservedUsd).toBe(0);
    expect(bridge.getExposureSummary().activeReservationsCount).toBe(0);
  });

  it('tracks exposure summary metrics correctly', () => {
    bridge.validateAndReserve(makeProposal({ signalId: 's1', price: 20, size: 100 })); // 2,000 USD
    bridge.validateAndReserve(makeProposal({ signalId: 's2', price: 40, size: 100 })); // 4,000 USD

    const summary = bridge.getExposureSummary();
    expect(summary.capitalUsd).toBe(100_000);
    expect(summary.totalReservedUsd).toBe(6_000);
    expect(summary.maxAllowedExposureUsd).toBe(40_000);
    expect(summary.utilizationPct).toBe((6_000 / 40_000) * 100);
    expect(summary.activeReservationsCount).toBe(2);

    bridge.clearAllReservations();
    expect(bridge.getExposureSummary().totalReservedUsd).toBe(0);
  });
});
