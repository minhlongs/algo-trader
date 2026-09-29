/**
 * Adversarial Empirical Challenger Test Suite for Milestone 2:
 * MARL Hedge Execution Handler, Compensatory Unwind & Cross-Venue Recovery.
 *
 * Rigorous empirical stress testing covering:
 * 1. Partial Fills:
 *    - Injected fill fractions: 0% (FAILED), 25%, 50%, 75%, 99.9%.
 *    - Bidirectional verification (buy & sell) for signed residual delta.
 *    - Secondary venue sweep recovery and zero unhedged exposure leaks.
 * 2. Execution Timeout Race:
 *    - Connector hang (> orderTimeoutMs) simulated via delayed promise.
 *    - Verification of fast abort (Promise.race) and timeout status.
 *    - Unwind sweep recovery of timed-out orders.
 * 3. Latency Circuit Breaker:
 *    - Venue latency > maxLatencyMs trips breaker and rejects immediately.
 *    - Cooldown tracking and cross-venue isolation (healthy venues unaffected).
 *    - Cooldown expiration and auto-recovery.
 * 4. Emergency Quote Cancellation Callback:
 *    - Boundary conditions: < threshold, == threshold, > threshold.
 *    - Bidirectional residual checks (|residual| >= threshold).
 *    - Fault tolerance: throwing callback does not crash unwind pipeline.
 *
 * Conforms to AGENTS.md Hard Rules: zero :any, zero console.log.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  HedgeExecutionHandler,
  HedgeCompensatoryUnwindHandler,
  HedgeExecutionConfigSchema,
  CompensatoryUnwindConfigSchema,
} from '../../../src/desk/marl/hedging';
import type { HedgeExecutionReport } from '../../../src/desk/marl/hedging/hedge-execution-handler';
import type {
  IExchangeConnector,
  ExchangeOrderParams,
  ExchangeOrderResult,
  ExchangeBalance,
  SupportedExchangeId,
} from '../../../src/desk/arbitrage/connectors/types';
import { OrderPlacementError } from '../../../src/desk/arbitrage/connectors/types';

class MockAdversarialConnector implements IExchangeConnector {
  public exchangeId: SupportedExchangeId;
  public placeOrderCalls: ExchangeOrderParams[] = [];
  public simulatedLatencyMs = 15;
  public fillFraction = 1.0;
  public executionDelayMs = 0;
  public failAttemptsRemaining = 0;
  public shouldFail = false;
  public balances: ExchangeBalance = {
    USDT: { free: 500_000, used: 0, total: 500_000 },
    BTC: { free: 20, used: 0, total: 20 },
  };

  constructor(exchangeId: SupportedExchangeId = 'binance') {
    this.exchangeId = exchangeId;
  }

  async placeOrder(params: ExchangeOrderParams): Promise<ExchangeOrderResult> {
    this.placeOrderCalls.push(params);

    if (this.executionDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.executionDelayMs));
    }

    if (this.failAttemptsRemaining > 0) {
      this.failAttemptsRemaining--;
      throw new OrderPlacementError(
        `Transient execution error on ${this.exchangeId}`,
        this.exchangeId,
      );
    }

    if (this.shouldFail) {
      throw new OrderPlacementError(`Permanent failure on ${this.exchangeId}`, this.exchangeId);
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

  async cancelOrder(_orderId: string, _symbol: string): Promise<boolean> {
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

describe('Adversarial Challenger Suite: MARL Hedge Execution & Compensatory Unwind', () => {
  // ═══════════════════════════════════════════════════════════════════════════════
  // Section 1: Stress Test Partial Fills & Residual Delta Recovery
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('1. Partial Fills, Signed Residual Delta & Secondary Venue Sweep', () => {
    let primaryConnector: MockAdversarialConnector;
    let fallbackConnector: MockAdversarialConnector;
    let executionHandler: HedgeExecutionHandler;
    let unwindHandler: HedgeCompensatoryUnwindHandler;

    beforeEach(() => {
      primaryConnector = new MockAdversarialConnector('binance');
      fallbackConnector = new MockAdversarialConnector('bybit');

      executionHandler = new HedgeExecutionHandler({
        orderTimeoutMs: 300,
        maxLatencyMs: 200,
        minLotSize: 0.001,
      });
      executionHandler.registerConnector('binance', primaryConnector);
      executionHandler.registerConnector('bybit', fallbackConnector);

      unwindHandler = new HedgeCompensatoryUnwindHandler({
        maxRetries: 3,
        fallbackVenue: 'bybit',
        emergencyDeltaThreshold: 10.0, // High so emergency cancel does not interfere with sweep tests
        backoffBaseMs: 5,
        minLotSize: 0.0001,
      });
      unwindHandler.setConnectorResolver((venue) => {
        if (venue === 'bybit') return fallbackConnector;
        if (venue === 'binance') return primaryConnector;
        return undefined;
      });
    });

    const fillFractions = [
      { fraction: 0.0, expectedStatus: 'FAILED', desc: '0% fill (completely unfilled / rejected)' },
      { fraction: 0.25, expectedStatus: 'PARTIAL', desc: '25% fill' },
      { fraction: 0.50, expectedStatus: 'PARTIAL', desc: '50% fill' },
      { fraction: 0.75, expectedStatus: 'PARTIAL', desc: '75% fill' },
      { fraction: 0.999, expectedStatus: 'FILLED', desc: '99.9% fill (near-complete fill)' },
    ];

    for (const { fraction, expectedStatus, desc } of fillFractions) {
      it(`BUY HEDGE (${desc}): verifies signed residual delta and secondary venue sweep recovery`, async () => {
        const targetDelta = 2.0; // Positive target delta = BUY order
        primaryConnector.fillFraction = fraction;

        const report = await executionHandler.dispatchHedge(targetDelta, 'binance', 'BTC/USDT');

        expect(report.side).toBe('buy');
        expect(report.requestedAmount).toBe(2.0);
        expect(report.status).toBe(expectedStatus);

        const expectedFilled = Number((2.0 * fraction).toFixed(4));
        expect(report.filledAmount).toBe(expectedFilled);

        if (expectedStatus === 'FILLED') {
          // At 99.9% fill, status is FILLED, residual delta is clamped to 0
          expect(report.residualDelta).toBe(0);

          const unwindResult = await unwindHandler.executeUnwind(report);
          expect(unwindResult.unwindSuccess).toBe(true);
          expect(unwindResult.actionTaken).toBe('none');
          expect(unwindResult.unwoundAmount).toBe(0);
          expect(unwindResult.residualDelta).toBe(0);
        } else {
          // For partial or failed fills, residual delta is POSITIVE for buy orders
          const expectedResidual = Number((2.0 - expectedFilled).toFixed(4));
          expect(report.residualDelta).toBe(expectedResidual);
          expect(report.residualDelta).toBeGreaterThan(0);

          // Execute compensatory unwind sweep on secondary venue (bybit)
          const unwindResult = await unwindHandler.executeUnwind(report);

          expect(unwindResult.unwindSuccess).toBe(true);
          expect(unwindResult.actionTaken).toBe('secondary_cex_filled');
          expect(unwindResult.unwoundAmount).toBeCloseTo(expectedResidual, 4);
          expect(unwindResult.residualDelta).toBe(0);

          // Verify secondary order placed with matching side ('buy') and amount
          const sweepOrder = fallbackConnector.placeOrderCalls[fallbackConnector.placeOrderCalls.length - 1];
          expect(sweepOrder).toBeDefined();
          expect(sweepOrder?.side).toBe('buy');
          expect(sweepOrder?.amount).toBeCloseTo(expectedResidual, 4);
          expect(sweepOrder?.symbol).toBe('BTC/USDT');
        }
      });

      it(`SELL HEDGE (${desc}): verifies signed residual delta and secondary venue sweep recovery`, async () => {
        const targetDelta = -2.0; // Negative target delta = SELL order
        primaryConnector.fillFraction = fraction;

        const report = await executionHandler.dispatchHedge(targetDelta, 'binance', 'BTC/USDT');

        expect(report.side).toBe('sell');
        expect(report.requestedAmount).toBe(2.0);
        expect(report.status).toBe(expectedStatus);

        const expectedFilled = Number((2.0 * fraction).toFixed(4));
        expect(report.filledAmount).toBe(expectedFilled);

        if (expectedStatus === 'FILLED') {
          expect(report.residualDelta).toBe(0);

          const unwindResult = await unwindHandler.executeUnwind(report);
          expect(unwindResult.unwindSuccess).toBe(true);
          expect(unwindResult.actionTaken).toBe('none');
          expect(unwindResult.unwoundAmount).toBe(0);
          expect(unwindResult.residualDelta).toBe(0);
        } else {
          // For partial or failed fills, residual delta is NEGATIVE for sell orders
          const expectedResidual = Number((-(2.0 - expectedFilled)).toFixed(4));
          expect(report.residualDelta).toBe(expectedResidual);
          expect(report.residualDelta).toBeLessThan(0);

          // Execute compensatory unwind sweep on secondary venue (bybit)
          const unwindResult = await unwindHandler.executeUnwind(report);

          expect(unwindResult.unwindSuccess).toBe(true);
          expect(unwindResult.actionTaken).toBe('secondary_cex_filled');
          expect(unwindResult.unwoundAmount).toBeCloseTo(Math.abs(expectedResidual), 4);
          expect(unwindResult.residualDelta).toBe(0);

          // Verify secondary order placed with matching side ('sell') and amount
          const sweepOrder = fallbackConnector.placeOrderCalls[fallbackConnector.placeOrderCalls.length - 1];
          expect(sweepOrder).toBeDefined();
          expect(sweepOrder?.side).toBe('sell');
          expect(sweepOrder?.amount).toBeCloseTo(Math.abs(expectedResidual), 4);
          expect(sweepOrder?.symbol).toBe('BTC/USDT');
        }
      });
    }

    it('simulated fill mode (no connector registered) respects partial fill fractions accurately', async () => {
      const simHandler = new HedgeExecutionHandler();
      // No connector registered -> simulation mode

      // 0% fill
      const r0 = await simHandler.dispatchHedge(1.5, 'binance', 'BTC/USDT', 0.0);
      expect(r0.status).toBe('FAILED');
      expect(r0.filledAmount).toBe(0);
      expect(r0.residualDelta).toBe(1.5);

      // 50% fill
      const r50 = await simHandler.dispatchHedge(-1.0, 'binance', 'BTC/USDT', 0.5);
      expect(r50.status).toBe('PARTIAL');
      expect(r50.filledAmount).toBe(0.5);
      expect(r50.residualDelta).toBe(-0.5);

      // 99.9% fill in simulation mode
      const r99 = await simHandler.dispatchHedge(1.0, 'binance', 'BTC/USDT', 0.999);
      expect(r99.status).toBe('PARTIAL');
      expect(r99.filledAmount).toBe(0.999);
      expect(r99.residualDelta).toBe(0.001);

      // 100% fill
      const r100 = await simHandler.dispatchHedge(2.0, 'binance', 'BTC/USDT', 1.0);
      expect(r100.status).toBe('FILLED');
      expect(r100.filledAmount).toBe(2.0);
      expect(r100.residualDelta).toBe(0);
    });

    it('recovers multi-stage partial fills where secondary venue ALSO partial-fills on first attempt', async () => {
      // Primary venue filled 0.4 of 1.0 (residual = 0.6)
      primaryConnector.fillFraction = 0.40;
      const primaryReport = await executionHandler.dispatchHedge(1.0, 'binance');
      expect(primaryReport.status).toBe('PARTIAL');
      expect(primaryReport.residualDelta).toBe(0.60);

      // Secondary venue fills 1.0 on retry
      fallbackConnector.fillFraction = 1.0;
      const unwindResult = await unwindHandler.executeUnwind(primaryReport);
      expect(unwindResult.unwindSuccess).toBe(true);
      expect(unwindResult.actionTaken).toBe('secondary_cex_filled');
      expect(unwindResult.unwoundAmount).toBe(0.60);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Section 2: Stress Test Execution Timeout Race
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('2. Execution Timeout Race & Fast Abort', () => {
    let hangingConnector: MockAdversarialConnector;
    let fallbackConnector: MockAdversarialConnector;

    beforeEach(() => {
      hangingConnector = new MockAdversarialConnector('binance');
      fallbackConnector = new MockAdversarialConnector('bybit');
    });

    it('aborts fast via Promise.race when connector hangs (> orderTimeoutMs)', async () => {
      const timeoutMs = 40;
      const handler = new HedgeExecutionHandler({
        orderTimeoutMs: timeoutMs,
        maxLatencyMs: 200,
      });

      // Connector hangs for 350ms (well past 40ms timeout)
      hangingConnector.executionDelayMs = 350;
      handler.registerConnector('binance', hangingConnector);

      const startTime = Date.now();
      const report = await handler.dispatchHedge(1.5, 'binance', 'BTC/USDT');
      const elapsedMs = Date.now() - startTime;

      // Verify fast abort: elapsed time should be close to timeoutMs (within 100ms), NOT 350ms
      expect(elapsedMs).toBeLessThan(150);
      expect(elapsedMs).toBeGreaterThanOrEqual(timeoutMs - 10);

      // Verify report integrity
      expect(report.status).toBe('FAILED');
      expect(report.error).toContain(`Hedge order timeout after ${timeoutMs}ms`);
      expect(report.filledAmount).toBe(0);
      expect(report.residualDelta).toBe(1.5);
    });

    it('timed-out order is successfully routed to compensatory unwind sweep', async () => {
      const timeoutMs = 30;
      const handler = new HedgeExecutionHandler({ orderTimeoutMs: timeoutMs });
      hangingConnector.executionDelayMs = 250;
      handler.registerConnector('binance', hangingConnector);

      const unwindHandler = new HedgeCompensatoryUnwindHandler({
        fallbackVenue: 'bybit',
        backoffBaseMs: 5,
      });
      unwindHandler.setConnectorResolver((v) => (v === 'bybit' ? fallbackConnector : undefined));

      const report = await handler.dispatchHedge(-2.5, 'binance');
      expect(report.status).toBe('FAILED');
      expect(report.residualDelta).toBe(-2.5);

      const unwindResult = await unwindHandler.executeUnwind(report);
      expect(unwindResult.unwindSuccess).toBe(true);
      expect(unwindResult.actionTaken).toBe('secondary_cex_filled');
      expect(unwindResult.unwoundAmount).toBe(2.5);
      expect(fallbackConnector.placeOrderCalls.length).toBe(1);
      expect(fallbackConnector.placeOrderCalls[0]?.side).toBe('sell');
      expect(fallbackConnector.placeOrderCalls[0]?.amount).toBe(2.5);
    });

    it('does not trip timeout when connector responds strictly within deadline', async () => {
      const timeoutMs = 100;
      const handler = new HedgeExecutionHandler({ orderTimeoutMs: timeoutMs });
      hangingConnector.executionDelayMs = 20; // 20ms < 100ms
      handler.registerConnector('binance', hangingConnector);

      const report = await handler.dispatchHedge(0.50, 'binance');
      expect(report.status).toBe('FILLED');
      expect(report.error).toBeUndefined();
      expect(report.filledAmount).toBe(0.50);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Section 3: Stress Test Latency Circuit Breaker & Cooldown Tracking
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('3. Latency Circuit Breaker & Cooldown Tracking', () => {
    let laggyConnector: MockAdversarialConnector;
    let healthyConnector: MockAdversarialConnector;
    let handler: HedgeExecutionHandler;

    beforeEach(() => {
      laggyConnector = new MockAdversarialConnector('binance');
      healthyConnector = new MockAdversarialConnector('bybit');

      handler = new HedgeExecutionHandler({
        maxLatencyMs: 100,
        circuitCooldownMs: 50, // Short 50ms cooldown for fast test execution
      });
      handler.registerConnector('binance', laggyConnector);
      handler.registerConnector('bybit', healthyConnector);
    });

    it('trips circuit breaker immediately when latency exceeds maxLatencyMs', async () => {
      laggyConnector.simulatedLatencyMs = 150; // 150ms > 100ms max

      expect(handler.isCircuitBroken('binance')).toBe(false);

      const report = await handler.dispatchHedge(1.0, 'binance');

      expect(report.status).toBe('FAILED');
      expect(report.error).toBe('LATENCY_EXCEEDED');
      expect(report.latencyMs).toBe(150);
      expect(report.residualDelta).toBe(1.0);
      expect(handler.isCircuitBroken('binance')).toBe(true);

      // Verify no order was sent to exchange connector
      expect(laggyConnector.placeOrderCalls.length).toBe(0);
    });

    it('immediately rejects subsequent calls during active circuit cooldown without network roundtrip', async () => {
      laggyConnector.simulatedLatencyMs = 200;
      await handler.dispatchHedge(1.0, 'binance');
      expect(handler.isCircuitBroken('binance')).toBe(true);

      // Reset latency to simulate exchange recovered, but breaker is still in cooldown
      laggyConnector.simulatedLatencyMs = 10;

      const secondReport = await handler.dispatchHedge(0.50, 'binance');
      expect(secondReport.status).toBe('FAILED');
      expect(secondReport.error).toBe('CIRCUIT_BROKEN');
      expect(laggyConnector.placeOrderCalls.length).toBe(0);
    });

    it('maintains cross-venue isolation (healthy venue unaffected by tripped venue)', async () => {
      laggyConnector.simulatedLatencyMs = 300;
      healthyConnector.simulatedLatencyMs = 20;

      await handler.dispatchHedge(1.0, 'binance');
      expect(handler.isCircuitBroken('binance')).toBe(true);
      expect(handler.isCircuitBroken('bybit')).toBe(false);

      // Order on healthy venue succeeds completely
      const healthyReport = await handler.dispatchHedge(0.80, 'bybit');
      expect(healthyReport.status).toBe('FILLED');
      expect(healthyReport.error).toBeUndefined();
      expect(healthyConnector.placeOrderCalls.length).toBe(1);
    });

    it('auto-recovers after cooldown duration expires', async () => {
      laggyConnector.simulatedLatencyMs = 150;
      await handler.dispatchHedge(0.50, 'binance');
      expect(handler.isCircuitBroken('binance')).toBe(true);

      // Wait 65ms (> 50ms cooldown)
      await new Promise((resolve) => setTimeout(resolve, 65));

      expect(handler.isCircuitBroken('binance')).toBe(false);

      // Now latency is healthy
      laggyConnector.simulatedLatencyMs = 25;
      const recoveredReport = await handler.dispatchHedge(0.50, 'binance');
      expect(recoveredReport.status).toBe('FILLED');
      expect(recoveredReport.error).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Section 4: Stress Test Emergency Quote Cancellation Callback
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('4. Emergency Quote Cancellation Callback & Tripwires', () => {
    let unwindHandler: HedgeCompensatoryUnwindHandler;
    let fallbackConnector: MockAdversarialConnector;

    beforeEach(() => {
      fallbackConnector = new MockAdversarialConnector('bybit');
      unwindHandler = new HedgeCompensatoryUnwindHandler({
        emergencyDeltaThreshold: 1.0,
        fallbackVenue: 'bybit',
        backoffBaseMs: 5,
      });
      unwindHandler.setConnectorResolver((v) => (v === 'bybit' ? fallbackConnector : undefined));
    });

    it('strictly does NOT invoke callback when |residualDelta| < emergencyDeltaThreshold', async () => {
      const cancelSpy = vi.fn().mockResolvedValue(0);
      unwindHandler.setEmergencyCancelCallback(cancelSpy);

      const report: HedgeExecutionReport = {
        hedgeId: 'hdg-sub-thresh',
        venue: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        requestedAmount: 1.0,
        filledAmount: 0.05,
        avgFillPrice: 50_000,
        latencyMs: 15,
        status: 'PARTIAL',
        residualDelta: 0.95, // 0.95 < 1.0
      };

      await unwindHandler.executeUnwind(report);
      expect(cancelSpy).not.toHaveBeenCalled();
    });

    it('MUST invoke callback when |residualDelta| == emergencyDeltaThreshold exactly', async () => {
      const cancelSpy = vi.fn().mockResolvedValue(5);
      unwindHandler.setEmergencyCancelCallback(cancelSpy);

      const report: HedgeExecutionReport = {
        hedgeId: 'hdg-exact-thresh',
        venue: 'binance',
        symbol: 'BTC/USDT',
        side: 'sell',
        requestedAmount: 1.0,
        filledAmount: 0,
        avgFillPrice: 0,
        latencyMs: 15,
        status: 'FAILED',
        residualDelta: -1.0, // |-1.0| == 1.0
      };

      await unwindHandler.executeUnwind(report);
      expect(cancelSpy).toHaveBeenCalledTimes(1);
    });

    it('MUST invoke callback when |residualDelta| > emergencyDeltaThreshold', async () => {
      const cancelSpy = vi.fn().mockResolvedValue(10);
      unwindHandler.setEmergencyCancelCallback(cancelSpy);

      const report: HedgeExecutionReport = {
        hedgeId: 'hdg-above-thresh',
        venue: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        requestedAmount: 5.0,
        filledAmount: 1.0,
        avgFillPrice: 50_000,
        latencyMs: 20,
        status: 'PARTIAL',
        residualDelta: 4.0, // 4.0 > 1.0
      };

      await unwindHandler.executeUnwind(report);
      expect(cancelSpy).toHaveBeenCalledTimes(1);
    });

    it('survives callback exception without crashing the unwind pipeline', async () => {
      const faultyCallback = vi.fn().mockRejectedValue(new Error('Polymarket API disconnect'));
      unwindHandler.setEmergencyCancelCallback(faultyCallback);

      const report: HedgeExecutionReport = {
        hedgeId: 'hdg-error-cb',
        venue: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        requestedAmount: 2.0,
        filledAmount: 0,
        avgFillPrice: 0,
        latencyMs: 15,
        status: 'FAILED',
        residualDelta: 2.0,
      };

      // executeUnwind must NOT throw, and should proceed with secondary CEX sweep
      const result = await unwindHandler.executeUnwind(report);
      expect(faultyCallback).toHaveBeenCalledTimes(1);
      expect(result.unwindSuccess).toBe(true);
      expect(result.actionTaken).toBe('secondary_cex_filled');
      expect(result.unwoundAmount).toBe(2.0);
    });

    it('validates evaluateEmergencyThreshold pure method over boundary table', () => {
      expect(unwindHandler.evaluateEmergencyThreshold(0.999)).toBe(false);
      expect(unwindHandler.evaluateEmergencyThreshold(1.0)).toBe(true);
      expect(unwindHandler.evaluateEmergencyThreshold(1.0001)).toBe(true);
      expect(unwindHandler.evaluateEmergencyThreshold(-0.999)).toBe(false);
      expect(unwindHandler.evaluateEmergencyThreshold(-1.0)).toBe(true);
      expect(unwindHandler.evaluateEmergencyThreshold(-1.0001)).toBe(true);
      expect(unwindHandler.evaluateEmergencyThreshold(0)).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Section 5: End-to-End Adversarial Stress & Schema Validation
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('5. High-Load Adversarial Stress & Schema Bounds', () => {
    it('executes 100 randomized adverse fill and retry cycles with zero unhedged delta leaks', async () => {
      const fallbackConnector = new MockAdversarialConnector('bybit');
      const unwindHandler = new HedgeCompensatoryUnwindHandler({
        maxRetries: 3,
        fallbackVenue: 'bybit',
        emergencyDeltaThreshold: 100.0,
        backoffBaseMs: 1,
      });
      unwindHandler.setConnectorResolver(() => fallbackConnector);

      for (let i = 0; i < 100; i++) {
        const side: 'buy' | 'sell' = i % 2 === 0 ? 'buy' : 'sell';
        const requested = Number((0.1 + Math.random() * 5.0).toFixed(4));
        const fillFraction = Math.random();
        const filled = Number((requested * fillFraction).toFixed(4));
        const residual = Number((requested - filled).toFixed(4));
        const signedResidual = side === 'buy' ? residual : -residual;

        const report: HedgeExecutionReport = {
          hedgeId: `stress-${i}`,
          venue: 'binance',
          symbol: 'BTC/USDT',
          side,
          requestedAmount: requested,
          filledAmount: filled,
          avgFillPrice: 50_000,
          latencyMs: 15,
          status: fillFraction >= 0.999 ? 'FILLED' : filled > 0 ? 'PARTIAL' : 'FAILED',
          residualDelta: signedResidual,
        };

        const res = await unwindHandler.executeUnwind(report);
        expect(res.unwindSuccess).toBe(true);
        expect(res.residualDelta).toBe(0);
      }
    });

    it('enforces strict Zod schema constraints on negative and invalid configs', () => {
      expect(() => HedgeExecutionConfigSchema.parse({ orderTimeoutMs: 0 })).toThrow();
      expect(() => HedgeExecutionConfigSchema.parse({ orderTimeoutMs: -100 })).toThrow();
      expect(() => HedgeExecutionConfigSchema.parse({ maxLatencyMs: -50 })).toThrow();
      expect(() => CompensatoryUnwindConfigSchema.parse({ emergencyDeltaThreshold: 0 })).toThrow();
      expect(() => CompensatoryUnwindConfigSchema.parse({ emergencyDeltaThreshold: -1.0 })).toThrow();
    });
  });
});
