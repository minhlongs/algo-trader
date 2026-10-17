import { describe, expect, it } from 'vitest';
import {
  GatheralSchied2013Exponential,
  GueantLehalleTapia2012Portfolio,
  WyartBouchaud2008SpreadImpact,
} from '../../../src/desk/index';

describe('Quantitative Desk Models Waves 313-315', () => {
  it('Wave 313: GatheralSchied2013Exponential computes boundary impulses and continuous rate', () => {
    const res =
      GatheralSchied2013Exponential.GatheralSchied2013Exponential.evaluate({
        initialInventorySharesX0: 10000,
        resilienceRateRhoPerSec: 0.05,
        horizonSecondsT: 160,
        bookDepthSharesPerTickK: 500,
      });
    expect(res.boundaryImpulseShares).toBeCloseTo(1000, 4);
    expect(res.continuousTradingRateSharesPerSec).toBeCloseTo(50, 4);
    expect(res.continuousVolumeShareFraction).toBeCloseTo(0.8, 4);
    expect(res.regime).toBe('CONTINUOUS_RESILIENT');
  });

  it('Wave 314: GueantLehalleTapia2012Portfolio evaluates cross-hedged covariance damping', () => {
    const hedged =
      GueantLehalleTapia2012Portfolio.GueantLehalleTapia2012Portfolio.evaluate({
        inventoryAsset1Shares: 5000,
        inventoryAsset2Shares: -4000,
        volatilityAsset1Usd: 0.4,
        volatilityAsset2Usd: 0.4,
        correlationRho12: 0.75,
        riskAversionGamma: 1e-4,
        temporaryImpactEta1: 2e-4,
        remainingHorizonSec: 120,
      });
    expect(hedged.coupledEffectiveInventory1).toBeCloseTo(2000, 4);
    expect(hedged.hedgeState).toBe('CROSS_HEDGED_DAMPED');
    expect(hedged.optimalLiquidationRate1SharesPerSec).toBeGreaterThan(0);
  });

  it('Wave 315: WyartBouchaud2008SpreadImpact evaluates ecological spread-impact balance', () => {
    const eq = WyartBouchaud2008SpreadImpact.WyartBouchaud2008SpreadImpact.evaluate({
      observedBidAskSpreadTicks: 2.0,
      lagOneResponseImpactTicksR1: 1.0,
      volatilityPerTradeTicksSigma1: 1.5,
      marketMakerCompetitionAlpha: 1.0,
    });
    expect(eq.equilibriumZeroProfitSpreadTicks).toBeCloseTo(2.0, 4);
    expect(eq.marketMakingEdgeTicksPerTrade).toBeCloseTo(0.0, 4);
    expect(eq.ecologyRegime).toBe('COMPETITIVE_ZERO_PROFIT');
  });
});
