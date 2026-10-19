// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import {
  Hasbrouck1995InfoShare,
  HuangStoll1997ThreeWay,
  OpenCoreSaas2026Monetization,
  Roll1984ImplicitSpread,
} from '../../../src/desk/index';
import { queueReactiveQuerySchema } from '../../../src/platform/api/routes/stitch-cockpit-schemas';

describe('Quantitative Desk Triad Waves 339-341 & UI/UX Pro Max v5 Suite', () => {
  it('Wave 339: Roll (1984) estimates implicit effective spread from negative serial autocovariance', () => {
    const engine = new Roll1984ImplicitSpread.Roll1984SpreadEngine();
    // Alternating bid-ask bounce between 99.95 and 100.05 (true spread = 0.10)
    const bouncePrices = [100.05, 99.95, 100.05, 99.95, 100.05, 99.95, 100.05, 99.95];
    const result = engine.estimateImplicitSpread({
      tradePrices: bouncePrices,
      referenceMidPrice: 100,
    });
    expect(result.bidAskBounceDetected).toBe(true);
    expect(result.serialAutocovariance).toBeLessThan(0);
    expect(result.impliedSpreadPriceUnits).toBeGreaterThan(0.15);
    expect(result.impliedSpreadBps).toBeGreaterThan(15);
  });

  it('Wave 340: Hasbrouck (1995) computes VECM venue information shares and identifies price leader', () => {
    const engine = new Hasbrouck1995InfoShare.Hasbrouck1995InfoShareEngine();
    const res = engine.computeInformationShares({
      venues: [
        { venue: 'Binance TY3', longRunImpactPsi: 1.2, innovationStdSigma: 0.8 },
        { venue: 'OKX HKG', longRunImpactPsi: 0.9, innovationStdSigma: 0.6 },
        { venue: 'Bybit SIN', longRunImpactPsi: 0.5, innovationStdSigma: 0.5 },
      ],
    });
    expect(res.leaderVenue).toBe('Binance TY3');
    expect(res.leaderInformationSharePct).toBeGreaterThan(50);
    const totalPct = res.venues.reduce((acc, v) => acc + v.informationSharePct, 0);
    expect(totalPct).toBeCloseTo(100, 1);
  });

  it('Wave 341: Huang & Stoll (1997) decomposes spread into adverse selection, inventory, and order processing', () => {
    const engine = new HuangStoll1997ThreeWay.HuangStoll1997Engine();
    const res = engine.decomposeSpread({
      tradedSpreadBps: 2.0,
      adverseSelectionAlpha: 0.45,
      inventoryHoldingBeta: 0.2,
    });
    expect(res.orderProcessingShare).toBeCloseTo(0.35, 4);
    expect(res.adverseSelectionBps).toBeCloseTo(0.9, 4);
    expect(res.inventoryHoldingBps).toBeCloseTo(0.4, 4);
    expect(res.orderProcessingBps).toBeCloseTo(0.7, 4);
    expect(res.permanentPriceImpactHalfSpreadBps).toBeCloseTo(0.45, 4);
  });

  it('UI/UX Pro Max v5: audits all 17 HTML files (16 Stitch screens + index.html) and validates Queue Cockpit #16', () => {
    const auditor = new OpenCoreSaas2026Monetization.UiUxProMaxAuditor();
    const summary = auditor.auditPublicDirectory();
    expect(summary.passedAllScreens).toBe(true);
    expect(summary.auditedScreensCount).toBeGreaterThanOrEqual(17);
    expect(summary.averageScorePct).toBe(100);

    const cockpit = new OpenCoreSaas2026Monetization.StitchUiCockpitEngine();
    const parsed = queueReactiveQuerySchema.parse({ bestBidQueueSizeLots: '18.4', bestAskQueueSizeLots: '9.6' });
    const snap = cockpit.getQueueReactiveSnapshot(parsed.bestBidQueueSizeLots, parsed.bestAskQueueSizeLots);
    expect(snap.file).toBe('site/public/limit-order-queue-cockpit.html');
    expect(snap.queueImbalanceRatio).toBeGreaterThan(0);
    expect(snap.venues.length).toBe(4);
  });
});
