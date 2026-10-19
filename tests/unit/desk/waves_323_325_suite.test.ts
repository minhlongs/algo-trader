import { describe, expect, it } from 'vitest';
import {
  AlmgrenChriss2001Risk,
  Bouchaud2018TradesBook,
  Cartea2018SignalDecay,
} from '../../../src/desk/index';

describe('Quantitative Desk Models Waves 323-325', () => {
  it('Wave 323: AlmgrenChriss2001Risk computes efficient frontier urgency, half-life, and shortfall', () => {
    const res = AlmgrenChriss2001Risk.AlmgrenChriss2001Risk.evaluate({
      initialSharesX0: 10000,
      volatilityPerSecSigma: 0.02,
      temporaryImpactEta: 1e-4,
      permanentImpactGamma: 2e-5,
      riskAversionLambda: 0.01,
      horizonSecT: 60,
    });
    expect(res.urgencyRateKappa).toBeCloseTo(0.2, 5);
    expect(res.halfLifeSec).toBeCloseTo(Math.LN2 / 0.2, 4);
    expect(res.expectedPermanentCostUsd).toBeCloseTo(1000, 4);
    expect(res.expectedShortfallUsd).toBeCloseTo(2000, 3);
    expect(res.regime).toBe('AGGRESSIVE_URGENT');
  });

  it('Wave 324: Cartea2018SignalDecay discounts transient alpha drift and adjusts liquidation velocity', () => {
    const res = Cartea2018SignalDecay.Cartea2018SignalDecay.evaluate({
      inventorySharesQ: 500,
      alphaSignalInitial: -0.02,
      signalDecayRateKappaAlpha: 0.3,
      inventoryUrgencyKappaInv: 0.2,
      temporaryImpactEta: 1e-3,
    });
    expect(res.effectiveAlphaDiscountFactor).toBeCloseTo(2.0, 5);
    expect(res.alphaContributionRate).toBeCloseTo(-20, 5);
    expect(res.inventoryLiquidationRate).toBeCloseTo(100, 5);
    expect(res.netOptimalTradingRate).toBeCloseTo(120, 5);
    expect(res.regime).toBe('SIGNAL_ACCELERATED');
  });

  it('Wave 325: Bouchaud2018TradesBook evaluates latent liquidity absorption and propagator impact', () => {
    const res = Bouchaud2018TradesBook.Bouchaud2018TradesBook.evaluate({
      signedOrderVolumeLots: 400,
      visibleBookDepthLots: 1000,
      latentLiquidityMultiplier: 3.0,
      propagatorKernelAtLagG: 2.0,
      surpriseInnovationEpsilon: 1.0,
    });
    expect(res.effectiveTotalDepthLots).toBeCloseTo(4000, 5);
    expect(res.latentAbsorptionRatio).toBeCloseTo(0.75, 5);
    expect(res.propagatorPriceImpactTicks).toBeCloseTo(
      2.0 * Math.sqrt(0.1),
      4
    );
    expect(res.regime).toBe('LATENT_ABSORBED');
  });
});
