// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { buildAvellanedaLipkinCockpitSnapshot } from '../../../src/desk/opencoresaas2026monetization/stitch-avellaneda-lipkin-telemetry';
import { StitchUiCockpitEngine, UiUxProMaxAuditor } from '../../../src/desk/opencoresaas2026monetization/stitch-ui-cockpit';
import { avellanedaLipkinQuerySchema } from '../../../src/platform/api/routes/stitch-cockpit-schemas';

describe('Waves 342-344 & UI/UX Pro Max v6 — Screen #17', () => {
  it('builds an Avellaneda-Lipkin quote ladder with inventory skew', () => {
    const snap = buildAvellanedaLipkinCockpitSnapshot(4.5, 0.5, 0.05, 100);
    expect(snap.file).toBe('site/public/avellaneda-lipkin-kyle-back-cockpit.html');
    expect(snap.reservationPrice).toBeLessThan(snap.midPrice);
    expect(snap.bidPrice).toBeLessThan(snap.reservationPrice);
    expect(snap.askPrice).toBeGreaterThan(snap.reservationPrice);
    expect(snap.optimalHalfSpreadBps).toBeGreaterThan(0);
    expect(snap.optimalHalfSpreadBps).toBeLessThan(100);
    expect(snap.inventorySkewBps).toBeLessThan(0);
    expect(snap.quoteLadder).toHaveLength(3);
  });

  it('exposes Kyle-Back insider and VPIN toxicity metrics', () => {
    const snap = buildAvellanedaLipkinCockpitSnapshot();
    expect(snap.kyleBack.kyleLambda).toBeGreaterThan(0);
    expect(snap.kyleBack.insiderInformationSharePct).toBeGreaterThanOrEqual(0);
    expect(snap.kyleBack.insiderInformationSharePct).toBeLessThanOrEqual(100);
    expect(snap.vpin.buckets).toHaveLength(5);
    expect(snap.vpin.vpinToxicityPct).toBeGreaterThanOrEqual(0);
    expect(snap.vpin.vpinToxicityPct).toBeLessThanOrEqual(100);
    expect(['CALM', 'MODERATE', 'TOXIC']).toContain(snap.vpin.state);
  });

  it('parses query defaults and routes through the cockpit engine', () => {
    const parsed = avellanedaLipkinQuerySchema.parse({ inventoryUnits: '4.5' });
    expect(parsed.riskAversionGamma).toBe(0.5);
    expect(parsed.volatilitySigma).toBe(0.05);
    expect(parsed.midPrice).toBe(100);
    const engineSnap = new StitchUiCockpitEngine().getAvellanedaLipkinSnapshot(
      parsed.inventoryUnits,
      parsed.riskAversionGamma,
      parsed.volatilitySigma,
      parsed.midPrice,
    );
    expect(engineSnap.file).toBe('site/public/avellaneda-lipkin-kyle-back-cockpit.html');
    expect(engineSnap.quoteLadder[0].bidPrice).toBeLessThan(engineSnap.quoteLadder[0].askPrice);
  });

  it('passes the UI/UX Pro Max audit including Screen #17', () => {
    const auditor = new UiUxProMaxAuditor();
    const summary = auditor.auditPublicDirectory();
    expect(summary.auditedScreensCount).toBeGreaterThanOrEqual(18);
    expect(summary.passedAllScreens).toBe(true);
    expect(summary.averageScorePct).toBe(100);
  });
});
