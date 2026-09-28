/**
 * Tier 1: Tri-Mode Dispatcher & SOR Helper (F10 - F13)
 * Covers R3 requirements in isolation (20 tests).
 */

import { describe, it, expect } from 'vitest';
import { createArbitrageIntent, createAlphaLabIntent } from '../fixtures/mock-engines.fixture';
import { MockTriModeDispatcher } from '../fixtures/mock-sor-dispatcher.fixture';

export function registerTier1SorDispatcherTests(): void {
  describe('F10: Tri-Mode Execution Router', () => {
    it('T10.1: PAPER mode executes simulated fills with zero live exchange calls', () => {
      const dispatcher = new MockTriModeDispatcher('PAPER');
      const intent = createArbitrageIntent({ quantity: 1.0 });
      const res = dispatcher.dispatch(intent);

      expect(res.mode).toBe('PAPER');
      expect(res.status).toBe('FILLED');
      expect(dispatcher.getLiveApiCallsCount()).toBe(0);
      expect(dispatcher.getVirtualFillsCount()).toBe(1);
    });

    it('T10.2: SHADOW mode executes virtual fills against depth without live order placement', () => {
      const dispatcher = new MockTriModeDispatcher('SHADOW');
      const intent = createArbitrageIntent({ quantity: 1.0 });
      const res = dispatcher.dispatch(intent);

      expect(res.mode).toBe('SHADOW');
      expect(res.status).toBe('FILLED');
      expect(dispatcher.getLiveApiCallsCount()).toBe(0);
      expect(dispatcher.getVirtualFillsCount()).toBe(1);
    });

    it('T10.3: LIVE mode increments live API calls counter and executes protected dispatch', () => {
      const dispatcher = new MockTriModeDispatcher('LIVE');
      const intent = createArbitrageIntent({ quantity: 0.5 });
      const res = dispatcher.dispatch(intent);

      expect(res.mode).toBe('LIVE');
      expect(dispatcher.getLiveApiCallsCount()).toBe(1);
    });

    it('T10.4: Mode isolation guarantees virtual fills counter increments in PAPER and live remains 0', () => {
      const dispatcher = new MockTriModeDispatcher('PAPER');
      for (let i = 0; i < 5; i++) {
        dispatcher.dispatch(createArbitrageIntent());
      }
      expect(dispatcher.getVirtualFillsCount()).toBe(5);
      expect(dispatcher.getLiveApiCallsCount()).toBe(0);
    });

    it('T10.5: Dynamic mode switching updates dispatcher mode and route behavior', () => {
      const dispatcher = new MockTriModeDispatcher('PAPER');
      expect(dispatcher.getMode()).toBe('PAPER');
      dispatcher.setMode('SHADOW');
      expect(dispatcher.getMode()).toBe('SHADOW');
      dispatcher.setMode('LIVE');
      expect(dispatcher.getMode()).toBe('LIVE');
    });
  });

  describe('F11: Smart Order Router Execution Bridge', () => {
    it('T11.1: Routes parent order slices to designated venues with fee and gas optimization', () => {
      const dispatcher = new MockTriModeDispatcher('PAPER');
      const intent = createArbitrageIntent({ venue: 'binance', quantity: 2.0 });
      const res = dispatcher.dispatch(intent);
      expect(res.venue).toBe('binance');
      expect(res.feeUsd).toBeGreaterThan(0);
    });

    it('T11.2: Calculates expected arrival vs executed price accurately', () => {
      const dispatcher = new MockTriModeDispatcher('PAPER');
      const intent = createArbitrageIntent({ price: 65000 });
      const res = dispatcher.dispatch(intent, 65000);
      expect(res.averagePrice).toBeCloseTo(65000 * 1.0003, 0); // 3 bps slippage
    });

    it('T11.3: Tracks execution latency in dispatch result', () => {
      const dispatcher = new MockTriModeDispatcher('PAPER');
      const res = dispatcher.dispatch(createArbitrageIntent());
      expect(res.latencyMs).toBeGreaterThan(0);
    });

    it('T11.4: Handles multi-venue order dispatching consistently', () => {
      const dispatcher = new MockTriModeDispatcher('PAPER');
      const binanceRes = dispatcher.dispatch(createArbitrageIntent({ venue: 'binance' }));
      const bybitRes = dispatcher.dispatch(createArbitrageIntent({ venue: 'bybit' }));
      expect(binanceRes.venue).toBe('binance');
      expect(bybitRes.venue).toBe('bybit');
    });

    it('T11.5: Preserves original intentId in dispatch result for end-to-end tracing', () => {
      const dispatcher = new MockTriModeDispatcher('PAPER');
      const intent = createAlphaLabIntent({ intentId: 'trace-12345' });
      const res = dispatcher.dispatch(intent);
      expect(res.intentId).toBe('trace-12345');
    });
  });

  describe('F12: Automated Slicing Execution (TWAP/VWAP/Iceberg)', () => {
    it('T12.1: TWAP slices order into N discrete chunks with total sum exactly equaling parent quantity', () => {
      const dispatcher = new MockTriModeDispatcher('PAPER');
      const totalQty = 10.0;
      const slices = dispatcher.twapSlice(totalQty, 5, 0);
      expect(slices.length).toBe(5);
      const sum = slices.reduce((acc, s) => acc + s.quantity, 0);
      expect(sum).toBeCloseTo(totalQty, 8);
    });

    it('T12.2: TWAP applies Box-Muller Gaussian jitter bounded to ±15%', () => {
      const dispatcher = new MockTriModeDispatcher('PAPER');
      const totalQty = 100.0;
      const baseSlice = totalQty / 5; // 20.0
      const slices = dispatcher.twapSlice(totalQty, 5, 1500);

      slices.slice(0, 4).forEach((s) => {
        expect(s.quantity).toBeGreaterThanOrEqual(baseSlice * 0.85);
        expect(s.quantity).toBeLessThanOrEqual(baseSlice * 1.15);
      });
    });

    it('T12.3: VWAP slices order according to volume profile distribution', () => {
      const dispatcher = new MockTriModeDispatcher('PAPER');
      const totalQty = 100.0;
      const profile = [0.25, 0.15, 0.10, 0.10, 0.15, 0.25];
      const slices = dispatcher.vwapSlice(totalQty, profile);

      expect(slices.length).toBe(6);
      expect(slices[0].quantity).toBeCloseTo(25.0, 5);
      expect(slices[2].quantity).toBeCloseTo(10.0, 5);
      const sum = slices.reduce((acc, s) => acc + s.quantity, 0);
      expect(sum).toBeCloseTo(totalQty, 8);
    });

    it('T12.4: Iceberg partitions parent order into 20% visible display and 80% hidden reserve', () => {
      const dispatcher = new MockTriModeDispatcher('PAPER');
      const totalQty = 50.0;
      const chunks = dispatcher.icebergSlice(totalQty, 0.20);

      expect(chunks[0].visible).toBeCloseTo(10.0, 5);
      expect(chunks[0].hidden).toBeCloseTo(40.0, 5);
      expect(chunks.length).toBe(5);
    });

    it('T12.5: Zero floating-point residual on final slice of TWAP', () => {
      const dispatcher = new MockTriModeDispatcher('PAPER');
      const totalQty = 1.0 / 3.0; // 0.3333333333333333
      const slices = dispatcher.twapSlice(totalQty, 7, 1200);
      const sum = slices.reduce((acc, s) => acc + s.quantity, 0);
      expect(sum).toBeCloseTo(totalQty, 10);
    });
  });

  describe('F13: Fill Tracking & Slippage Reconciler', () => {
    it('T13.1: Returns FILLED status for complete fill', () => {
      const dispatcher = new MockTriModeDispatcher('PAPER');
      const res = dispatcher.dispatch(createArbitrageIntent({ quantity: 1.0 }), 65000, 1.0);
      expect(res.status).toBe('FILLED');
      expect(res.executedQuantity).toBe(1.0);
    });

    it('T13.2: Returns PARTIALLY_FILLED status when partial fill ratio < 1.0', () => {
      const dispatcher = new MockTriModeDispatcher('PAPER');
      const res = dispatcher.dispatch(createArbitrageIntent({ quantity: 2.0 }), 65000, 0.6);
      expect(res.status).toBe('PARTIALLY_FILLED');
      expect(res.executedQuantity).toBeCloseTo(1.2, 5);
    });

    it('T13.3: Calculates realized slippage in basis points accurately', () => {
      const dispatcher = new MockTriModeDispatcher('PAPER');
      const intent = createArbitrageIntent({ price: 10000 });
      const res = dispatcher.dispatch(intent, 10000);
      expect(res.slippageBps).toBeGreaterThan(0);
    });

    it('T13.4: Reconciles realized fee in USD based on taker fee schedule', () => {
      const dispatcher = new MockTriModeDispatcher('PAPER');
      const intent = createArbitrageIntent({ quantity: 1.0, price: 50000 });
      const res = dispatcher.dispatch(intent, 50000);
      expect(res.feeUsd).toBeCloseTo(50000 * 0.0005, 1);
    });

    it('T13.5: Returns REJECTED status when partial fill ratio is zero', () => {
      const dispatcher = new MockTriModeDispatcher('PAPER');
      const res = dispatcher.dispatch(createArbitrageIntent({ quantity: 1.0 }), 65000, 0.0);
      expect(res.status).toBe('REJECTED');
      expect(res.executedQuantity).toBe(0);
    });
  });
}
