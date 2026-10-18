// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import {
  AvellanedaStoikov2008Reservation,
  GlostenMilgrom1985SequentialTrade,
  Kyle1985ContinuousAuction,
  OpenCoreSaas2026Monetization,
} from '../../../src/desk/index';
import { hawkesRadarQuerySchema } from '../../../src/platform/api/routes/stitch-cockpit-schemas';

describe('Quantitative Desk Triad Waves 336-338 & UI/UX Pro Max v4 Suite', () => {
  it('Wave 336: Avellaneda & Stoikov (2008) computes inventory skew, reservation price, and optimal quotes', () => {
    const engine = new AvellanedaStoikov2008Reservation.AvellanedaStoikov2008Engine();
    const longInventory = engine.computeOptimalQuotes({
      midPrice: 100,
      inventoryUnits: 5,
      riskAversionGamma: 0.2,
      volatilitySigma: 0.5,
      timeRemainingHorizon: 1,
      orderBookDensityKappa: 1.5,
      baseArrivalRateA: 2.0,
    });
    expect(longInventory.reservationPrice).toBeLessThan(100);
    expect(longInventory.optimalSpread).toBeGreaterThan(0);
    expect(longInventory.optimalAskPrice).toBeGreaterThan(longInventory.optimalBidPrice);
    // Long inventory skews quotes downward, making ask closer to mid and higher fill intensity than bid
    expect(longInventory.askFillIntensityHz).toBeGreaterThan(longInventory.bidFillIntensityHz);
  });

  it('Wave 337: Glosten & Milgrom (1985) updates Bayesian beliefs and widens spread with informed share', () => {
    const engine = new GlostenMilgrom1985SequentialTrade.GlostenMilgrom1985Engine();
    const lowInformed = engine.evaluateSequentialQuote({
      lowValueVL: 90,
      highValueVH: 110,
      priorProbHighMu: 0.5,
      informedTraderShareAlpha: 0.1,
    });
    const highInformed = engine.evaluateSequentialQuote({
      lowValueVL: 90,
      highValueVH: 110,
      priorProbHighMu: 0.5,
      informedTraderShareAlpha: 0.4,
    });
    expect(lowInformed.unconditionalFairValue).toBe(100);
    expect(highInformed.adverseSelectionSpread).toBeGreaterThan(lowInformed.adverseSelectionSpread);
    expect(highInformed.posteriorMuAfterBuy).toBeGreaterThan(0.5);
    expect(highInformed.posteriorMuAfterSell).toBeLessThan(0.5);
  });

  it('Wave 338: Kyle (1985) solves continuous insider auction lambda, depth, and residual variance', () => {
    const engine = new Kyle1985ContinuousAuction.Kyle1985AuctionEngine();
    const eq = engine.solveLinearEquilibrium({
      priorPrice0: 100,
      assetValueStdSigmaV: 4,
      noiseVolumeStdSigmaU: 20,
      aggregateOrderFlowY: 15,
    });
    // lambda = 4 / (2 * 20) = 0.1
    expect(eq.kyleLambda).toBeCloseTo(0.1, 5);
    expect(eq.marketDepthInverseLambda).toBeCloseTo(10, 5);
    expect(eq.clearingPrice).toBeCloseTo(101.5, 5);
    expect(eq.postAuctionVarianceSigma1).toBeCloseTo(8, 5);
  });

  it('UI/UX Pro Max v4: audits all 16 HTML files (15 Stitch screens + index.html) and validates Hawkes Radar #15', () => {
    const auditor = new OpenCoreSaas2026Monetization.UiUxProMaxAuditor();
    const summary = auditor.auditPublicDirectory();
    expect(summary.passedAllScreens).toBe(true);
    expect(summary.auditedScreensCount).toBeGreaterThanOrEqual(16);
    expect(summary.averageScorePct).toBe(100);

    const cockpit = new OpenCoreSaas2026Monetization.StitchUiCockpitEngine();
    const parsed = hawkesRadarQuerySchema.parse({ inventoryUnits: '4.5', riskAversionGamma: '0.15' });
    const radar = cockpit.getHawkesRadarSnapshot(parsed.inventoryUnits, parsed.riskAversionGamma);
    expect(radar.file).toBe('site/public/hawkes-orderflow-radar.html');
    expect(radar.venues.length).toBe(4);
    expect(radar.optimalAskUsd).toBeGreaterThan(radar.optimalBidUsd);
    expect(radar.aggregateBranchingRatio).toBeLessThan(1);
  });
});
