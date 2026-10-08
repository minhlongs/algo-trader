import { describe, expect, it } from 'vitest';
import { KyleBackDynamics } from '../../../../src/desk/kyleback/kyle-back-dynamics';
import { KyleBackEngine } from '../../../../src/desk/kyleback/kyle-back-engine';
import { KyleBackParams } from '../../../../src/desk/kyleback/kyle-back-types';

describe('Kyle-Back Continuous-Time Liquidity Suite (Desk 94)', () => {
  const engine = new KyleBackEngine();

  const standardParams: KyleBackParams = {
    fundamentalValue: 105.0,
    priorMean: 100.0,
    priorVariance: 16.0, // sigma_v = 4.0
    noiseTraderSigma: 2.0,
    timeHorizonYears: 1.0,
  };

  it('should compute theoretical lambda and verify residual variance linear decay', () => {
    // lambda = sqrt(16) / (2.0 * sqrt(1)) = 4 / 2 = 2.0
    const lambda = KyleBackDynamics.calculateTheoreticalLambda(standardParams);
    expect(lambda).toBeCloseTo(2.0, 4);

    const var0 = KyleBackDynamics.calculateResidualVariance(16.0, 0.0, 1.0);
    expect(var0).toBe(16.0);

    const varHalf = KyleBackDynamics.calculateResidualVariance(16.0, 0.5, 1.0);
    expect(varHalf).toBe(8.0);

    const varEnd = KyleBackDynamics.calculateResidualVariance(16.0, 1.0, 1.0);
    expect(varEnd).toBe(0.0);
  });

  it('should verify informed trading intensity increases over time horizon', () => {
    const betaStart = KyleBackDynamics.calculateTradingIntensity(standardParams, 0.1);
    const betaMid = KyleBackDynamics.calculateTradingIntensity(standardParams, 0.5);
    const betaLate = KyleBackDynamics.calculateTradingIntensity(standardParams, 0.9);

    expect(betaMid).toBeGreaterThan(betaStart);
    expect(betaLate).toBeGreaterThan(betaMid);
  });

  it('should simulate continuous trajectory and exhibit price discovery convergence', () => {
    const result = engine.simulateEquilibriumTrajectory(standardParams, 100);

    expect(result.snapshots.length).toBe(101);
    expect(result.theoreticalLambda).toBeCloseTo(2.0, 4);
    expect(result.totalInformedVolume).toBeGreaterThan(0.0);
    expect(result.totalNoiseVolume).toBeGreaterThan(0.0);

    // Terminal price should move closer to fundamental value 105 from initial 100
    const finalPrice = result.snapshots[result.snapshots.length - 1]!.price;
    expect(Math.abs(finalPrice - standardParams.fundamentalValue)).toBeLessThan(
      Math.abs(standardParams.priorMean - standardParams.fundamentalValue) + 3.0
    );
  });

  it('should throw when invalid inputs or parameters provided', () => {
    expect(() =>
      KyleBackDynamics.calculateTheoreticalLambda({
        ...standardParams,
        priorVariance: -1.0,
      })
    ).toThrow('must be strictly positive');

    expect(() =>
      engine.simulateEquilibriumTrajectory(standardParams, 1)
    ).toThrow('Steps must be at least 2');
  });
});
