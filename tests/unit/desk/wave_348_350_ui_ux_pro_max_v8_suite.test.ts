// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { buildBlackLittermanRiskParitySnapshot } from '../../../src/desk/opencoresaas2026monetization/stitch-black-litterman-risk-parity-telemetry';
import { StitchUiCockpitEngine, UiUxProMaxAuditor } from '../../../src/desk/opencoresaas2026monetization/stitch-ui-cockpit';
import { blackLittermanRiskParityQuerySchema } from '../../../src/platform/api/routes/stitch-cockpit-schemas';

describe('Waves 348-350 & UI/UX Pro Max v8 — Screen #19', () => {
  it('blends Black-Litterman views into posterior returns and active tilts', () => {
    const snap = buildBlackLittermanRiskParitySnapshot();
    expect(snap.file).toBe('site/public/black-litterman-risk-parity-cockpit.html');
    expect(snap.assets).toHaveLength(4);
    expect(snap.views).toHaveLength(2);
    const blWeightSum = snap.assets.reduce((a, x) => a + x.blWeightPct, 0);
    expect(blWeightSum).toBeCloseTo(100, 1);
    const tiltSum = snap.assets.reduce((a, x) => a + x.activeTiltPct, 0);
    expect(tiltSum).toBeCloseTo(0, 1);
    const sol = snap.assets.find((a) => a.symbol === 'SOL')!;
    expect(sol.posteriorReturnPct).toBeLessThan(sol.priorReturnPct);
  });

  it('computes equal-risk-contribution weights with 25% total risk each', () => {
    const snap = buildBlackLittermanRiskParitySnapshot();
    const rpWeightSum = snap.assets.reduce((a, x) => a + x.riskParityWeightPct, 0);
    expect(rpWeightSum).toBeCloseTo(100, 0);
    for (const asset of snap.assets) expect(asset.totalRiskContributionPct).toBeCloseTo(25, 1);
    expect(snap.summary.maxRiskContributionDisparityPct).toBeLessThan(0.01);
    expect(snap.summary.converged).toBe(true);
    expect(snap.summary.portfolioVolatilityPct).toBeGreaterThan(0);
    expect(snap.summary.iterations).toBeGreaterThan(0);
  });

  it('parses query defaults and routes through the cockpit engine', () => {
    const parsed = blackLittermanRiskParityQuerySchema.parse({});
    expect(parsed.riskAversionLambda).toBe(1.2);
    expect(parsed.tau).toBe(0.05);
    const engineSnap = new StitchUiCockpitEngine().getBlackLittermanRiskParitySnapshot(
      parsed.riskAversionLambda,
      parsed.tau,
    );
    expect(engineSnap.file).toBe('site/public/black-litterman-risk-parity-cockpit.html');
    expect(engineSnap.assets[0]!.symbol).toBe('BTC');
  });

  it('passes the UI/UX Pro Max audit including Screen #19', () => {
    const auditor = new UiUxProMaxAuditor();
    const summary = auditor.auditPublicDirectory();
    expect(summary.auditedScreensCount).toBeGreaterThanOrEqual(20);
    expect(summary.passedAllScreens).toBe(true);
    expect(summary.averageScorePct).toBe(100);
  });
});
