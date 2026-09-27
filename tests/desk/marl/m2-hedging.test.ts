/**
 * Milestone 2 Unit Test Suite: Cross-Venue Delta-Neutral Hedging & Inventory Skew Control.
 * Tests inventory delta tracker, tolerance coordinator, atomic execution handler,
 * compensatory unwind handler, and full integration cycles.
 *
 * Conforms to AGENTS.md Hard Rules: zero :any, zero console.log.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  InventoryDeltaTracker,
  CrossVenueNetDeltaTracker,
  DeltaTrackerConfigSchema,
  ToleranceBandRebalanceTrigger,
  DeltaNeutralCoordinator,
  DeltaNeutralCoordinatorConfigSchema,
  HedgeExecutionHandler,
  AtomicCrossVenueHedgeDispatcher,
  HedgeExecutionConfigSchema,
  HedgeCompensatoryUnwindHandler,
  CompensatoryUnwindHandler,
  CompensatoryUnwindConfigSchema,
} from '../../../src/desk/marl/hedging';
import type {
  IExchangeConnector,
  ExchangeOrderParams,
  ExchangeOrderResult,
  ExchangeBalance,
  SupportedExchangeId,
} from '../../../src/desk/arbitrage/connectors/types';
import { OrderPlacementError } from '../../../src/desk/arbitrage/connectors/types';

class MockExchangeConnector implements IExchangeConnector {
  public exchangeId: SupportedExchangeId;
  public placeOrderCalls: ExchangeOrderParams[] = [];
  public cancelOrderCalls: { orderId: string; symbol: string }[] = [];
  public simulatedLatencyMs = 15;
  public fillFraction = 1.0;
  public shouldFail = false;
  public shouldTimeout = false;
  public failureError?: Error;
  public balances: ExchangeBalance = {
    USDT: { free: 100_000, used: 0, total: 100_000 },
    BTC: { free: 5, used: 0, total: 5 },
  };

  constructor(exchangeId: SupportedExchangeId = 'binance') {
    this.exchangeId = exchangeId;
  }

  async placeOrder(params: ExchangeOrderParams): Promise<ExchangeOrderResult> {
    this.placeOrderCalls.push(params);
    if (this.shouldTimeout) {
      await new Promise((r) => setTimeout(r, 450));
    }
    if (this.shouldFail) {
      throw this.failureError ?? new OrderPlacementError('Simulated order failure', this.exchangeId);
    }
    const filled = Number((params.amount * this.fillFraction).toFixed(4));
    const remaining = Number((params.amount - filled).toFixed(4));
    return {
      orderId: `ord-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      exchange: this.exchangeId,
      symbol: params.symbol,
      side: params.side,
      price: params.price ?? 50_000,
      amount: params.amount,
      filled,
      remaining,
      status: filled === params.amount ? 'closed' : filled > 0 ? 'open' : 'rejected',
      timestamp: Date.now(),
    };
  }

  async cancelOrder(orderId: string, symbol: string): Promise<boolean> {
    this.cancelOrderCalls.push({ orderId, symbol });
    return true;
  }

  async fetchOrder(orderId: string, symbol: string): Promise<ExchangeOrderResult> {
    return {
      orderId,
      exchange: this.exchangeId,
      symbol,
      side: 'buy',
      price: 50_000,
      amount: 1.0,
      filled: 1.0,
      remaining: 0,
      status: 'closed',
      timestamp: Date.now(),
    };
  }

  async fetchBalance(): Promise<ExchangeBalance> {
    return this.balances;
  }

  async getLatencyMs(): Promise<number> {
    return this.simulatedLatencyMs;
  }
}

describe('Milestone 2: Delta-Neutral Hedging & Inventory Skew Control', () => {
  // ==========================================================================
  // Group 1: Delta Tracking & Aggregation (T1 - T8)
  // ==========================================================================
  describe('Group 1: Inventory Delta Tracking & Multi-Venue Aggregation', () => {
    let tracker: InventoryDeltaTracker;

    beforeEach(() => {
      tracker = new InventoryDeltaTracker({ deltaThreshold: 0.10 });
    });

    it('T1: computes Polymarket long binary YES position delta', () => {
      tracker.updatePolymarketPosition('BTC-2026-YES', 100, 0.55, 1.0);
      expect(tracker.getNetDelta()).toBe(100);
      const snapshot = tracker.getSnapshot();
      expect(snapshot.polyDelta).toBe(100);
      expect(snapshot.cexDelta).toBe(0);
      expect(snapshot.rebalanceRequired).toBe(true);
    });

    it('T2: computes Polymarket short binary NO position delta', () => {
      tracker.updatePolymarketPosition('BTC-2026-NO', -50, 0.45, 1.0);
      expect(tracker.getNetDelta()).toBe(-50);
      const snapshot = tracker.getSnapshot();
      expect(snapshot.polyDelta).toBe(-50);
      expect(snapshot.polymarketDelta).toBe(-50);
    });

    it('T3: computes CEX linear spot/perpetual delta', () => {
      tracker.updateCexPosition('binance', 'BTC/USDT', 2.5, 50_000, 1.0);
      expect(tracker.getNetDelta()).toBe(2.5);
      const snapshot = tracker.getSnapshot();
      expect(snapshot.cexDelta).toBe(2.5);
      expect(snapshot.polyDelta).toBe(0);
    });

    it('T4: multi-venue aggregation combines Poly and CEX into net delta', () => {
      tracker.updatePolymarketPosition('BTC-YES', 1.5, 0.50, 1.0);
      tracker.updateCexPosition('binance', 'BTC/USDT', -1.5, 50_000, 1.0);
      expect(tracker.getNetDelta()).toBe(0.0);
      const snapshot = tracker.getSnapshot();
      expect(snapshot.netDelta).toBe(0.0);
      expect(snapshot.rebalanceRequired).toBe(false);
    });

    it('T5: computes gross notional USD across mixed venues', () => {
      tracker.updatePolymarketPosition('BTC-YES', 10, 0.60, 1.0); // 10 * 0.60 = 6 USD
      tracker.updateCexPosition('binance', 'BTC/USDT', 0.1, 50_000, 1.0); // 0.1 * 50_000 = 5000 USD
      const snapshot = tracker.getSnapshot();
      expect(snapshot.grossNotionalUsd).toBe(5006);
    });

    it('T6: position snapshot returns defensive copy with venue summaries', () => {
      tracker.updatePolymarketPosition('BTC-YES', 5, 0.50);
      tracker.updateCexPosition('bybit', 'BTC/USDT', -3, 50_000);
      const snapshot = tracker.getSnapshot();
      expect(snapshot.positions.length).toBe(2);
      expect(snapshot.venueSummaries.polymarket?.totalPositions).toBe(1);
      expect(snapshot.venueSummaries.bybit?.totalPositions).toBe(1);
      // Mutating snapshot positions does not alter internal state
      snapshot.positions.pop();
      expect(tracker.getSnapshot().positions.length).toBe(2);
    });

    it('T7: reset clears all positions and resets net delta to zero', () => {
      tracker.updatePolymarketPosition('BTC-YES', 20, 0.50);
      expect(tracker.getNetDelta()).toBe(20);
      tracker.reset();
      expect(tracker.getNetDelta()).toBe(0);
      expect(tracker.getSnapshot().positions.length).toBe(0);
    });

    it('T8: handles micro-lot sizes and extreme notional scale without NaN', () => {
      tracker.updateCexPosition('binance', 'BTC/USDT', 0.0001, 50_000);
      tracker.updatePolymarketPosition('SAT-YES', 1_000_000, 0.001);
      const snapshot = tracker.getSnapshot();
      expect(Number.isNaN(snapshot.netDelta)).toBe(false);
      expect(Number.isFinite(snapshot.grossNotionalUsd)).toBe(true);
      expect(snapshot.marginUtilization).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================================================
  // Group 2: Tolerance Band & Coordinator Rebalance (T9 - T16)
  // ==========================================================================
  describe('Group 2: Tolerance Bands, Hysteresis & Coordinator', () => {
    let coordinator: DeltaNeutralCoordinator;
    let mockBinance: MockExchangeConnector;
    let mockBybit: MockExchangeConnector;

    beforeEach(() => {
      mockBinance = new MockExchangeConnector('binance');
      mockBybit = new MockExchangeConnector('bybit');
      coordinator = new DeltaNeutralCoordinator({
        deltaThreshold: 0.10,
        hysteresisRatio: 0.50,
      });
      coordinator.registerConnector('binance', mockBinance);
      coordinator.registerConnector('bybit', mockBybit);
    });

    it('T9: within tolerance band triggers no rebalance', () => {
      const evalResult = coordinator.evaluateTolerance(0.08);
      expect(evalResult.triggerRebalance).toBe(false);
      expect(evalResult.targetHedgeAmount).toBe(0);
    });

    it('T10: positive net delta breach triggers negative hedge amount', () => {
      const evalResult = coordinator.evaluateTolerance(0.25);
      expect(evalResult.triggerRebalance).toBe(true);
      expect(evalResult.targetHedgeAmount).toBe(-0.25);
    });

    it('T11: negative net delta breach triggers positive hedge amount', () => {
      const evalResult = coordinator.evaluateTolerance(-0.30);
      expect(evalResult.triggerRebalance).toBe(true);
      expect(evalResult.targetHedgeAmount).toBe(0.30);
    });

    it('T12: hysteresis band holds rebalancing state during delta oscillation', () => {
      // Step 1: breach outer threshold
      const r1 = coordinator.evaluateTolerance(0.12);
      expect(r1.triggerRebalance).toBe(true);
      // Step 2: delta drops to 0.08 (below outer 0.10, but above inner 0.05) -> still rebalancing
      const r2 = coordinator.evaluateTolerance(0.08);
      expect(r2.triggerRebalance).toBe(true);
      expect(r2.targetHedgeAmount).toBe(-0.08);
    });

    it('T13: hysteresis band terminates once inside inner threshold', () => {
      coordinator.evaluateTolerance(0.12); // Enter rebalance
      // Drop inside inner threshold 0.05 (0.10 * 0.50)
      const r3 = coordinator.evaluateTolerance(0.04);
      expect(r3.triggerRebalance).toBe(false);
      expect(r3.targetHedgeAmount).toBe(0);
    });

    it('T14: suppresses hedge if target amount < min lot size', () => {
      const coord = new DeltaNeutralCoordinator({
        deltaThreshold: 0.0005,
        minLotSize: 0.001,
      });
      const evalResult = coord.evaluateTolerance(0.0008);
      expect(evalResult.triggerRebalance).toBe(false);
      expect(evalResult.targetHedgeAmount).toBe(0);
    });

    it('T15: selects optimal CEX venue based on fee and latency', async () => {
      mockBinance.simulatedLatencyMs = 20;
      mockBybit.simulatedLatencyMs = 40;
      coordinator.setTakerFee('binance', 4.0);
      coordinator.setTakerFee('bybit', 6.0);

      const venue = await coordinator.selectOptimalVenue(0.5, 'BTC/USDT', 50_000);
      expect(venue).toBe('binance');
    });

    it('T16: state machine transitions through valid lifecycle', async () => {
      expect(coordinator.getState()).toBe('IDLE');
      const tracker = new InventoryDeltaTracker({ deltaThreshold: 0.10 });
      tracker.updatePolymarketPosition('BTC-YES', 0.20, 0.50);
      const snapshot = tracker.getSnapshot();

      const result = await coordinator.coordinate(snapshot, 'BTC/USDT', 50_000, async (target, venue) => {
        return {
          hedgeId: 'hdg-test',
          venue: venue as 'binance',
          symbol: 'BTC/USDT',
          side: target < 0 ? 'sell' : 'buy',
          requestedAmount: Math.abs(target),
          filledAmount: Math.abs(target),
          avgFillPrice: 50_000,
          latencyMs: 15,
          status: 'FILLED',
          residualDelta: 0,
        };
      });

      expect(result.triggered).toBe(true);
      expect(result.finalState).toBe('REBALANCED');
      expect(coordinator.getState()).toBe('REBALANCED');
    });
  });

  // ==========================================================================
  // Group 3: Atomic Cross-Venue Execution (T17 - T24)
  // ==========================================================================
  describe('Group 3: Atomic Taker Execution Handler', () => {
    let handler: HedgeExecutionHandler;
    let mockConnector: MockExchangeConnector;

    beforeEach(() => {
      mockConnector = new MockExchangeConnector('binance');
      handler = new HedgeExecutionHandler({
        orderTimeoutMs: 300,
        maxLatencyMs: 200,
      });
      handler.registerConnector('binance', mockConnector);
    });

    it('T17: dispatches full fill market order to connector', async () => {
      mockConnector.fillFraction = 1.0;
      const report = await handler.dispatchHedge(-0.25, 'binance', 'BTC/USDT');
      expect(report.status).toBe('FILLED');
      expect(report.side).toBe('sell');
      expect(report.filledAmount).toBe(0.25);
      expect(report.residualDelta).toBe(0);
    });

    it('T18: formats correct parameters for market order', async () => {
      await handler.dispatchHedge(0.50, 'binance', 'ETH/USDT');
      expect(mockConnector.placeOrderCalls.length).toBe(1);
      const call = mockConnector.placeOrderCalls[0]!;
      expect(call.symbol).toBe('ETH/USDT');
      expect(call.side).toBe('buy');
      expect(call.type).toBe('market');
      expect(call.amount).toBe(0.50);
    });

    it('T19: records execution round-trip latency in ms', async () => {
      const report = await handler.dispatchHedge(-0.10, 'binance');
      expect(report.latencyMs).toBeGreaterThanOrEqual(1);
    });

    it('T20: detects partial fill from connector result and computes residual delta', async () => {
      mockConnector.fillFraction = 0.60;
      const report = await handler.dispatchHedge(-0.50, 'binance', 'BTC/USDT');
      expect(report.status).toBe('PARTIAL');
      expect(report.filledAmount).toBe(0.30);
      // Requested sell of 0.50, filled 0.30, residual is -0.20
      expect(report.residualDelta).toBe(-0.20);
    });

    it('T21: aborts and returns FAILED when timeout exceeded', async () => {
      mockConnector.shouldTimeout = true;
      const handlerWithShortTimeout = new HedgeExecutionHandler({ orderTimeoutMs: 50 });
      handlerWithShortTimeout.registerConnector('binance', mockConnector);

      const report = await handlerWithShortTimeout.dispatchHedge(-0.15, 'binance');
      expect(report.status).toBe('FAILED');
      expect(report.error).toContain('timeout');
      expect(report.residualDelta).toBe(-0.15);
    });

    it('T22: handles connector network error gracefully', async () => {
      mockConnector.shouldFail = true;
      const report = await handler.dispatchHedge(0.30, 'binance');
      expect(report.status).toBe('FAILED');
      expect(report.error).toBeDefined();
      expect(report.residualDelta).toBe(0.30);
    });

    it('T23: pre-trade latency check trips circuit breaker', async () => {
      mockConnector.simulatedLatencyMs = 250; // exceeds maxLatencyMs = 200
      const report = await handler.dispatchHedge(0.20, 'binance');
      expect(report.status).toBe('FAILED');
      expect(report.error).toBe('LATENCY_EXCEEDED');
      expect(handler.isCircuitBroken('binance')).toBe(true);
    });

    it('T24: circuit breaker prevents dispatch while tripped', async () => {
      handler.tripCircuit('binance', 5000);
      expect(handler.isCircuitBroken('binance')).toBe(true);
      const report = await handler.dispatchHedge(0.20, 'binance');
      expect(report.status).toBe('FAILED');
      expect(report.error).toBe('CIRCUIT_BROKEN');
    });
  });

  // ==========================================================================
  // Group 4: Compensatory Unwind & Residual Delta (T25 - T35)
  // ==========================================================================
  describe('Group 4: Compensatory Unwind & Residual Delta Handling', () => {
    let unwindHandler: HedgeCompensatoryUnwindHandler;
    let mockFallbackConnector: MockExchangeConnector;

    beforeEach(() => {
      mockFallbackConnector = new MockExchangeConnector('bybit');
      unwindHandler = new HedgeCompensatoryUnwindHandler({
        maxRetries: 3,
        fallbackVenue: 'bybit',
        emergencyDeltaThreshold: 1.0,
      });
      unwindHandler.setConnectorResolver((venue) => {
        if (venue === 'bybit') return mockFallbackConnector;
        return undefined;
      });
    });

    it('T25: returns none action and zero unwound on full fill', async () => {
      const report = {
        hedgeId: 'hdg-1',
        venue: 'binance',
        symbol: 'BTC/USDT',
        side: 'sell' as const,
        requestedAmount: 0.50,
        filledAmount: 0.50,
        avgFillPrice: 50_000,
        latencyMs: 15,
        status: 'FILLED' as const,
        residualDelta: 0,
      };
      const result = await unwindHandler.executeUnwind(report);
      expect(result.actionTaken).toBe('none');
      expect(result.unwoundAmount).toBe(0);
      expect(result.unwindSuccess).toBe(true);
    });

    it('T26: routes residual delta to secondary CEX upon partial fill', async () => {
      const report = {
        hedgeId: 'hdg-2',
        venue: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy' as const,
        requestedAmount: 1.0,
        filledAmount: 0.40,
        avgFillPrice: 50_000,
        latencyMs: 15,
        status: 'PARTIAL' as const,
        residualDelta: 0.60,
      };
      const result = await unwindHandler.executeUnwind(report);
      expect(result.actionTaken).toBe('secondary_cex_filled');
      expect(result.unwoundAmount).toBe(0.60);
      expect(result.residualDelta).toBe(0);
    });

    it('T27: places secondary market order via fallback connector', async () => {
      const report = {
        hedgeId: 'hdg-3',
        venue: 'binance',
        symbol: 'BTC/USDT',
        side: 'sell' as const,
        requestedAmount: 0.50,
        filledAmount: 0.20,
        avgFillPrice: 50_000,
        latencyMs: 15,
        status: 'PARTIAL' as const,
        residualDelta: -0.30,
      };
      await unwindHandler.executeUnwind(report);
      expect(mockFallbackConnector.placeOrderCalls.length).toBe(1);
      const call = mockFallbackConnector.placeOrderCalls[0]!;
      expect(call.amount).toBe(0.30);
      expect(call.side).toBe('sell');
    });

    it('T28: calculates quote skew for positive residual delta (vulnerable ask)', () => {
      const skew = unwindHandler.calculateQuoteSkewAdjustment(0.50);
      expect(skew.vulnerableSide).toBe('ask');
      expect(skew.askSpreadMultiplier).toBeGreaterThan(1.0);
      expect(skew.bidSpreadMultiplier).toBe(1.0);
    });

    it('T29: calculates quote skew for negative residual delta (vulnerable bid)', () => {
      const skew = unwindHandler.calculateQuoteSkewAdjustment(-0.50);
      expect(skew.vulnerableSide).toBe('bid');
      expect(skew.bidSpreadMultiplier).toBeGreaterThan(1.0);
      expect(skew.askSpreadMultiplier).toBe(1.0);
    });

    it('T30: clamps quote skew multiplier to max ceiling', () => {
      const skew = unwindHandler.calculateQuoteSkewAdjustment(100.0);
      expect(skew.askSpreadMultiplier).toBeLessThanOrEqual(3.0);
    });

    it('T31: triggers emergency quote cancellation callback on high residual', async () => {
      const cancelSpy = vi.fn().mockResolvedValue(4);
      unwindHandler.setEmergencyCancelCallback(cancelSpy);

      const report = {
        hedgeId: 'hdg-emerg',
        venue: 'binance',
        symbol: 'BTC/USDT',
        side: 'sell' as const,
        requestedAmount: 2.0,
        filledAmount: 0,
        avgFillPrice: 0,
        latencyMs: 15,
        status: 'FAILED' as const,
        residualDelta: -2.0, // exceeds emergencyDeltaThreshold = 1.0
      };

      await unwindHandler.executeUnwind(report);
      expect(cancelSpy).toHaveBeenCalledTimes(1);
    });

    it('T32: tracks retry counter across failed sweep attempts', async () => {
      mockFallbackConnector.shouldFail = true;
      const report = {
        hedgeId: 'hdg-retry',
        venue: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy' as const,
        requestedAmount: 0.10,
        filledAmount: 0,
        avgFillPrice: 0,
        latencyMs: 15,
        status: 'FAILED' as const,
        residualDelta: 0.10,
      };

      const result = await unwindHandler.executeUnwind(report);
      expect(result.retryCount).toBe(3);
    });

    it('T33: full recovery of completely unfilled (0% fill / FAILED) order', async () => {
      const report = {
        hedgeId: 'hdg-zero',
        venue: 'binance',
        symbol: 'BTC/USDT',
        side: 'sell' as const,
        requestedAmount: 0.10,
        filledAmount: 0,
        avgFillPrice: 0,
        latencyMs: 15,
        status: 'FAILED' as const,
        residualDelta: -0.10,
      };

      const result = await unwindHandler.executeUnwind(report);
      expect(result.actionTaken).toBe('secondary_cex_filled');
      expect(result.unwoundAmount).toBe(0.10);
      expect(result.residualDelta).toBe(0);
    });

    it('T34: falls back to emergency liquidation on exhausted retries', async () => {
      mockFallbackConnector.shouldFail = true;
      const report = {
        hedgeId: 'hdg-exhaust',
        venue: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy' as const,
        requestedAmount: 0.20,
        filledAmount: 0,
        avgFillPrice: 0,
        latencyMs: 15,
        status: 'FAILED' as const,
        residualDelta: 0.20,
      };

      const result = await unwindHandler.executeUnwind(report);
      expect(result.actionTaken).toBe('emergency_market');
      expect(result.error).toBeDefined();
    });

    it('T35: ignores floating-point precision residual (< 1e-6)', async () => {
      const report = {
        hedgeId: 'hdg-precision',
        venue: 'binance',
        symbol: 'BTC/USDT',
        side: 'sell' as const,
        requestedAmount: 0.10,
        filledAmount: 0.099999999,
        avgFillPrice: 50_000,
        latencyMs: 15,
        status: 'PARTIAL' as const,
        residualDelta: 1e-8,
      };

      const result = await unwindHandler.executeUnwind(report);
      expect(result.actionTaken).toBe('none');
      expect(result.unwoundAmount).toBe(0);
    });
  });

  // ==========================================================================
  // Group 5: Integration, Schemas & End-to-End Cycle (T36 - T40)
  // ==========================================================================
  describe('Group 5: Integration, Config Schemas & Full Delta Recovery Cycle', () => {
    it('T36: rapid inventory oscillation stress without chatter', () => {
      const trigger = new ToleranceBandRebalanceTrigger(0.10, 0.50);
      let count = 0;
      // Oscillate within hysteresis band [0.06, 0.09] after initial breach
      trigger.evaluate(0.15); // trigger
      count++;
      for (let i = 0; i < 50; i++) {
        const evalRes = trigger.evaluate(i % 2 === 0 ? 0.09 : 0.06);
        if (evalRes.triggerRebalance) count++;
      }
      expect(count).toBe(51); // holds state consistently without flip-flop reset
    });

    it('T37: Zod schemas validate bounds and reject invalid configs', () => {
      expect(() => DeltaTrackerConfigSchema.parse({ deltaThreshold: -0.1 })).toThrow();
      expect(() => DeltaNeutralCoordinatorConfigSchema.parse({ hysteresisRatio: 1.5 })).toThrow();
      expect(() => HedgeExecutionConfigSchema.parse({ maxLatencyMs: -10 })).toThrow();
      expect(() => CompensatoryUnwindConfigSchema.parse({ maxRetries: -1 })).toThrow();
    });

    it('T38: handles connector balance filtering during venue selection', async () => {
      const coord = new DeltaNeutralCoordinator();
      const mockPoor = new MockExchangeConnector('binance');
      mockPoor.balances = { USDT: { free: 0, used: 0, total: 0 }, BTC: { free: 0, used: 0, total: 0 } };
      const mockRich = new MockExchangeConnector('bybit');
      mockRich.balances = { USDT: { free: 100_000, used: 0, total: 100_000 }, BTC: { free: 5, used: 0, total: 5 } };

      coord.registerConnector('binance', mockPoor);
      coord.registerConnector('bybit', mockRich);

      const venue = await coord.selectOptimalVenue(0.50, 'BTC/USDT', 50_000);
      expect(venue).toBe('bybit');
    });

    it('T39: dual constructor supports both number and config object', () => {
      const handlerFromNumber = new CompensatoryUnwindHandler(5);
      const handlerFromConfig = new CompensatoryUnwindHandler({ maxRetries: 5 });
      expect(handlerFromNumber).toBeInstanceOf(HedgeCompensatoryUnwindHandler);
      expect(handlerFromConfig).toBeInstanceOf(HedgeCompensatoryUnwindHandler);
    });

    it('T40: end-to-end closed-loop cycle: fill -> breach -> partial hedge -> unwind -> neutral', async () => {
      const tracker = new CrossVenueNetDeltaTracker({ deltaThreshold: 0.10 });
      const coord = new DeltaNeutralCoordinator({ deltaThreshold: 0.10 });
      const execHandler = new AtomicCrossVenueHedgeDispatcher();
      const unwind = new CompensatoryUnwindHandler(3);

      const mockCex1 = new MockExchangeConnector('binance');
      mockCex1.fillFraction = 0.50; // partial fill 50%
      const mockCex2 = new MockExchangeConnector('bybit');
      mockCex2.fillFraction = 1.00; // secondary full fill

      coord.registerConnector('binance', mockCex1);
      coord.registerConnector('bybit', mockCex2);
      execHandler.registerConnector('binance', mockCex1);
      execHandler.registerConnector('bybit', mockCex2);
      unwind.setConnectorResolver((v) => (v === 'bybit' ? mockCex2 : undefined));

      // 1. Polymarket maker fill occurs
      tracker.updatePolymarketPosition('BTC-YES', 0.20, 0.50);
      expect(tracker.getNetDelta()).toBe(0.20);
      const snapshot = tracker.getSnapshot();
      expect(snapshot.rebalanceRequired).toBe(true);

      // 2. Coordinator detects breach and coordinates hedge
      const coordResult = await coord.coordinate(snapshot, 'BTC/USDT', 50_000, async (target, venue) => {
        return execHandler.dispatchHedge(target, venue, 'BTC/USDT');
      });

      expect(coordResult.triggered).toBe(true);
      expect(coordResult.report?.status).toBe('PARTIAL');
      expect(coordResult.report?.filledAmount).toBe(0.10);
      expect(coordResult.report?.residualDelta).toBe(-0.10);

      // 3. Update tracker with partial fill on primary venue
      tracker.updateCexPosition('binance', 'BTC/USDT', -coordResult.report!.filledAmount, 50_000);
      expect(tracker.getNetDelta()).toBe(0.10); // Still 0.10 left

      // 4. Trigger compensatory unwind for residual
      const unwindResult = await unwind.executeUnwind(coordResult.report!);
      expect(unwindResult.unwindSuccess).toBe(true);
      expect(unwindResult.actionTaken).toBe('secondary_cex_filled');
      expect(unwindResult.unwoundAmount).toBe(0.10);

      // 5. Update tracker with secondary venue fill
      tracker.updateCexPosition('bybit', 'BTC/USDT', -unwindResult.unwoundAmount, 50_000);
      expect(tracker.getNetDelta()).toBe(0.0);
      expect(tracker.getSnapshot().rebalanceRequired).toBe(false);
    });
  });
});
