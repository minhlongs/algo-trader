import { describe, expect, it } from 'vitest';
import { AlmgrenChrissTrajectoryEngine } from '../../../../src/desk/almgren/almgren-chriss-trajectory-engine';
import { LiquidationOrder, MarketImpactParameters } from '../../../../src/desk/almgren/almgren-types';

describe('AlmgrenChrissTrajectoryEngine Suite', () => {
  const engine = new AlmgrenChrissTrajectoryEngine();

  const standardOrder: LiquidationOrder = {
    totalSharesToLiquidate: 100000,
    totalTimeHorizonHours: 6.5,
    numberOfTradingIntervals: 13, // 30-minute intervals
    initialStockPriceUsd: 50.0,
    dailyVolatilityPct: 2.0,
  };

  it('should compute hyperbolic sine trajectory with front-loaded execution for risk-averse liquidation', () => {
    const riskAverseImpact: MarketImpactParameters = {
      permanentImpactGamma: 2.5e-7,
      temporaryImpactEta: 2.5e-6,
      riskAversionLambda: 1e-5, // High risk aversion
    };

    const result = engine.calculateOptimalTrajectory(standardOrder, riskAverseImpact);

    expect(result.trajectory.length).toBe(14); // 0 to N
    expect(result.trajectory[0]!.remainingShares).toBe(100000);
    expect(result.trajectory[13]!.remainingShares).toBe(0);

    // Front-loaded liquidation: first interval trade size should exceed later interval trade size
    const firstTrade = result.trajectory[1]!.tradeSharesThisInterval;
    const lastTrade = result.trajectory[13]!.tradeSharesThisInterval;
    expect(firstTrade).toBeGreaterThan(lastTrade);

    expect(result.halfLifeHours).toBeGreaterThan(0);
    expect(result.expectedTotalCostUsd).toBeGreaterThan(0);
    expect(result.varianceOfCostUsd).toBeGreaterThan(0);
    expect(result.riskAversionKappa).toBeGreaterThan(0);
  });

  it('should approximate linear TWAP trajectory under near-zero risk aversion', () => {
    const riskNeutralImpact: MarketImpactParameters = {
      permanentImpactGamma: 2.5e-7,
      temporaryImpactEta: 2.5e-6,
      riskAversionLambda: 1e-12, // Near zero risk aversion
    };

    const result = engine.calculateOptimalTrajectory(standardOrder, riskNeutralImpact);

    // Trade size should be relatively uniform across intervals
    const firstTrade = result.trajectory[1]!.tradeSharesThisInterval;
    const midTrade = result.trajectory[7]!.tradeSharesThisInterval;
    const lastTrade = result.trajectory[13]!.tradeSharesThisInterval;

    expect(Math.abs(firstTrade - midTrade)).toBeLessThan(100);
    expect(Math.abs(midTrade - lastTrade)).toBeLessThan(100);
  });

  it('should throw when input parameters are invalid', () => {
    const invalidOrder: LiquidationOrder = {
      ...standardOrder,
      totalSharesToLiquidate: -500,
    };

    const impact: MarketImpactParameters = {
      permanentImpactGamma: 1e-6,
      temporaryImpactEta: 1e-5,
      riskAversionLambda: 1e-6,
    };

    expect(() => engine.calculateOptimalTrajectory(invalidOrder, impact)).toThrow(
      'Valid order size, intervals and positive time horizon required'
    );
  });
});
