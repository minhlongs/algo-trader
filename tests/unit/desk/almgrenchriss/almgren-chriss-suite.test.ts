import { describe, expect, it } from 'vitest';
import { AlmgrenChrissEngine } from '../../../../src/desk/almgrenchriss/almgren-chriss-engine';
import { AlmgrenChrissParams } from '../../../../src/desk/almgrenchriss/almgren-chriss-types';

describe('Almgren-Chriss (2000) Optimal Execution Suite (Desk 109)', () => {
  const baseParams: AlmgrenChrissParams = {
    totalShares: 100000,
    totalTime: 1.0,        // 1 day
    numIntervals: 5,
    volatility: 0.02,      // 2% daily vol
    riskAversion: 1e-6,    // moderate risk aversion
    eta: 2.5e-6,           // temporary impact
    gamma: 2.5e-7,         // permanent impact
  };

  it('should liquidate full inventory over time horizon ending at zero', () => {
    const schedule = AlmgrenChrissEngine.calculateTrajectory(baseParams);

    expect(schedule.trajectory.length).toBe(baseParams.numIntervals + 1);
    // Initial inventory matches total shares
    expect(schedule.trajectory[0].holdingsRemaining).toBeCloseTo(baseParams.totalShares, 3);
    // Final inventory equals 0
    expect(schedule.trajectory[baseParams.numIntervals].holdingsRemaining).toBeCloseTo(0.0, 3);

    // Sum of trade sizes must equal total shares
    const sumTrades = schedule.trajectory.reduce((acc, t) => acc + t.tradeSize, 0);
    expect(sumTrades).toBeCloseTo(baseParams.totalShares, 3);
  });

  it('should trade faster when risk aversion increases (front-loading inventory)', () => {
    const lowRiskParams: AlmgrenChrissParams = { ...baseParams, riskAversion: 1e-9 };
    const highRiskParams: AlmgrenChrissParams = { ...baseParams, riskAversion: 1e-4 };

    const lowRiskResult = AlmgrenChrissEngine.calculateTrajectory(lowRiskParams);
    const highRiskResult = AlmgrenChrissEngine.calculateTrajectory(highRiskParams);

    // High risk aversion should execute more shares in the first period to shed volatility risk
    expect(highRiskResult.trajectory[1].tradeSize).toBeGreaterThan(lowRiskResult.trajectory[1].tradeSize);

    // High risk aversion trades off lower variance for higher expected impact cost
    expect(highRiskResult.variance).toBeLessThan(lowRiskResult.variance);
    expect(highRiskResult.expectedCost).toBeGreaterThan(lowRiskResult.expectedCost);
  });

  it('should recover linear TWAP schedule when risk aversion approaches zero', () => {
    const riskNeutralParams: AlmgrenChrissParams = { ...baseParams, riskAversion: 0.0 };
    const result = AlmgrenChrissEngine.calculateTrajectory(riskNeutralParams);

    const expectedTradePerInterval = baseParams.totalShares / baseParams.numIntervals;
    for (let i = 1; i <= baseParams.numIntervals; i++) {
      expect(result.trajectory[i].tradeSize).toBeCloseTo(expectedTradePerInterval, 1);
    }
  });
});
