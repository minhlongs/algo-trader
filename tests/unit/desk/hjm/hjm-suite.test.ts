import { describe, expect, it } from 'vitest';
import { HjmEngine } from '../../../../src/desk/hjm/hjm-engine';
import { HjmVolatilityFactorFactory } from '../../../../src/desk/hjm/hjm-volatility-factors';
import {
  HjmBondOptionSpec,
  HjmForwardPoint,
  HjmSimulationConfig,
} from '../../../../src/desk/hjm/hjm-types';

describe('Heath-Jarrow-Morton (HJM) Multi-Factor Suite (Desk 93)', () => {
  const engine = new HjmEngine();

  const flatCurve: HjmForwardPoint[] = [
    { tenorYears: 0.25, instantaneousForwardRate: 0.04 },
    { tenorYears: 1.0, instantaneousForwardRate: 0.045 },
    { tenorYears: 2.0, instantaneousForwardRate: 0.05 },
    { tenorYears: 5.0, instantaneousForwardRate: 0.055 },
  ];

  const constantFactor = HjmVolatilityFactorFactory.createConstantFactor(
    'ParallelShift',
    0.015
  );
  const decayFactor = HjmVolatilityFactorFactory.createExponentialDecayFactor(
    'SlopeDecay',
    0.02,
    0.5
  );

  it('should calculate analytical no-arbitrage drift accurately for constant and decay factors', () => {
    // Constant factor drift: alpha(t, T) = sigma^2 * (T - t)
    const driftConst = engine.calculateNoArbitrageDrift([constantFactor], 0.0, 2.0);
    expect(driftConst).toBeCloseTo(0.015 * 0.015 * 2.0, 6);

    // Multi-factor drift is sum of factor drifts
    const driftMulti = engine.calculateNoArbitrageDrift(
      [constantFactor, decayFactor],
      0.0,
      2.0
    );
    expect(driftMulti).toBeGreaterThan(driftConst);
  });

  it('should interpolate initial forward rate curve correctly', () => {
    const f05 = engine.interpolateInitialForwardRate(flatCurve, 0.5);
    // Between 0.25 (0.04) and 1.0 (0.045), linear interpolation gives ~0.04167
    expect(f05).toBeGreaterThan(0.04);
    expect(f05).toBeLessThan(0.045);

    const fEarly = engine.interpolateInitialForwardRate(flatCurve, 0.1);
    expect(fEarly).toBe(0.04);

    const fLate = engine.interpolateInitialForwardRate(flatCurve, 10.0);
    expect(fLate).toBe(0.055);
  });

  it('should simulate forward rate curve trajectory and compute positive ZCB prices', () => {
    const config: HjmSimulationConfig = {
      timeHorizonYears: 1.0,
      dt: 0.25,
      tenorMaturities: [0.5, 1.0, 2.0, 3.0],
      numSimulations: 1,
    };

    const traj = engine.simulateTrajectory(
      flatCurve,
      [constantFactor, decayFactor],
      config
    );

    expect(traj.timestamps.length).toBe(5);
    expect(traj.shortRates.length).toBe(5);
    expect(traj.finalYieldCurve.forwardRates.length).toBe(4);

    for (const zcbPrice of traj.finalYieldCurve.zeroCouponBondPrices) {
      expect(zcbPrice).toBeGreaterThan(0.0);
      expect(zcbPrice).toBeLessThanOrEqual(1.0);
    }
  });

  it('should price European bond Call and Put options via Monte Carlo', () => {
    const callSpec: HjmBondOptionSpec = {
      optionExpiryYears: 0.5,
      bondMaturityYears: 2.0,
      strikePrice: 90.0,
      isCall: true,
      faceValue: 100.0,
    };

    const putSpec: HjmBondOptionSpec = {
      ...callSpec,
      isCall: false,
    };

    const callResult = engine.priceBondOptionMonteCarlo(
      flatCurve,
      [constantFactor],
      callSpec,
      50
    );

    const putResult = engine.priceBondOptionMonteCarlo(
      flatCurve,
      [constantFactor],
      putSpec,
      50
    );

    expect(callResult.optionPrice).toBeGreaterThanOrEqual(0.0);
    expect(putResult.optionPrice).toBeGreaterThanOrEqual(0.0);
    expect(callResult.expectedBondPrice).toBeGreaterThan(80.0);
    expect(callResult.expectedBondPrice).toBeLessThan(100.0);
  });

  it('should throw on invalid parameters or empty curve', () => {
    expect(() =>
      HjmVolatilityFactorFactory.createConstantFactor('Invalid', -0.01)
    ).toThrow('Volatility sigma0 must be strictly positive');

    expect(() => engine.interpolateInitialForwardRate([], 1.0)).toThrow(
      'Initial curve cannot be empty'
    );
  });
});
