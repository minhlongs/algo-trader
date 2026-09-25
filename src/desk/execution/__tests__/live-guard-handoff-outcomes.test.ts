import { describe, it, expect, beforeEach } from 'vitest';
import {
  LiveGuardHandoffCoordinator,
  type LiveOrderHandoffRequest,
} from '../live-guard-handoff';
import { LiveExecutionGuard } from '../live-execution-guard-core';
import type { PolymarketOrder } from '../polymarket-signer';
import type { TradeSignal } from '../../polymarket/strategy-live-bridge-types';

function makeValidOrder(price = 0.50, size = 1000): PolymarketOrder {
  return {
    tokenId: '0x-token-alpha',
    price,
    size,
    side: 'BUY',
    expiration: Math.floor(Date.now() / 1000) + 3600,
    nonce: '1',
    feeRateBps: 0,
    signatureType: 0,
  };
}

function makeValidSignal(ageMs = 30): TradeSignal {
  return {
    tokenId: '0x-token-alpha',
    side: 'BUY',
    size: 1000,
    price: 0.50,
    confidence: 0.85,
    timestamp: Date.now() - ageMs,
  };
}

describe('LiveGuardHandoffCoordinator Post-Trade Outcomes & Status', () => {
  const CAPITAL = 100_000;
  let coordinator: LiveGuardHandoffCoordinator;

  beforeEach(() => {
    coordinator = new LiveGuardHandoffCoordinator({
      capitalUsdc: CAPITAL,
      maxPositionFraction: 0.02,
      maxDailyDrawdown: 0.05,
      maxConcurrentPositions: 5,
      maxConsecutiveLosses: 3,
      signalTtlMs: 200,
      rateLimitOrdersPerSec: 5,
      rateLimitBurst: 10,
    });
  });

  it('recordFillOutcome updates win metrics and resets consecutive losses', () => {
    coordinator.recordFillOutcome('strat-alpha', -100);
    coordinator.recordFillOutcome('strat-alpha', -100);
    expect(coordinator.getStatus().guardStatus.consecutiveLosses).toBe(2);

    coordinator.recordFillOutcome('strat-alpha', 300);
    expect(coordinator.getStatus().guardStatus.consecutiveLosses).toBe(0);
    expect(coordinator.getStatus().guardStatus.totalWins).toBe(1);
    expect(coordinator.getStatus().guardStatus.dailyPnl).toBe(100);
  });

  it('resetCircuit clears tripped state and restores approval', () => {
    coordinator.recordFillOutcome('strat-alpha', -100);
    coordinator.recordFillOutcome('strat-alpha', -100);
    coordinator.recordFillOutcome('strat-alpha', -100);
    expect(coordinator.getStatus().guardStatus.circuitTripped).toBe(true);

    coordinator.resetCircuit();
    expect(coordinator.getStatus().guardStatus.circuitTripped).toBe(false);
    expect(coordinator.getStatus().guardStatus.consecutiveLosses).toBe(0);

    const request: LiveOrderHandoffRequest = {
      strategyId: 'strat-alpha',
      lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
      signal: makeValidSignal(30),
      order: makeValidOrder(0.50, 1000),
    };
    expect(coordinator.evaluateLiveOrder(request).approved).toBe(true);
  });

  it('resetDaily clears accumulated daily PnL and restores approval', () => {
    coordinator.recordFillOutcome('strat-alpha', -6000);
    expect(coordinator.getStatus().guardStatus.dailyPnl).toBe(-6000);

    coordinator.resetDaily();
    expect(coordinator.getStatus().guardStatus.dailyPnl).toBe(0);

    const request: LiveOrderHandoffRequest = {
      strategyId: 'strat-alpha',
      lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
      signal: makeValidSignal(30),
      order: makeValidOrder(0.50, 1000),
    };
    expect(coordinator.evaluateLiveOrder(request).approved).toBe(true);
  });

  it('returns complete status snapshot and guard reference', () => {
    const status = coordinator.getStatus();
    expect(status.capitalUsdc).toBe(CAPITAL);
    expect(status.canOpenNewTrades).toBe(true);
    expect(status.openPositionsCount).toBe(0);
    expect(status.activeStrategyRateLimitersCount).toBe(0);
    expect(status.guardStatus.enabled).toBe(true);

    const guard = coordinator.getGuard();
    expect(guard).toBeInstanceOf(LiveExecutionGuard);
    expect(guard.getStatus().enabled).toBe(true);
  });

  it('throws error if capitalUsdc <= 0', () => {
    expect(() => new LiveGuardHandoffCoordinator({ capitalUsdc: 0 })).toThrow(/capitalUsdc must be positive/i);
    expect(() => new LiveGuardHandoffCoordinator({ capitalUsdc: -100 })).toThrow(/capitalUsdc must be positive/i);
  });
});
