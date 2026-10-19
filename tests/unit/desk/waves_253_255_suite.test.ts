import { describe, expect, it } from 'vitest';
import {
  AlmgrenPowerLawV2,
  GatheralSchied2012,
  AvellanedaGueantJump,
} from '../../../src/desk/index';

describe('Quantitative Desk Models (Waves 253 - 255)', () => {
  it('Wave 253: Almgren (2003) Non-Linear Power-Law Execution', () => {
    const neutralConfig: AlmgrenPowerLawV2.AlmgrenPowerLawV2Config = {
      totalSharesX0: 1000,
      timeHorizonT: 1.0,
      eta: 0.05,
      powerAlpha: 0.5,
      riskLambda: 0,
      sigma: 0.2,
      steps: 10,
    };
    const neutral = AlmgrenPowerLawV2.computeAlmgrenPowerLawTrajectory(neutralConfig);
    expect(neutral.inventoryTrajectory[0]).toBe(1000);
    expect(neutral.inventoryTrajectory[10]).toBe(0);
    expect(neutral.expectedShortfall).toBeGreaterThan(0);

    const averseConfig: AlmgrenPowerLawV2.AlmgrenPowerLawV2Config = {
      ...neutralConfig,
      riskLambda: 0.05,
    };
    const averse = AlmgrenPowerLawV2.computeAlmgrenPowerLawTrajectory(averseConfig);
    expect(averse.inventoryTrajectory[5]).toBeLessThan(neutral.inventoryTrajectory[5]);
    expect(averse.varianceShortfall).toBeLessThan(neutral.varianceShortfall);
  });

  it('Wave 254: Gatheral, Schied & Slynko (2012) Transient Decay & No-Arbitrage', () => {
    const config: GatheralSchied2012.GatheralSchied2012Config = {
      kernelType: 'POWER_LAW',
      gammaScale: 1.0,
      decayAlpha: 0.5,
      offsetTau0: 1.0,
      timeStepDeltaT: 0.5,
      matrixDimensionN: 4,
    };
    const res = GatheralSchied2012.evaluateGramImpactMatrix(config);
    expect(res.isPositiveDefinite).toBe(true);
    expect(res.dynamicArbitrageFree).toBe(true);
    expect(res.minimumPivot).toBeGreaterThan(0);

    const n = res.gramMatrix.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        expect(res.gramMatrix[i][j]).toBeCloseTo(res.gramMatrix[j][i], 6);
        let recon = 0;
        for (let k = 0; k <= Math.min(i, j); k++) {
          recon += res.choleskyFactor[i][k] * res.choleskyFactor[j][k];
        }
        expect(recon).toBeCloseTo(res.gramMatrix[i][j], 4);
      }
    }
  });

  it('Wave 255: Avellaneda-Stoikov / Guéant Jump-Diffusion Market Making', () => {
    const baseConfig: AvellanedaGueantJump.AvellanedaGueantJumpConfig = {
      riskGamma: 0.1,
      volatilitySigma: 0.2,
      jumpIntensityLambda: 0,
      jumpMeanMu: 0,
      jumpSigma: 0,
      terminalTimeT: 1.0,
      kappaOrderBook: 1.5,
      midPriceS: 100.0,
      inventoryQ: 0,
      tickSize: 0.01,
    };
    const qZeroNoJump = AvellanedaGueantJump.computeAvellanedaGueantJumpQuotes(baseConfig);
    const withJumps = AvellanedaGueantJump.computeAvellanedaGueantJumpQuotes({
      ...baseConfig,
      jumpIntensityLambda: 2.0,
      jumpMeanMu: 0.05,
      jumpSigma: 0.1,
    });
    expect(withJumps.jumpVarianceHazard).toBeGreaterThan(0);
    expect(withJumps.totalSpread).toBeGreaterThan(qZeroNoJump.totalSpread);

    const longInventory = AvellanedaGueantJump.computeAvellanedaGueantJumpQuotes({
      ...baseConfig,
      inventoryQ: 5,
    });
    expect(longInventory.reservationPrice).toBeLessThan(100.0);
    expect(longInventory.deltaA).toBeLessThan(longInventory.deltaB);
    expect(longInventory.askPrice).toBeGreaterThan(longInventory.bidPrice);
  });
});
