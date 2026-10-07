import { describe, it, expect } from 'vitest';
import { ContinuousPolicyAgent } from '../../../../src/desk/rl/continuous-policy-agent';
import { SabrVolSurfaceCalibrator } from '../../../../src/desk/rl/sabr-vol-surface-calibrator';
import { RegimeJumpDiffusionFilter } from '../../../../src/desk/rl/regime-jump-diffusion-filter';

describe('Continuous RL & Dynamic Volatility Surface Suite', () => {
  describe('ContinuousPolicyAgent', () => {
    it('widens quoting spreads and adjusts inventory skew under informed flow', () => {
      const agent = new ContinuousPolicyAgent({
        baseSpreadMultiplier: 1.0,
        inventoryRiskAversion: 0.1,
        toxicitySensitivity: 3.0,
      });

      // Normal state with 0 inventory and 0 toxicity
      const normalAction = agent.selectAction({
        midPrice: 100,
        microPrice: 100,
        spreadBps: 10,
        orderBookImbalance: 0,
        kyleLambda: 0.001,
        vpinToxicity: 0,
        inventoryUnits: 0,
      });

      expect(normalAction.bidSpreadMultiplier).toBe(1.0);
      expect(normalAction.askSpreadMultiplier).toBe(1.0);

      // Stressed state with high inventory and toxic VPIN
      const stressedAction = agent.selectAction({
        midPrice: 100,
        microPrice: 100,
        spreadBps: 10,
        orderBookImbalance: 0.5,
        kyleLambda: 0.005,
        vpinToxicity: 0.8,
        inventoryUnits: 5,
      });

      expect(stressedAction.bidSpreadMultiplier).toBeGreaterThan(1.5);
      expect(stressedAction.targetDeltaHedgeUnits).toBeLessThan(0);
    });
  });

  describe('SabrVolSurfaceCalibrator', () => {
    it('computes Hagan SABR implied volatility smile across strikes', () => {
      const calibrator = new SabrVolSurfaceCalibrator();
      const params = calibrator.calibrateAtmVol(100, 0.40);

      const atmVol = calibrator.calculateImpliedVol(params, {
        strikePrice: 100,
        forwardPrice: 100,
        expiryYears: 0.25,
        impliedVol: 0.40,
      });
      expect(atmVol).toBeGreaterThan(0.2);

      const otmPutVol = calibrator.calculateImpliedVol(params, {
        strikePrice: 85,
        forwardPrice: 100,
        expiryYears: 0.25,
        impliedVol: 0,
      });
      expect(otmPutVol).toBeGreaterThan(0.2);
    });
  });

  describe('RegimeJumpDiffusionFilter', () => {
    it('detects structural volatility jumps during market shocks', () => {
      const filter = new RegimeJumpDiffusionFilter(0.05, 0.2);

      // Calm regime
      const calm = filter.updateObservation(0.01, 0.18);
      expect(calm.currentRegime).toBe('LOW_VOL_CALM');

      // Massive jump innovation
      const jump = filter.updateObservation(0.25, 0.85);
      expect(jump.currentRegime).toBe('JUMP_DISCONTINUOUS');
      expect(jump.jumpProbability).toBeGreaterThan(0.5);
    });
  });
});
