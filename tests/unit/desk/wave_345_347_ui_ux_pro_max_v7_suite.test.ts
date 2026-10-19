// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { buildStatArbGlostenMilgromSnapshot } from '../../../src/desk/opencoresaas2026monetization/stitch-statarb-glosten-milgrom-telemetry';
import { StitchUiCockpitEngine, UiUxProMaxAuditor } from '../../../src/desk/opencoresaas2026monetization/stitch-ui-cockpit';
import { statarbGlostenMilgromQuerySchema } from '../../../src/platform/api/routes/stitch-cockpit-schemas';

describe('Waves 345-347 & UI/UX Pro Max v7 — Screen #18', () => {
  it('detects the cointegrated ETH/BTC pair and preserves the OU parameters', () => {
    const snap = buildStatArbGlostenMilgromSnapshot();
    expect(snap.file).toBe('site/public/statarb-glosten-milgrom-cockpit.html');
    expect(snap.pairs).toHaveLength(3);
    const eth = snap.pairs[0]!;
    expect(eth.pair).toBe('ETH/BTC');
    expect(eth.cointegrated).toBe(true);
    expect(eth.adfStatistic).toBeLessThan(-2.85);
    expect(eth.hedgeRatio).toBeCloseTo(1.4991, 3);
    expect(eth.halfLifeDays).toBeGreaterThan(0);
    expect(snap.summary.cointegratedPairs).toBe(1);
    expect(snap.summary.bestPair).toBe('ETH/BTC');
    expect(snap.ou.theta).toBeGreaterThan(0);
    expect(snap.ou.halfLifeDays).toBeGreaterThan(0);
    expect(['LONG_SPREAD', 'SHORT_SPREAD', 'NEUTRAL']).toContain(snap.ou.signal);
  });

  it('computes Glosten-Milgrom sequential quotes and Bayesian posteriors', () => {
    const snap = buildStatArbGlostenMilgromSnapshot(0.3, 0.6);
    const gm = snap.glostenMilgrom;
    expect(gm.askPrice).toBeGreaterThan(gm.fairValue);
    expect(gm.bidPrice).toBeLessThan(gm.fairValue);
    expect(gm.adverseSelectionSpread).toBeGreaterThan(0);
    expect(gm.posteriorBuy).toBeGreaterThan(0.6);
    expect(gm.posteriorSell).toBeLessThan(0.6);
    expect(gm.informationAsymmetryRatio).toBeGreaterThan(0);
  });

  it('parses query defaults and routes through the cockpit engine', () => {
    const parsed = statarbGlostenMilgromQuerySchema.parse({});
    expect(parsed.informedTraderShareAlpha).toBe(0.3);
    expect(parsed.priorProbHighMu).toBe(0.6);
    const engineSnap = new StitchUiCockpitEngine().getStatArbGlostenMilgromSnapshot(
      parsed.informedTraderShareAlpha,
      parsed.priorProbHighMu,
    );
    expect(engineSnap.file).toBe('site/public/statarb-glosten-milgrom-cockpit.html');
    expect(engineSnap.pairs[0]!.cointegrated).toBe(true);
  });

  it('passes the UI/UX Pro Max audit including Screen #18', () => {
    const auditor = new UiUxProMaxAuditor();
    const summary = auditor.auditPublicDirectory();
    expect(summary.auditedScreensCount).toBeGreaterThanOrEqual(19);
    expect(summary.passedAllScreens).toBe(true);
    expect(summary.averageScorePct).toBe(100);
  });
});
