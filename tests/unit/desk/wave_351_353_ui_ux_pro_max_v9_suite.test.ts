// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { buildLiquidityImpactSnapshot } from '../../../src/desk/opencoresaas2026monetization/stitch-liquidity-impact-telemetry';
import { StitchUiCockpitEngine, UiUxProMaxAuditor } from '../../../src/desk/opencoresaas2026monetization/stitch-ui-cockpit';
import { liquidityImpactQuerySchema } from '../../../src/platform/api/routes/stitch-cockpit-schemas';

describe('Waves 351-353 & UI/UX Pro Max v9 — Screen #20', () => {
  it('computes Amihud, Roll and Kyle liquidity metrics', () => {
    const snap = buildLiquidityImpactSnapshot();
    expect(snap.file).toBe('site/public/liquidity-impact-cockpit.html');
    expect(snap.liquidity.rollSpreadPct).toBeGreaterThan(0);
    expect(snap.liquidity.amihudScaledRatio).toBeGreaterThan(0);
    expect(snap.liquidity.kyleLambdaProxy).toBeGreaterThan(0);
    expect(snap.liquidity.kyleRSquared).toBeGreaterThanOrEqual(0);
    expect(snap.liquidity.kyleRSquared).toBeLessThanOrEqual(1);
    expect(snap.liquidity.compositeLiquidityScore).toBeGreaterThan(0);
    expect(snap.liquidity.compositeLiquidityScore).toBeLessThanOrEqual(100);
    expect(['HIGH_LIQUIDITY', 'NORMAL', 'ELEVATED_IMPACT', 'ILLIQUID_DISTRESSED']).toContain(snap.liquidity.liquidityRegime);
  });

  it('builds a monotone Almgren-Chriss liquidation trajectory', () => {
    const snap = buildLiquidityImpactSnapshot();
    expect(snap.execution.expectedCostUsd).toBeGreaterThan(0);
    expect(snap.execution.expectedCostBps).toBeGreaterThan(0);
    expect(snap.execution.halfLifeDays).toBeGreaterThan(0);
    expect(snap.execution.trajectory.length).toBeGreaterThan(1);
    const last = snap.execution.trajectory[snap.execution.trajectory.length - 1]!;
    expect(last.holdingsRemaining).toBeCloseTo(0, 2);
  });

  it('decays the Bouchaud propagator kernel and resolves residual impact', () => {
    const snap = buildLiquidityImpactSnapshot();
    expect(snap.propagator.kernelAt0).toBeGreaterThan(snap.propagator.kernelAt60s);
    expect(snap.propagator.kernelAt60s).toBeGreaterThan(snap.propagator.kernelAt3600s);
    expect(snap.propagator.kernelAt3600s).toBeGreaterThan(0);
    expect(snap.propagator.permanentResidualFraction).toBeGreaterThan(0);
    expect(snap.propagator.permanentResidualFraction).toBeLessThanOrEqual(1);
    expect(snap.propagator.trajectory).toHaveLength(4);
  });

  it('parses query defaults and routes through the cockpit engine', () => {
    const parsed = liquidityImpactQuerySchema.parse({});
    expect(parsed.totalShares).toBe(100000);
    expect(parsed.riskAversion).toBe(0.001);
    const engineSnap = new StitchUiCockpitEngine().getLiquidityImpactSnapshot(parsed.totalShares, parsed.riskAversion);
    expect(engineSnap.file).toBe('site/public/liquidity-impact-cockpit.html');
    expect(engineSnap.execution.totalShares).toBe(100000);
  });

  it('passes the UI/UX Pro Max audit including Screen #20', () => {
    const auditor = new UiUxProMaxAuditor();
    const summary = auditor.auditPublicDirectory();
    expect(summary.auditedScreensCount).toBeGreaterThanOrEqual(21);
    expect(summary.passedAllScreens).toBe(true);
    expect(summary.averageScorePct).toBe(100);
  });
});
