import { describe, expect, it } from 'vitest';
import { AmihudEngine } from '../../../../src/desk/rollamihud/amihud-engine';
import { RollEstimator } from '../../../../src/desk/rollamihud/roll-estimator';
import { MarketTradePoint } from '../../../../src/desk/rollamihud/roll-amihud-types';

describe('Roll & Amihud Liquidity Suite (Desk 91)', () => {
  const engine = new AmihudEngine();

  // Synthetic bouncing prices (bid-ask bounce implies negative serial covariance)
  const bouncingTrades: MarketTradePoint[] = [
    { timestamp: 1000, price: 100.0, volume: 500, tradeDirection: 1 },
    { timestamp: 2000, price: 99.8, volume: 600, tradeDirection: -1 },
    { timestamp: 3000, price: 100.0, volume: 450, tradeDirection: 1 },
    { timestamp: 4000, price: 99.8, volume: 700, tradeDirection: -1 },
    { timestamp: 5000, price: 100.0, volume: 550, tradeDirection: 1 },
    { timestamp: 6000, price: 99.8, volume: 650, tradeDirection: -1 },
  ];

  it('should detect bid-ask bounce and compute positive Roll effective spread', () => {
    const res = RollEstimator.calculateRollSpread(bouncingTrades);

    expect(res.hasNegativeAutocovariance).toBe(true);
    expect(res.autocovariance).toBeLessThan(0.0);
    expect(res.effectiveSpread).toBeGreaterThan(0.1);
    expect(res.effectiveSpreadPct).toBeGreaterThan(0.1);
  });

  it('should calculate Amihud ILLIQ ratio and classify regime accurately', () => {
    const amihudRes = engine.calculateAmihudIlliq(bouncingTrades);

    expect(amihudRes.rawAmihudRatio).toBeGreaterThan(0.0);
    expect(amihudRes.scaledAmihudRatio).toBeGreaterThan(0.0);
    expect(amihudRes.averageDollarVolume).toBeGreaterThan(40000.0);
    expect(['HIGH_LIQUIDITY', 'NORMAL', 'ELEVATED_IMPACT', 'ILLIQUID_DISTRESSED']).toContain(
      amihudRes.liquidityRegime
    );
  });

  it('should assess composite market liquidity report and price impact', () => {
    const report = engine.assessMarketLiquidity(bouncingTrades);

    expect(report.compositeLiquidityScore).toBeGreaterThan(0);
    expect(report.compositeLiquidityScore).toBeLessThanOrEqual(100);
    expect(report.rollSpread.effectiveSpread).toBeGreaterThan(0.0);
    expect(report.impact.kyleLambdaProxy).toBeGreaterThanOrEqual(0.0);
  });

  it('should throw on insufficient or non-positive data', () => {
    expect(() =>
      RollEstimator.calculateRollSpread([{ timestamp: 1, price: 100, volume: 10 }])
    ).toThrow('At least 3 price points required');

    expect(() =>
      engine.calculateAmihudIlliq([
        { timestamp: 1, price: -10, volume: 10 },
        { timestamp: 2, price: 20, volume: 10 },
      ])
    ).toThrow('Prices must be strictly positive');
  });
});
