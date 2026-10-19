import { describe, it, expect } from 'vitest';
import { LongstaffSchwartzEngine } from '../../../../src/desk/longstaffschwartz/ls-credit-engine';

describe('LongstaffSchwartzEngine — Two-Factor Interest Rate & Credit Risk Suite', () => {
  it('yields zero credit spread when write-down fraction is zero', () => {
    const res = LongstaffSchwartzEngine.calculate({
      assetValue: 120.0,
      defaultBarrier: 80.0,
      maturity: 3.0,
      writeDownFraction: 0.0,
      shortRate: 0.05,
      meanReversionSpeed: 0.2,
      longTermRate: 0.06,
      rateVol: 0.015,
      assetVol: 0.25,
      correlation: -0.1,
    });

    expect(res.defaultableBondPrice).toBeCloseTo(res.risklessBondPrice, 6);
    expect(res.creditSpreadBps).toBeCloseTo(0.0, 4);
    expect(res.expectedLossDiscount).toBeCloseTo(0.0, 6);
  });

  it('widens credit spreads when distance to default contracts', () => {
    const baseParams = {
      defaultBarrier: 100.0,
      maturity: 5.0,
      writeDownFraction: 0.45,
      shortRate: 0.04,
      meanReversionSpeed: 0.15,
      longTermRate: 0.05,
      rateVol: 0.012,
      assetVol: 0.2,
      correlation: -0.15,
    };

    const distressed = LongstaffSchwartzEngine.calculate({ ...baseParams, assetValue: 105.0 });
    const solvent = LongstaffSchwartzEngine.calculate({ ...baseParams, assetValue: 160.0 });

    expect(distressed.creditSpreadBps).toBeGreaterThan(solvent.creditSpreadBps);
    expect(distressed.distanceToDefault).toBeLessThan(solvent.distanceToDefault);
    expect(distressed.defaultableBondPrice).toBeLessThan(solvent.defaultableBondPrice);
  });

  it('reflects higher recovery write-down severity on bond pricing', () => {
    const baseParams = {
      assetValue: 125.0,
      defaultBarrier: 90.0,
      maturity: 2.5,
      shortRate: 0.035,
      meanReversionSpeed: 0.1,
      longTermRate: 0.04,
      rateVol: 0.01,
      assetVol: 0.22,
      correlation: 0.0,
    };

    const mildLoss = LongstaffSchwartzEngine.calculate({ ...baseParams, writeDownFraction: 0.2 });
    const severeLoss = LongstaffSchwartzEngine.calculate({ ...baseParams, writeDownFraction: 0.7 });

    expect(severeLoss.expectedLossDiscount).toBeGreaterThan(mildLoss.expectedLossDiscount);
    expect(severeLoss.creditSpreadBps).toBeGreaterThan(mildLoss.creditSpreadBps);
    expect(severeLoss.defaultableBondPrice).toBeLessThan(mildLoss.defaultableBondPrice);
  });

  it('handles correlation sensitivity between interest rates and firm asset value', () => {
    const base = {
      assetValue: 120.0,
      defaultBarrier: 85.0,
      maturity: 4.0,
      writeDownFraction: 0.5,
      shortRate: 0.05,
      meanReversionSpeed: 0.25,
      longTermRate: 0.05,
      rateVol: 0.02,
      assetVol: 0.3,
    };

    const negRho = LongstaffSchwartzEngine.calculate({ ...base, correlation: -0.5 });
    const posRho = LongstaffSchwartzEngine.calculate({ ...base, correlation: 0.5 });

    expect(negRho.creditSpreadBps).toBeGreaterThan(0.0);
    expect(posRho.creditSpreadBps).toBeGreaterThan(0.0);
  });

  it('validates input boundaries and throws on improper parameters', () => {
    expect(() =>
      LongstaffSchwartzEngine.calculate({
        assetValue: 0.0,
        defaultBarrier: 100.0,
        maturity: 1.0,
        writeDownFraction: 0.5,
        shortRate: 0.05,
        meanReversionSpeed: 0.2,
        longTermRate: 0.05,
        rateVol: 0.01,
        assetVol: 0.2,
        correlation: 0.0,
      })
    ).toThrow('assetValue and defaultBarrier must be strictly positive');

    expect(() =>
      LongstaffSchwartzEngine.calculate({
        assetValue: 120.0,
        defaultBarrier: 100.0,
        maturity: 1.0,
        writeDownFraction: 1.5,
        shortRate: 0.05,
        meanReversionSpeed: 0.2,
        longTermRate: 0.05,
        rateVol: 0.01,
        assetVol: 0.2,
        correlation: 0.0,
      })
    ).toThrow('writeDownFraction must be within [0, 1]');
  });
});
