import { describe, it, expect } from 'vitest';
import { OrderSplittingGate } from '../../../src/desk/sor/order-splitter-gate';
import { RoutingRequest } from '../../../src/desk/sor/sor-types';

describe('OrderSplittingGate', () => {
  const gate = new OrderSplittingGate(5000, 0.15, 25);

  it('triggers splitting when order value exceeds $5,000 threshold', () => {
    // 0.1 BTC at $60,000 = $6,000 (> $5,000)
    expect(gate.shouldSplit(6000, 0.1, 100)).toBe(true);

    // 0.05 BTC at $60,000 = $3,000 (< $5,000 and 0.05/100 = 0.05% < 15%)
    expect(gate.shouldSplit(3000, 0.05, 100)).toBe(false);
  });

  it('triggers splitting when quantity exceeds 15% of top-5 depth even if notional is below $5,000', () => {
    // 20 SOL at $150 = $3,000 (under $5,000). But top-5 depth is 100 SOL (20% > 15%)
    expect(gate.shouldSplit(3000, 20, 100)).toBe(true);

    // 10 SOL at $150 = $1,500. Top-5 depth is 100 SOL (10% < 15%)
    expect(gate.shouldSplit(1500, 10, 100)).toBe(false);
  });

  it('triggers splitting when expected slippage exceeds 25 bps', () => {
    expect(gate.shouldSplit(1000, 5, 100, 30)).toBe(true);
    expect(gate.shouldSplit(1000, 5, 100, 15)).toBe(false);
  });

  it('evaluates routing requests and selects appropriate execution strategies', () => {
    const smallReq: RoutingRequest = {
      symbol: 'BTC/USDT',
      side: 'BUY',
      targetQuantity: 0.05, // $3,000
      maxSlippageBps: 50,
      urgency: 'MEDIUM',
    };
    const decisionSmall = gate.evaluateOrder(smallReq, 10.0, 60000);
    expect(decisionSmall.shouldSplit).toBe(false);
    expect(decisionSmall.recommendedStrategy).toBe('MARKET');

    // High urgency large order -> TWAP
    const urgentLargeReq: RoutingRequest = {
      symbol: 'BTC/USDT',
      side: 'BUY',
      targetQuantity: 0.2, // $12,000
      maxSlippageBps: 50,
      urgency: 'HIGH',
    };
    const decisionUrgent = gate.evaluateOrder(urgentLargeReq, 10.0, 60000);
    expect(decisionUrgent.shouldSplit).toBe(true);
    expect(decisionUrgent.recommendedStrategy).toBe('TWAP');

    // Massive order -> Iceberg
    const massiveReq: RoutingRequest = {
      symbol: 'BTC/USDT',
      side: 'BUY',
      targetQuantity: 1.0, // $60,000 (> 4x threshold)
      maxSlippageBps: 50,
      urgency: 'LOW',
    };
    const decisionMassive = gate.evaluateOrder(massiveReq, 10.0, 60000);
    expect(decisionMassive.shouldSplit).toBe(true);
    expect(decisionMassive.recommendedStrategy).toBe('ICEBERG');
  });

  it('honors explicitly requested strategy over automatic recommendation', () => {
    const req: RoutingRequest = {
      symbol: 'ETH/USDT',
      side: 'SELL',
      targetQuantity: 0.5,
      maxSlippageBps: 50,
      urgency: 'LOW',
      executionStrategy: 'VWAP',
    };
    const decision = gate.evaluateOrder(req, 100.0, 3000);
    expect(decision.shouldSplit).toBe(true);
    expect(decision.recommendedStrategy).toBe('VWAP');
  });
});
