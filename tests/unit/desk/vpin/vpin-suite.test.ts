import { describe, it, expect } from 'vitest';
import { VpinToxicityCalculator } from '../../../../src/desk/vpin/vpin-toxicity-calculator';
import { TradeTick } from '../../../../src/desk/vpin/vpin-types';

describe('Order Flow Toxicity & VPIN Desk Suite', () => {
  it('calculates VPIN toxicity score across volume buckets', () => {
    const calculator = new VpinToxicityCalculator();

    // Synthesize trade ticks with informed sell flow (falling prices)
    const ticks: TradeTick[] = [];
    let price = 100.0;
    for (let i = 0; i <= 200; i++) {
      // Steady price drops with high volume -> heavy sell toxicity
      price -= 0.05;
      ticks.push({
        timestampMs: 1000 + i * 100,
        price,
        volume: 250,
      });
    }

    // Total volume in intervals = 200 * 250 = 50,000 shares
    // Bucket size = 1,000 shares -> 50 completed buckets
    const res = calculator.calculateVpin(ticks, 1000, 30, 0.35);

    expect(res.completedBucketsCount).toBe(50);
    expect(res.vpinScore).toBeGreaterThan(0.35);
    expect(res.isToxicFlow).toBe(true);
    expect(['ELEVATED', 'EXTREME']).toContain(res.toxicityRegime);
  });

  it('reports low toxicity for balanced two-sided trading', () => {
    const calculator = new VpinToxicityCalculator();

    const ticks: TradeTick[] = [];
    let price = 50.0;
    for (let i = 0; i <= 200; i++) {
      price += (i % 2 === 0 ? 0.05 : -0.05); // oscillating price
      ticks.push({
        timestampMs: 1000 + i * 100,
        price,
        volume: 250,
      });
    }

    const res = calculator.calculateVpin(ticks, 1000, 30, 0.35);
    expect(res.completedBucketsCount).toBe(50);
    expect(res.vpinScore).toBeLessThan(0.30);
  });
});
