/**
 * Unit tests for LiveExecutionGuard enforcement across TriModeDispatcher,
 * OrderDispatcher, SynchronizedRiskGate, and UnifiedTradingLoop.
 */

import { describe, it, expect } from 'vitest';
import { LiveExecutionGuard } from '../live-execution-guard';
import { TriModeDispatcher } from '../tri-mode-dispatcher';
import { OrderDispatcher } from '../order-dispatcher';
import { SynchronizedRiskGate } from '../../orchestrator/synchronized-risk-gate';
import { UnifiedTradingLoop } from '../../orchestrator/unified-trading-loop';
import type { UnifiedTradeIntent } from '../../orchestrator/orchestrator-types';

function makeIntent(overrides: Partial<UnifiedTradeIntent> = {}): UnifiedTradeIntent {
  return {
    intentId: 'intent-guard-1',
    engineId: 'arbitrage',
    symbol: 'poly-yes-1',
    venue: 'polymarket_clob',
    side: 'BUY',
    quantity: 100,
    price: 0.5,
    urgency: 'HIGH',
    expectedEdgeBps: 25,
    expectedSharpe: 2.0,
    timeToExpiryMs: 30000,
    expiresAt: Date.now() + 30000,
    orderType: 'LIMIT',
    isRiskReducing: false,
    ...overrides,
  };
}

describe('TriModeDispatcher & OrderDispatcher LiveExecutionGuard enforcement', () => {
  it('fails closed in LIVE mode when a LiveExecutionGuard is attached with enabled: false (default)', () => {
    const disabledGuard = new LiveExecutionGuard({ capitalUsdc: 5000 });
    const dispatcher = new TriModeDispatcher('LIVE', disabledGuard);

    const res = dispatcher.dispatch(makeIntent({ quantity: 10, price: 0.5 }));

    expect(res.status).toBe('REJECTED');
    expect(res.executedQuantity).toBe(0);
    expect(res.error).toContain('not enabled');
    expect(dispatcher.getLiveApiCallsCount()).toBe(0);
  });

  it('rejects LIVE dispatch and skips liveApiCallsCount when LiveExecutionGuard blocks position size', () => {
    // capital $500 * maxPositionFraction 0.10 = $50 max order size; order is 200 * 0.50 = $100
    const guard = new LiveExecutionGuard({ enabled: true, capitalUsdc: 500, maxPositionFraction: 0.10 });
    const dispatcher = new TriModeDispatcher('LIVE', guard);

    const res = dispatcher.dispatch(makeIntent({ quantity: 200, price: 0.5 }));

    expect(res.status).toBe('REJECTED');
    expect(res.executedQuantity).toBe(0);
    expect(res.feeUsd).toBe(0);
    expect(res.error).toContain('exceeds max position');
    expect(dispatcher.getLiveApiCallsCount()).toBe(0);
  });

  it('rejects LIVE dispatch via OrderDispatcher when circuit breaker is tripped', () => {
    const guard = new LiveExecutionGuard({ enabled: true, capitalUsdc: 5000, maxConsecutiveLosses: 2 });
    guard.recordLoss(-10);
    guard.recordLoss(-10);
    expect(guard.getStatus().circuitTripped).toBe(true);

    const orderDispatcher = new OrderDispatcher({ initialMode: 'LIVE', liveGuard: guard });
    const res = orderDispatcher.dispatchOrder(makeIntent({ quantity: 10, price: 0.5 }));

    expect(res.status).toBe('REJECTED');
    expect(res.executedQuantity).toBe(0);
    expect(res.error).toContain('Circuit breaker tripped');
    expect(orderDispatcher.getLiveApiCallsCount()).toBe(0);
    expect(orderDispatcher.getSignalHistory()).toHaveLength(1);
    expect(orderDispatcher.getSignalHistory()[0]?.result.status).toBe('REJECTED');
  });

  it('approves LIVE dispatch and increments liveApiCallsCount when within guard limits', () => {
    const guard = new LiveExecutionGuard({ enabled: true, capitalUsdc: 5000, maxPositionFraction: 0.10 });
    const dispatcher = new TriModeDispatcher('LIVE', guard);

    const res = dispatcher.dispatch(makeIntent({ quantity: 100, price: 0.5 }));

    expect(res.status).toBe('FILLED');
    expect(res.executedQuantity).toBe(100);
    expect(dispatcher.getLiveApiCallsCount()).toBe(1);
  });

  it('does not block PAPER or SHADOW virtual fills even when liveGuard circuit is tripped', () => {
    const guard = new LiveExecutionGuard({ enabled: true, capitalUsdc: 500, maxConsecutiveLosses: 1 });
    guard.recordLoss(-5);

    const paperDispatcher = new TriModeDispatcher('PAPER', guard);
    const shadowDispatcher = new TriModeDispatcher('SHADOW', guard);

    expect(paperDispatcher.dispatch(makeIntent()).status).toBe('FILLED');
    expect(shadowDispatcher.dispatch(makeIntent()).status).toBe('FILLED');
    expect(paperDispatcher.getVirtualFillsCount()).toBe(1);
    expect(shadowDispatcher.getVirtualFillsCount()).toBe(1);
  });
});

describe('SynchronizedRiskGate & UnifiedTradingLoop LiveExecutionGuard enforcement', () => {
  it('rejects validateOrder when LiveExecutionGuard daily drawdown limit is breached', () => {
    const guard = new LiveExecutionGuard({ enabled: true, capitalUsdc: 1000, maxDailyDrawdown: 0.05 });
    guard.recordLoss(-60); // 6% daily drawdown >= 5% limit

    const gate = new SynchronizedRiskGate({
      totalNavUsd: 100000,
      liquidCashUsd: 30000,
      liveGuard: guard,
    });

    const verdict = gate.validateOrder(makeIntent({ quantity: 20, price: 0.5 }));

    expect(verdict.approved).toBe(false);
    expect(verdict.reason).toContain('Daily drawdown');
  });

  it('evaluates LiveExecutionGuard against the tier-scaled quantity in ALERT tier', () => {
    // Max position = $1000 * 0.10 = $100.
    // Raw intent = 120 * $1.00 = $120 (would fail unscaled), but ALERT scales by 0.75 -> 90 * $1.00 = $90 (passes).
    const guard = new LiveExecutionGuard({ enabled: true, capitalUsdc: 1000, maxPositionFraction: 0.10 });
    const gate = new SynchronizedRiskGate({
      totalNavUsd: 100000,
      liquidCashUsd: 30000,
      liveGuard: guard,
    });
    gate.setTier('ALERT');

    const verdict = gate.validateOrder(
      makeIntent({ quantity: 120, price: 1.0, isRiskReducing: true }),
    );

    expect(verdict.approved).toBe(true);
    expect(verdict.scaledQuantity).toBe(90);
  });

  it('wires LiveExecutionGuard through UnifiedTradingLoop and halts step before dispatch on breach', () => {
    const guard = new LiveExecutionGuard({ enabled: true, capitalUsdc: 1000, maxPositionFraction: 0.05 });
    const loop = new UnifiedTradingLoop('LIVE', 100000, 30000, guard);

    // Order size = 200 * $0.50 = $100 > $50 max position
    const stepRes = loop.step(makeIntent({ quantity: 200, price: 0.5 }));

    expect(stepRes.enqueued).toBe(true);
    expect(stepRes.verdict.approved).toBe(false);
    expect(stepRes.verdict.reason).toContain('exceeds max position');
    expect(stepRes.dispatch).toBeUndefined();
    expect(loop.dispatcher.getLiveApiCallsCount()).toBe(0);
  });
});
