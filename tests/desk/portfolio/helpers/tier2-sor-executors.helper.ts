import { describe, it, expect } from 'vitest';
import {
  TwapExecutor,
  VwapExecutor,
  IcebergExecutor,
  PriceImprovementVerifier,
} from '../fixtures/sor-contract.fixture';

export function registerTier2SorExecutorTests(): void {
  describe('Tier 2: Boundary - Feature 14: TWAP Execution Strategy (F14)', () => {
    const twap = new TwapExecutor();

    it('B14.1: single slice requested (slices = 1) returns 1 slice of full quantity', () => {
      const slices = twap.sliceOrder(100, 1);
      expect(slices.length).toBe(1);
      expect(slices[0]).toBeCloseTo(100, 4);
    });

    it('B14.2: large number of slices (slices = 50) preserves total quantity sum', () => {
      const slices = twap.sliceOrder(1000, 50);
      const sum = slices.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1000, 2);
    });

    it('B14.3: zero jitter (0 bps) produces uniform equal slices', () => {
      const slices = twap.sliceOrder(200, 4, 0);
      slices.forEach((s) => expect(s).toBeCloseTo(50, 4));
    });

    it('B14.4: handles tiny total order (0.01) without rounding negative values', () => {
      const slices = twap.sliceOrder(0.01, 3);
      slices.forEach((s) => expect(s).toBeGreaterThanOrEqual(0));
    });

    it('B14.5: handles massive order (1,000,000 units) preserving exact total', () => {
      const slices = twap.sliceOrder(1000000, 10);
      const sum = slices.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1000000, 2);
    });
  });

  describe('Tier 2: Boundary - Feature 15: VWAP Execution Strategy (F15)', () => {
    const vwap = new VwapExecutor();

    it('B15.1: single bucket volume profile allocates 100% in single slice', () => {
      const slices = vwap.sliceOrder(500, [1000]);
      expect(slices.length).toBe(1);
      expect(slices[0]).toBe(500);
    });

    it('B15.2: concentrated volume profile with zero volume in outer buckets', () => {
      const slices = vwap.sliceOrder(100, [0, 1000, 0]);
      expect(slices[0]).toBe(0);
      expect(slices[1]).toBe(100);
      expect(slices[2]).toBe(0);
    });

    it('B15.3: all zero volume profile falls back to single order slice safely', () => {
      const slices = vwap.sliceOrder(250, [0, 0, 0, 0]);
      expect(slices.length).toBe(1);
      expect(slices[0]).toBe(250);
    });

    it('B15.4: large 50-interval volume profile sums exactly to total quantity', () => {
      const profile = Array.from({ length: 50 }, (_, i) => 100 + i * 10);
      const slices = vwap.sliceOrder(5000, profile);
      const sum = slices.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(5000, 4);
    });

    it('B15.5: fractional target quantity (0.50 units) distributes accurately', () => {
      const slices = vwap.sliceOrder(0.50, [200, 300]);
      expect(slices[0]).toBeCloseTo(0.20, 4);
      expect(slices[1]).toBeCloseTo(0.30, 4);
    });
  });

  describe('Tier 2: Boundary - Feature 16: Iceberg Execution Strategy (F16)', () => {
    const iceberg = new IcebergExecutor();

    it('B16.1: display ratio = 1.0 emits single visible slice with 0 hidden', () => {
      const chunks = iceberg.sliceOrder(100, 1.0);
      expect(chunks.length).toBe(1);
      expect(chunks[0].hidden).toBe(0);
    });

    it('B16.2: tiny display ratio (0.05) creates exactly 20 slices', () => {
      const chunks = iceberg.sliceOrder(100, 0.05);
      expect(chunks.length).toBe(20);
      chunks.forEach((c) => expect(c.visible).toBeCloseTo(5, 4));
    });

    it('B16.3: fractional order quantity (0.75 units) handles small chunk division', () => {
      const chunks = iceberg.sliceOrder(0.75, 0.3333);
      const total = chunks.reduce((acc, c) => acc + c.visible, 0);
      expect(total).toBeCloseTo(0.75, 4);
    });

    it('B16.4: display ratio = 0.50 divides order into exactly 2 tranches', () => {
      const chunks = iceberg.sliceOrder(1000, 0.50);
      expect(chunks.length).toBe(2);
      expect(chunks[0].visible).toBe(500);
      expect(chunks[1].visible).toBe(500);
    });

    it('B16.5: hidden quantity reaches exactly 0 on the final chunk', () => {
      const chunks = iceberg.sliceOrder(333, 0.25);
      expect(chunks[chunks.length - 1].hidden).toBe(0);
    });
  });

  describe('Tier 2: Boundary - Feature 17: Price Improvement Verifier (F17)', () => {
    const verifier = new PriceImprovementVerifier();

    it('B17.1: verifies sub-cent buy cost improvement (0.0001 USD saving)', () => {
      expect(verifier.verify(9999.9999, 10000.0, 'BUY')).toBe(true);
    });

    it('B17.2: verifies sub-cent sell proceeds improvement (0.0001 USD increase)', () => {
      expect(verifier.verify(10000.0001, 10000.0, 'SELL')).toBe(true);
    });

    it('B17.3: accepts buy cost identical to naive cost within floating point epsilon', () => {
      expect(verifier.verify(10000.0, 10000.0, 'BUY')).toBe(true);
    });

    it('B17.4: accepts sell proceeds identical to naive proceeds within epsilon', () => {
      expect(verifier.verify(10000.0, 10000.0, 'SELL')).toBe(true);
    });

    it('B17.5: massive price improvement (10,000 vs 15,000) passes verifier cleanly', () => {
      expect(verifier.verify(10000, 15000, 'BUY')).toBe(true);
      expect(verifier.verify(15000, 10000, 'SELL')).toBe(true);
    });
  });
}
