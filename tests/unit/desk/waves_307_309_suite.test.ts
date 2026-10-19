import { describe, expect, it } from 'vitest';
import {
  CarteaJaimungal2016Permanent,
  Gatheral2010ZeroIntelligence,
  Gueant2016BlockTrade,
} from '../../../src/desk/index';

describe('Quantitative Desk Models Waves 307-309 Suite', () => {
  it('Wave 307: Cartea-Jaimungal (2016) Optimal Execution with Permanent & Temporary Impact', () => {
    const res = CarteaJaimungal2016Permanent.CarteaJaimungal2016Permanent.evaluate({
      inventorySharesQ: 25000,
      remainingHorizonSeconds: 300,
      temporaryImpactK: 0.002,
      permanentImpactB: 0.0004,
      terminalPenaltyAlpha: 0.05,
      runningPenaltyPhi: 0.00001,
    });
    expect(res.wellPosedConvexityCondition).toBe(true);
    expect(res.optimalLiquidationRateNu).toBeGreaterThan(50);
    expect(res.permanentPriceDropExpected).toBeCloseTo(10.0, 4);
    expect(res.regime).toBe('WELL_POSED_HYPERBOLIC_DECAY');
  });

  it('Wave 308: Gueant (2016) Block Trade Pricing & Risk Liquidity Premium', () => {
    const res = Gueant2016BlockTrade.Gueant2016BlockTrade.evaluate({
      blockSizeSharesQ: 15000,
      referenceMidPriceS0: 150.0,
      permanentImpactGamma: 0.000005,
      temporaryImpactEta: 0.00002,
      riskAversionLambda: 0.0001,
      dailyVolatilityDollarSigma: 2.5,
    });
    expect(res.permanentImpactCostPerShare).toBeCloseTo(0.0375, 4);
    expect(res.executionRiskPremiumPerShare).toBeGreaterThan(1.0);
    expect(res.guaranteedBlockBidPrice).toBeLessThan(150.0);
    expect(res.discountBasisPoints).toBeGreaterThan(40);
    expect(res.regime).toBe('ELEVATED_RISK_LIQUIDITY_CHARGE');
  });

  it('Wave 309: Gatheral (2010) Zero-Intelligence Limit Order Book Queue Depletion', () => {
    const res = Gatheral2010ZeroIntelligence.Gatheral2010ZeroIntelligence.evaluate({
      limitArrivalScaleA: 12.0,
      powerLawExponentGamma: 1.8,
      marketOrderRateMu: 8.5,
      cancellationRateTheta: 0.9,
      currentBestQueueLots: 6,
    });
    expect(res.topTickArrivalRateLambda1).toBe(12.0);
    expect(res.impliedEquilibriumSpreadTicks).toBeGreaterThan(1.0);
    expect(res.queueDepletionProbability).toBe(1.0);
    expect(res.regime).toBe('IMMINENT_QUEUE_DEPLETION');
  });
});
