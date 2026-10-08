import { describe, expect, it } from 'vitest';
import { BondConvexityEngine } from '../../../../src/desk/convexity/bond-convexity-engine';
import { BarbellBulletArbitrageur } from '../../../../src/desk/convexity/barbell-bullet-arbitrageur';
import { BondPricingTerms, BarbellBulletTrade } from '../../../../src/desk/convexity/convexity-types';

describe('BondConvexityEngine & BarbellBulletArbitrageur Suite', () => {
  const engine = new BondConvexityEngine();
  const arbitrageur = new BarbellBulletArbitrageur();

  const standardBond: BondPricingTerms = {
    bondId: 'UST-10Y-BENCHMARK',
    couponRatePct: 4.0,
    maturityYears: 10.0,
    yieldPct: 4.5,
    parValueUsd: 1000.0,
    couponFrequencyPerYear: 2,
  };

  it('should accurately compute present value, duration and effective convexity', () => {
    const result = engine.analyzeConvexity(standardBond);

    expect(result.bondId).toBe('UST-10Y-BENCHMARK');
    expect(result.presentValueUsd).toBeGreaterThan(900);
    expect(result.presentValueUsd).toBeLessThan(1000); // Trading at discount since YTM > Coupon
    expect(result.modifiedDurationYears).toBeGreaterThan(7.0);
    expect(result.modifiedDurationYears).toBeLessThan(9.0);
    expect(result.effectiveConvexity).toBeGreaterThan(50.0);
    expect(result.macaulayDurationYears).toBeGreaterThan(result.modifiedDurationYears);
  });

  it('should estimate non-linear price changes under yield shocks', () => {
    const result = engine.analyzeConvexity(standardBond);

    // Yield drop of -100 bps (+1.0%)
    const pnlDrop = result.priceChangeEstimatePct(-1.0);
    expect(pnlDrop).toBeGreaterThan(7.0);

    // Yield jump of +100 bps (-1.0%)
    const pnlRise = result.priceChangeEstimatePct(1.0);
    expect(pnlRise).toBeLessThan(-7.0);

    // Convexity effect: Gain from drop exceeds loss from identical magnitude rise
    expect(pnlDrop + pnlRise).toBeGreaterThan(0);
  });

  it('should throw when shiftBps is zero or negligible', () => {
    expect(() => engine.analyzeConvexity(standardBond, 0.0)).toThrow('shiftBps must be non-zero');
  });

  it('should demonstrate barbell convexity advantage over duration-matched bullet portfolio', () => {
    const bulletBond: BondPricingTerms = {
      bondId: 'BULLET-7Y',
      couponRatePct: 4.0,
      maturityYears: 7.0,
      yieldPct: 4.0,
      parValueUsd: 1000.0,
      couponFrequencyPerYear: 2,
    };

    const shortBond: BondPricingTerms = {
      bondId: 'SHORT-2Y',
      couponRatePct: 4.0,
      maturityYears: 2.0,
      yieldPct: 4.0,
      parValueUsd: 1000.0,
      couponFrequencyPerYear: 2,
    };

    const longBond: BondPricingTerms = {
      bondId: 'LONG-20Y',
      couponRatePct: 4.0,
      maturityYears: 20.0,
      yieldPct: 4.0,
      parValueUsd: 1000.0,
      couponFrequencyPerYear: 2,
    };

    const trade: BarbellBulletTrade = {
      bulletBond,
      shortTenorBond: shortBond,
      longTenorBond: longBond,
    };

    const comparison = arbitrageur.compareBarbellVsBullet(trade);

    expect(comparison.barbellWeightShort).toBeGreaterThan(0);
    expect(comparison.barbellWeightLong).toBeGreaterThan(0);
    expect(comparison.barbellWeightShort + comparison.barbellWeightLong).toBeCloseTo(1.0, 4);

    // Strict positive curvature advantage
    expect(comparison.barbellConvexity).toBeGreaterThan(comparison.bulletConvexity);
    expect(comparison.convexityAdvantage).toBeGreaterThan(0);

    // Under large yield shock (e.g. +200 bps or -200 bps), barbell outperforms bullet
    const shockUp = comparison.pnlUnderYieldShockPct(2.0);
    expect(shockUp.netAdvantagePct).toBeGreaterThan(0);

    const shockDown = comparison.pnlUnderYieldShockPct(-2.0);
    expect(shockDown.netAdvantagePct).toBeGreaterThan(0);
  });
});
