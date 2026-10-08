import { describe, expect, it } from 'vitest';
import { HuangStollEngine } from '../../../../src/desk/huangstoll/huang-stoll-engine';
import { HuangStollTick } from '../../../../src/desk/huangstoll/huang-stoll-types';

describe('HuangStollEngine Suite (Desk 82)', () => {
  const engine = new HuangStollEngine();

  // Synthetic tick generation with 3-way spread mechanics
  const generateMarketTicks = (n: number, halfSpread: number): HuangStollTick[] => {
    const ticks: HuangStollTick[] = [];
    let state = 12345;
    let mid = 100.0;
    let prevTrade = 1;

    for (let t = 0; t < n; t++) {
      state = (state * 1664525 + 1013904223) % 4294967296;
      const randVal = (state % 100) / 100.0;
      // Serial persistence pi ~ 0.65
      const trade = randVal < 0.65 ? prevTrade : -prevTrade;
      prevTrade = trade;

      // Midpoint revision with adverse selection + inventory cost
      const shock = (((state >> 8) % 100) - 50) / 1000.0;
      mid += 0.3 * halfSpread * trade - 0.2 * halfSpread * (ticks[t - 1]?.signedTrade ?? 0) + shock;

      const bid = mid - halfSpread;
      const ask = mid + halfSpread;
      const price = trade === 1 ? ask : bid;

      ticks.push({ price, bid, ask, signedTrade: trade });
    }
    return ticks;
  };

  it('should decompose spread into adverse selection, inventory, and order processing', () => {
    const ticks = generateMarketTicks(150, 0.05);
    const result = engine.decomposeSpread(ticks);

    expect(result.sampleSize).toBe(150);
    expect(result.adverseSelectionAlpha).toBeGreaterThanOrEqual(0.0);
    expect(result.inventoryHoldingBeta).toBeGreaterThanOrEqual(0.0);
    expect(result.orderProcessingGamma).toBeGreaterThan(0.0);
    expect(result.adverseSelectionAlpha + result.inventoryHoldingBeta).toBeLessThanOrEqual(1.0);
    expect(result.tradePersistencePi).toBeGreaterThan(0.0);
    expect(result.tradePersistencePi).toBeLessThan(1.0);
    expect(result.averageHalfSpread).toBeCloseTo(0.05, 2);
    expect(result.adverseSelectionCost).toBeGreaterThanOrEqual(0.0);
    expect(result.inventoryHoldingCost).toBeGreaterThanOrEqual(0.0);
    expect(result.orderProcessingCost).toBeGreaterThan(0.0);
  });

  it('should throw when tick observations are insufficient (< 20)', () => {
    const fewTicks: HuangStollTick[] = [
      { price: 100.05, bid: 100.0, ask: 100.1, signedTrade: 1 },
      { price: 99.95, bid: 99.9, ask: 100.0, signedTrade: -1 },
    ];
    expect(() => engine.decomposeSpread(fewTicks)).toThrow(
      'At least 20 tick observations required for Huang-Stoll spread decomposition'
    );
  });

  it('should preserve non-negative cost components across market conditions', () => {
    const ticks = generateMarketTicks(50, 0.12);
    const result = engine.decomposeSpread(ticks);

    expect(result.adverseSelectionCost + result.inventoryHoldingCost + result.orderProcessingCost).toBeGreaterThan(0);
    expect(result.averageHalfSpread).toBeGreaterThan(0);
  });
});
