import { describe, expect, it } from 'vitest';
import {
  CarteaDonnelly2018Signals,
  ContStoikov2010Book,
  GatheralJaisson2018Rough,
} from '../../../src/desk/index';

describe('Quantitative Desk Models Waves 274-276 Suite', () => {
  it('Wave 274: Gatheral, Jaisson & Rosenbaum (2018) rough volatility scaling and forecast', () => {
    const logVol = [-1.8, -1.75, -1.82, -1.78, -1.85, -1.79, -1.83, -1.77, -1.81, -1.76, -1.84, -1.79];
    const res = GatheralJaisson2018Rough.computeGatheralJaisson2018RoughVol({
      logVolatilitySeries: logVol,
      lagSteps: [1, 2, 3, 4],
      momentOrderQ: 2.0,
      forecastHorizonSteps: 2,
    });

    expect(res.scalingPoints).toHaveLength(4);
    expect(res.estimatedHurstExponent).toBeGreaterThan(0);
    expect(res.estimatedHurstExponent).toBeLessThan(0.5);
    expect(res.isRoughRegime).toBe(true);
    expect(res.forecastedVolatility).toBeGreaterThan(0.1);
  });

  it('Wave 275: Cartea, Donnelly & Jaimungal (2018) multi-level order book signal execution', () => {
    const res = CarteaDonnelly2018Signals.computeCarteaDonnelly2018Signal({
      levels: [
        { bidVolume: 120, askVolume: 300 },
        { bidVolume: 150, askVolume: 280 },
        { bidVolume: 200, askVolume: 260 },
      ],
      depthDecayAlpha: 0.5,
      signalDriftKappa: 0.08,
      temporaryImpactEta: 0.01,
      baselineLiquidationRate: 10.0,
    });

    expect(res.multiLevelImbalance).toBeLessThan(0);
    expect(res.expectedShortTermDrift).toBeLessThan(0);
    // Negative imbalance (ask-heavy) accelerates sell liquidation urgency
    expect(res.signalAdjustedTradingRate).toBeGreaterThan(10.0);
    expect(res.executionUrgencyMultiplier).toBeGreaterThan(1.0);
  });

  it('Wave 276: Cont, Stoikov & Talreja (2010) stochastic order book depletion dynamics', () => {
    const res = ContStoikov2010Book.computeContStoikov2010BookDynamics({
      bidQueueSize: 400,
      askQueueSize: 100,
      limitArrivalRateLambda: 15.0,
      marketSweepRateMu: 25.0,
      cancellationRateTheta: 0.1,
    });

    expect(res.probMidPriceUpNext + res.probMidPriceDownNext).toBeCloseTo(1.0, 6);
    // Thin ask queue (100) depletes faster than thick bid queue (400), so probUp > 0.5
    expect(res.probMidPriceUpNext).toBeGreaterThan(0.5);
    expect(res.expectedAskDepletionTimeSec).toBeLessThan(res.expectedBidDepletionTimeSec);
  });
});
