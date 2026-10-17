import { describe, expect, it } from 'vitest';
import {
  Cont2011OrderBookQueuing,
  Gatheral2014VolatilityRough,
  Gueant2015MultiAssetLiq,
} from '../../../src/desk/index';

describe('Quantitative Desk Models Waves 320-322', () => {
  it('Wave 320: Gueant2015MultiAssetLiq evaluates cross-hedged covariance risk gradient and quote skew', () => {
    const res = Gueant2015MultiAssetLiq.Gueant2015MultiAssetLiq.evaluate({
      inventoryAsset1Shares: 1000,
      inventoryAsset2Shares: -800,
      volAsset1Usd: 0.5,
      volAsset2Usd: 0.5,
      correlationRho: 0.8,
      riskAversionGamma: 0.01,
      intensityDecayKappa: 1.0,
    });
    expect(res.marginalRiskGradientAsset1).toBeCloseTo(90, 4);
    expect(res.reservationSkewUsd).toBeCloseTo(0.45, 4);
    expect(res.optimalAskOffsetAsset1Usd).toBeLessThan(
      res.optimalBidOffsetAsset1Usd
    );
    expect(res.regime).toBe('CROSS_HEDGED');
  });

  it('Wave 321: Gatheral2014VolatilityRough estimates fractional Hurst exponent H < 0.5 from log-vol variogram', () => {
    const res =
      Gatheral2014VolatilityRough.Gatheral2014VolatilityRough.evaluate({
        lagFineDaysDelta1: 1,
        lagCoarseDaysDelta2: 16,
        variogramMomentLag1: 0.1,
        variogramMomentLag2: 0.1 * Math.pow(16, 0.28),
        momentOrderQ: 2,
      });
    expect(res.estimatedHurstExponentH).toBeCloseTo(0.14, 4);
    expect(res.roughnessIndexAlpha).toBeCloseTo(-0.36, 4);
    expect(res.regime).toBe('ROUGH_FRACTIONAL');
  });

  it('Wave 322: Cont2011OrderBookQueuing computes heavy-traffic up-tick probability from queue imbalance', () => {
    const res = Cont2011OrderBookQueuing.Cont2011OrderBookQueuing.evaluate({
      bidQueueSizeLots: 300,
      askQueueSizeLots: 100,
      limitArrivalRateLambda: 12,
      marketPlusCancelDepletionRateMu: 15,
    });
    expect(res.queueImbalanceRatio).toBeCloseTo(0.5, 5);
    expect(res.upTickProbability).toBeCloseTo(0.75, 5);
    expect(res.expectedMidMoveSign).toBeCloseTo(0.5, 5);
    expect(res.regime).toBe('UPWARD_PRESSURE');
  });
});
