import { describe, it, expect } from 'vitest';
import { HurstParameterEstimator } from '../../../../src/desk/roughvol/hurst-parameter-estimator';
import { RoughBergomiCurveGenerator } from '../../../../src/desk/roughvol/rough-bergomi-curve-generator';
import { VolatilitySeriesInput } from '../../../../src/desk/roughvol/roughvol-types';

describe('Rough Volatility Fractional Brownian Desk Suite', () => {
  describe('HurstParameterEstimator', () => {
    it('estimates rough Hurst parameter H < 0.50 from variogram scaling', () => {
      const estimator = new HurstParameterEstimator();

      // High-frequency rough volatility series
      const vols: number[] = [
        0.20, 0.22, 0.19, 0.23, 0.18, 0.24, 0.17, 0.21, 0.25, 0.16,
        0.22, 0.19, 0.24, 0.18, 0.21, 0.26, 0.15, 0.22, 0.20, 0.25,
        0.18, 0.23, 0.19, 0.22, 0.17, 0.24, 0.18, 0.21, 0.25, 0.19,
      ];

      const input: VolatilitySeriesInput = {
        assetSymbol: 'SPX_LOGVOL',
        dailyVolatilityEstimates: vols,
      };

      const res = estimator.estimateHurst(input, 5);

      expect(res.hurstParameterH).toBeLessThan(0.50);
      expect(res.isRoughRegime).toBe(true);
      expect(res.lagMoments.length).toBeGreaterThan(0);
    });
  });

  describe('RoughBergomiCurveGenerator', () => {
    it('generates forward variance curve with steep short-tenor rough skew slope', () => {
      const generator = new RoughBergomiCurveGenerator();
      const tenors = [0.02, 0.05, 0.10, 0.25, 0.50, 1.0];

      const curve = generator.generateVarianceCurve(0.04, 0.12, tenors);

      expect(curve.length).toBe(6);
      expect(curve[0]!.timeToMaturityYears).toBe(0.02);
      // Rough regime: short-tenor skew slope is significantly steeper than long-tenor skew slope
      expect(Math.abs(curve[0]!.roughSkewSlope)).toBeGreaterThan(Math.abs(curve[5]!.roughSkewSlope));
    });
  });
});
