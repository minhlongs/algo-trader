import { describe, expect, it } from 'vitest';
import {
  BouchaudFarmerLillo2009Digest,
  GatheralSchied2013Predatory,
  GueantLehalle2013Mm,
} from '../../../src/desk/index';

describe('Quantitative Desk Models Waves 277-279 Suite', () => {
  it('Wave 277: Gatheral & Schied (2013) transient resilience and predatory front-running', () => {
    const res = GatheralSchied2013Predatory.computeGatheralSchied2013Predatory({
      distressedInventoryQ0: 1000,
      horizonSec: 100,
      steps: 20,
      resilienceRateRho: 0.15,
      temporaryImpactEta: 0.005,
      permanentImpactGamma: 0.001,
      predatorParticipationAlpha: 0.35,
    });

    expect(res.trajectory).toHaveLength(21);
    expect(res.distressedExecutionCost).toBeGreaterThan(res.baselineUnpredatedCost);
    expect(res.predatoryCostInflationRatio).toBeGreaterThan(1.0);
    expect(res.trajectory[20].distressedInventory).toBeCloseTo(0, 5);
  });

  it('Wave 278: Guéant, Lehalle & Fernandez-Tapia (2013) inventory-bounded market making', () => {
    const res = GueantLehalle2013Mm.computeGueantLehalle2013MarketMaking({
      maxInventoryCapQ: 3,
      riskAversionGamma: 0.1,
      volatilitySigma: 0.3,
      orderBookIntensityA: 1.5,
      orderBookDecayKappa: 10.0,
    });

    expect(res.quotes).toHaveLength(7); // -3 to +3
    // At -Q (-3), ask quoting is disabled (null); at +Q (+3), bid quoting is disabled (null)
    expect(res.quotes[0].optimalAskSpread).toBeNull();
    expect(res.quotes[0].optimalBidSpread).not.toBeNull();
    expect(res.quotes[6].optimalBidSpread).toBeNull();
    expect(res.quotes[6].optimalAskSpread).not.toBeNull();
    expect(res.neutralFullSpread).toBeGreaterThan(0);
  });

  it('Wave 279: Bouchaud, Farmer & Lillo (2009) metaorder square-root impact and relaxation', () => {
    const res = BouchaudFarmerLillo2009Digest.computeBouchaudFarmerLillo2009Digest({
      metaorderSizeShares: 10000,
      dailyVolumeShares: 1000000,
      dailyVolatility: 0.02,
      yConstant: 0.7,
      executionDurationSteps: 10,
      postExecutionSteps: 10,
      signAutocorrGamma: 0.5,
    });

    expect(res.profile).toHaveLength(20);
    // Peak impact = 0.7 * 0.02 * sqrt(0.01) = 0.0014
    expect(res.peakImpactPct).toBeCloseTo(0.0014, 6);
    expect(res.permanentPlateauImpactPct).toBeLessThan(res.peakImpactPct);
    expect(res.relaxationRatio).toBeLessThan(1.0);
    expect(res.relaxationRatio).toBeGreaterThan(0.1);
  });
});
