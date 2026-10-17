import { describe, expect, it } from 'vitest';
import {
  computeKyleObizhaevaSmoothImpact,
  type ExecutionRateSlice,
  type KyleObizhaevaSmoothConfig,
} from '../../../src/desk/kyleobizhaewasmooth/kyle-obizhaeva-smooth-math';
import {
  computeAvellanedaStoikovHfQuotes,
  type AvellanedaStoikovHfConfig,
} from '../../../src/desk/avellanedastoikovhf/avellaneda-stoikov-hf-math';
import {
  computeOptimalFragmentedPlacement,
  type FragmentedAllocationRequest,
} from '../../../src/desk/contkukanovfragmented/cont-kukanov-fragmented-math';

describe('Quantitative Desk Waves 247-249 Suite', () => {
  it('Wave 247: Kyle, Obizhaeva & Wang (2020) smooth market impact and resiliency decay', () => {
    const config: KyleObizhaevaSmoothConfig = {
      transientLambda: 0.05,
      permanentMu: 0.001,
      resiliencyRho: 0.1, // 10% decay rate per second
    };

    const slices: ExecutionRateSlice[] = [
      { timestamp: 0, rateV: 100, duration: 10 },
      { timestamp: 10, rateV: 50, duration: 10 },
    ];

    // Evaluate immediately at t=20
    const impactAt20 = computeKyleObizhaevaSmoothImpact(slices, 20, config);
    expect(impactAt20.cumulativePermanentImpact).toBeCloseTo(0.001 * (100 * 10 + 50 * 10), 4);
    expect(impactAt20.currentTransientImpact).toBeGreaterThan(0);
    expect(impactAt20.totalMarketImpact).toBeGreaterThan(impactAt20.cumulativePermanentImpact);
    expect(impactAt20.resiliencyHalfLifeSec).toBeCloseTo(Math.LN2 / 0.1, 4);

    // Later at t=100, transient impact has decayed significantly
    const impactAt100 = computeKyleObizhaevaSmoothImpact(slices, 100, config);
    expect(impactAt100.currentTransientImpact).toBeLessThan(impactAt20.currentTransientImpact);
    expect(impactAt100.cumulativePermanentImpact).toBeCloseTo(impactAt20.cumulativePermanentImpact, 4);
  });

  it('Wave 248: Avellaneda & Stoikov (2008) high-frequency inventory penalization and skewing', () => {
    const neutralConfig: AvellanedaStoikovHfConfig = {
      midPriceS: 100.0,
      inventoryQ: 0,
      volatilitySigma: 0.2,
      riskAversionGamma: 0.1,
      orderBookLiquidityKappa: 1.5,
      timeRemainingSec: 1000,
      adverseSelectionAlpha: 0.0,
    };

    const neutralQuotes = computeAvellanedaStoikovHfQuotes(neutralConfig);
    expect(neutralQuotes.reservationPrice).toBe(100.0);
    expect(neutralQuotes.bidPrice).toBeLessThan(100.0);
    expect(neutralQuotes.askPrice).toBeGreaterThan(100.0);
    expect(neutralQuotes.spreadWidth).toBeGreaterThan(0);

    // Long inventory: reservation price drops, quotes skew downward to offload
    const longConfig: AvellanedaStoikovHfConfig = {
      ...neutralConfig,
      inventoryQ: 50,
    };
    const longQuotes = computeAvellanedaStoikovHfQuotes(longConfig);
    expect(longQuotes.reservationPrice).toBeLessThan(neutralQuotes.reservationPrice);
    expect(longQuotes.bidPrice).toBeLessThan(neutralQuotes.bidPrice);
    expect(longQuotes.askPrice).toBeLessThan(neutralQuotes.askPrice);
  });

  it('Wave 249: Cont & Kukanov (2014) optimal order placement across fragmented venues', () => {
    const request: FragmentedAllocationRequest = {
      totalOrderQuantity: 1000,
      underfillPenaltyPerShare: 0.05,
      venues: [
        { venueId: 'venue_A', depthAvailable: 400, feePerShare: 0.002, fillProbability: 0.95 },
        { venueId: 'venue_B', depthAvailable: 500, feePerShare: -0.001, fillProbability: 0.85 }, // Maker rebate
        { venueId: 'venue_C', depthAvailable: 600, feePerShare: 0.01, fillProbability: 0.5 },
      ],
    };

    const result = computeOptimalFragmentedPlacement(request);
    expect(result.totalAllocated).toBe(1000);
    expect(result.expectedShortfallShares).toBeGreaterThan(0);
    expect(result.totalExpectedCost).toBeGreaterThan(0);

    // Primary allocations should prefer venue A and B over C
    const allocC = result.allocations.find((a) => a.venueId === 'venue_C')?.allocatedShares ?? 0;
    expect(allocC).toBe(100); // 1000 - 400 - 500 = 100
  });
});
