import { describe, expect, it } from 'vitest';
import {
  Almgren2005Direct,
  Bouchaud2006Molasses,
  CarteaJaimungal2016Cointegrated,
} from '../../../src/desk/index';

describe('Quantitative Desk Models Waves 310-312 Suite', () => {
  it('Wave 310: Almgren et al. (2005) Direct Estimation of Equity Market Impact', () => {
    const res = Almgren2005Direct.Almgren2005Direct.evaluate({
      orderSharesX: 120000,
      averageDailyVolumeV: 2000000,
      executionDurationFractionT: 0.25,
      dailyVolatilityFractionSigma: 0.018,
    });
    expect(res.volumeFractionOrderSize).toBeCloseTo(0.06, 6);
    expect(res.participationRateRho).toBeCloseTo(0.24, 6);
    expect(res.permanentImpactBps).toBeGreaterThan(4.0);
    expect(res.temporaryCostComponentBps).toBeGreaterThan(10.0);
    expect(res.totalImplementationShortfallBps).toBeGreaterThan(12.0);
    expect(res.regime).toBe('HIGH_PARTICIPATION_URGENCY_SURCHARGE');
  });

  it('Wave 311: Cartea-Jaimungal (2016) Algorithmic Trading of Co-Integrated Assets', () => {
    const res = CarteaJaimungal2016Cointegrated.CarteaJaimungal2016Cointegrated.evaluate({
      currentSpreadX: 1.85,
      equilibriumTheta: 1.2,
      meanReversionKappa: 0.035,
      currentInventoryQ: 150,
      temporaryImpactK: 0.0025,
      runningInventoryPenaltyPhi: 0.00004,
      remainingHorizonSeconds: 180,
    });
    expect(res.spreadMispricingDelta).toBeCloseTo(0.65, 6);
    expect(res.halfLifeSeconds).toBeCloseTo(19.8042, 3);
    expect(res.meanReversionSignalRate).toBeLessThan(-100);
    expect(res.optimalSpreadTradingRateNu).toBeLessThan(-120);
    expect(res.regime).toBe('CONVERGENCE_ALPHA_ENTRY');
  });

  it('Wave 312: Bouchaud-Kockelkoren-Potters (2006) Liquidity Molasses & Critical Propagator', () => {
    const res = Bouchaud2006Molasses.Bouchaud2006Molasses.evaluate({
      orderSignHurstCorrelationGamma: 0.5,
      empiricalDecayExponentBeta: 0.25,
      impactScaleGamma0: 0.85,
      regularizerLagEll0: 1.0,
      evaluationLagTradesEll: 15,
    });
    expect(res.criticalPropagatorExponentBeta).toBeCloseTo(0.25, 6);
    expect(res.exponentDeviationFromCritical).toBeCloseTo(0.0, 6);
    expect(res.propagatorKernelAtLag).toBeCloseTo(0.425, 6);
    expect(res.diffusivePriceEfficiencyRatio).toBeCloseTo(1.0, 4);
    expect(res.regime).toBe('CRITICAL_DIFFUSIVE_BALANCE');
  });
});
