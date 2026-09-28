/**
 * Tier 2: SOR & Slicing Boundary Helper
 * Slicing partitions, zero remainder, extreme jitter, partial fills (10 tests)
 */

import { describe, it, expect } from 'vitest';
import { createArbitrageIntent } from '../fixtures/mock-engines.fixture';
import { MockTriModeDispatcher } from '../fixtures/mock-sor-dispatcher.fixture';

export function registerTier2SorDispatcherBoundaryTests(): void {
  describe('Slicing Algorithm Boundaries', () => {
    it('B28: Single slice TWAP (numSlices = 1) returns exactly 1 slice equal to total quantity', () => {
      const dispatcher = new MockTriModeDispatcher();
      const slices = dispatcher.twapSlice(5.5, 1, 0);
      expect(slices.length).toBe(1);
      expect(slices[0].quantity).toBe(5.5);
    });

    it('B29: Large slice TWAP (numSlices = 50) maintains exact sum with zero floating point drift', () => {
      const dispatcher = new MockTriModeDispatcher();
      const totalQty = 17.12345678;
      const slices = dispatcher.twapSlice(totalQty, 50, 1500);
      expect(slices.length).toBe(50);
      const sum = slices.reduce((acc, s) => acc + s.quantity, 0);
      expect(sum).toBeCloseTo(totalQty, 8);
    });

    it('B30: Zero jitter TWAP produces identical uniform slices', () => {
      const dispatcher = new MockTriModeDispatcher();
      const slices = dispatcher.twapSlice(10.0, 5, 0);
      slices.forEach((s) => expect(s.quantity).toBeCloseTo(2.0, 8));
    });

    it('B31: Single-element VWAP volume profile allocates 100% to single slice', () => {
      const dispatcher = new MockTriModeDispatcher();
      const slices = dispatcher.vwapSlice(8.0, [1000]);
      expect(slices.length).toBe(1);
      expect(slices[0].quantity).toBe(8.0);
    });

    it('B32: Zero volume profile in VWAP falls back to uniform partition', () => {
      const dispatcher = new MockTriModeDispatcher();
      const slices = dispatcher.vwapSlice(9.0, [0, 0, 0]);
      expect(slices.length).toBe(3);
      slices.forEach((s) => expect(s.quantity).toBeCloseTo(3.0, 5));
    });

    it('B33: Iceberg display ratio 1.0 (100%) produces exactly 1 chunk with 0 hidden', () => {
      const dispatcher = new MockTriModeDispatcher();
      const chunks = dispatcher.icebergSlice(25.0, 1.0);
      expect(chunks.length).toBe(1);
      expect(chunks[0].visible).toBe(25.0);
      expect(chunks[0].hidden).toBe(0);
    });

    it('B34: Iceberg small display ratio (0.05) produces 20 chunks', () => {
      const dispatcher = new MockTriModeDispatcher();
      const chunks = dispatcher.icebergSlice(100.0, 0.05);
      expect(chunks.length).toBe(20);
      expect(chunks[0].visible).toBe(5.0);
    });
  });

  describe('Dispatcher & Slippage Boundaries', () => {
    it('B35: High slippage condition (> 100 bps) is measured correctly in dispatch result', () => {
      const dispatcher = new MockTriModeDispatcher('PAPER');
      const intent = createArbitrageIntent({ price: 65000 });
      // Arrival price shifted by 1% (100 bps)
      const res = dispatcher.dispatch(intent, 65650);
      expect(res.slippageBps).toBeGreaterThan(100);
    });

    it('B36: Micro partial fill (0.01% fill ratio) returns PARTIALLY_FILLED', () => {
      const dispatcher = new MockTriModeDispatcher('PAPER');
      const intent = createArbitrageIntent({ quantity: 100 });
      const res = dispatcher.dispatch(intent, 65000, 0.0001);
      expect(res.status).toBe('PARTIALLY_FILLED');
      expect(res.executedQuantity).toBeCloseTo(0.01, 4);
    });

    it('B37: Extreme asset price (sub-cent $0.001) calculates fees and slippage accurately', () => {
      const dispatcher = new MockTriModeDispatcher('PAPER');
      const intent = createArbitrageIntent({ quantity: 1000000, price: 0.001 });
      const res = dispatcher.dispatch(intent, 0.001);
      expect(res.feeUsd).toBeCloseTo(1000 * 0.0005, 3);
      expect(res.status).toBe('FILLED');
    });
  });
}
