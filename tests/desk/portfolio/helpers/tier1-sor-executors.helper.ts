import { describe, it, expect } from 'vitest';
import {
  TwapExecutor,
  VwapExecutor,
  IcebergExecutor,
  PriceImprovementVerifier,
} from '../fixtures/sor-contract.fixture';

export function registerTier1SorExecutorTests(): void {
  describe('Feature 14: TWAP Execution Strategy (F14)', () => {
    const twap = new TwapExecutor();

    it('F14.1: slices total order into requested number of execution intervals', () => {
      const slices = twap.sliceOrder(100, 5);
      expect(slices.length).toBe(5);
    });

    it('F14.2: sums of individual slices exactly match total order quantity', () => {
      const slices = twap.sliceOrder(250, 8);
      const sum = slices.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(250, 4);
    });

    it('F14.3: applies jitter to randomize order slice sizes and avoid detection', () => {
      const slices = twap.sliceOrder(100, 5, 1500);
      const isIdentical = slices.every((s) => s === slices[0]);
      expect(isIdentical).toBe(false);
    });

    it('F14.4: ensures all slice quantities are strictly positive', () => {
      const slices = twap.sliceOrder(50, 4);
      slices.forEach((s) => expect(s).toBeGreaterThan(0));
    });

    it('F14.5: handles small total quantity without negative slice values', () => {
      const slices = twap.sliceOrder(2, 3);
      slices.forEach((s) => expect(s).toBeGreaterThanOrEqual(0));
    });
  });

  describe('Feature 15: VWAP Execution Strategy (F15)', () => {
    const vwap = new VwapExecutor();
    const volumeProfile = [1000, 2000, 4000, 2000, 1000];

    it('F15.1: slices order proportionally to historical volume profile curve', () => {
      const slices = vwap.sliceOrder(100, volumeProfile);
      expect(slices.length).toBe(volumeProfile.length);
      expect(slices[2]).toBeGreaterThan(slices[0]);
    });

    it('F15.2: sums of VWAP slices equal total order quantity', () => {
      const slices = vwap.sliceOrder(500, volumeProfile);
      const sum = slices.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(500, 4);
    });

    it('F15.3: assigns peak execution volume during peak market volume intervals', () => {
      const slices = vwap.sliceOrder(1000, volumeProfile);
      const maxSlice = Math.max(...slices);
      expect(slices[2]).toBe(maxSlice);
    });

    it('F15.4: handles uniform volume profile identically to equal time slicing', () => {
      const uniform = [500, 500, 500, 500];
      const slices = vwap.sliceOrder(100, uniform);
      slices.forEach((s) => expect(s).toBeCloseTo(25, 4));
    });

    it('F15.5: handles empty or zero volume profile falling back to single order', () => {
      const slices = vwap.sliceOrder(100, [0, 0, 0]);
      expect(slices.length).toBe(1);
      expect(slices[0]).toBe(100);
    });
  });

  describe('Feature 16: Iceberg Execution Strategy (F16)', () => {
    const iceberg = new IcebergExecutor();

    it('F16.1: slices large parent order into visible and hidden tranches', () => {
      const chunks = iceberg.sliceOrder(1000, 0.20);
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].visible).toBeLessThanOrEqual(200);
      expect(chunks[0].hidden).toBeGreaterThan(0);
    });

    it('F16.2: visible tranche sizes do not exceed configured display ratio', () => {
      const chunks = iceberg.sliceOrder(500, 0.15);
      chunks.forEach((c) => expect(c.visible).toBeLessThanOrEqual(75.01));
    });

    it('F16.3: final chunk exhausts all remaining hidden inventory', () => {
      const chunks = iceberg.sliceOrder(300, 0.25);
      const last = chunks[chunks.length - 1];
      expect(last.hidden).toBe(0);
    });

    it('F16.4: sum of visible chunk sizes equals total parent order quantity', () => {
      const chunks = iceberg.sliceOrder(450, 0.20);
      const totalVisible = chunks.reduce((sum, c) => sum + c.visible, 0);
      expect(totalVisible).toBeCloseTo(450, 4);
    });

    it('F16.5: handles display ratio >= 1.0 returning a single visible order', () => {
      const chunks = iceberg.sliceOrder(100, 1.0);
      expect(chunks.length).toBe(1);
      expect(chunks[0].visible).toBe(100);
      expect(chunks[0].hidden).toBe(0);
    });
  });

  describe('Feature 17: Price Improvement Verifier (F17)', () => {
    const verifier = new PriceImprovementVerifier();

    it('F17.1: verifies price improvement when SOR buy cost is lower than naive cost', () => {
      expect(verifier.verify(9980, 10000, 'BUY')).toBe(true);
    });

    it('F17.2: rejects execution plan when SOR buy cost exceeds naive single-venue cost', () => {
      expect(verifier.verify(10050, 10000, 'BUY')).toBe(false);
    });

    it('F17.3: verifies price improvement when SOR sell net proceeds exceed naive proceeds', () => {
      expect(verifier.verify(10020, 10000, 'SELL')).toBe(true);
    });

    it('F17.4: rejects execution plan when SOR sell proceeds are worse than naive', () => {
      expect(verifier.verify(9950, 10000, 'SELL')).toBe(false);
    });

    it('F17.5: accepts equal cost execution within floating point epsilon', () => {
      expect(verifier.verify(10000.000001, 10000, 'BUY')).toBe(true);
      expect(verifier.verify(9999.999999, 10000, 'SELL')).toBe(true);
    });
  });
}
