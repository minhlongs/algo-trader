import { describe, expect, it } from 'vitest';
import {
  AndersenBollerslev1998IntradayVol,
  EasleyLopezDePrado2012VpinToxicity,
  Gatheral2006SviSurface,
  OpenCoreSaas2026Monetization,
} from '../../../src/desk/index';

describe('Waves 330-332 Quantitative Triad & UI/UX Pro Max 13-Screen Compliance Suite', () => {
  it('UiUxProMaxAuditor: verifies 100% score across all 8 priority categories for all Stitch HTML screens', () => {
    const auditor = new OpenCoreSaas2026Monetization.UiUxProMaxAuditor();
    const summary = auditor.auditPublicDirectory();

    expect(summary.version).toBe('2026.2-PRO-MAX');
    expect(summary.sharedCssPresent).toBe(true);
    expect(summary.sharedRuntimePresent).toBe(true);
    expect(summary.auditedScreensCount).toBeGreaterThanOrEqual(13);
    expect(summary.passedAllScreens).toBe(true);
    expect(summary.averageScorePct).toBe(100);
  });

  it('Wave 330: Gatheral (2006) SVI volatility surface verifies Durrleman g(k) >= 0 and Roger Lee wing bounds', () => {
    const engine = new Gatheral2006SviSurface.Gatheral2006SviSurface();
    const res = engine.evaluate({
      logMoneyness: 0.05,
      a: 0.04,
      b: 0.15,
      rho: -0.35,
      m: 0.0,
      sigma: 0.25,
      timeToExpiryYears: 0.5,
    });

    expect(res.totalImpliedVariance).toBeGreaterThan(0.04);
    expect(res.impliedVolatility).toBeGreaterThan(0.2);
    expect(res.rogerLeeWingBoundSatisfied).toBe(true);
    expect(res.durrlemanGValue).toBeGreaterThan(0);
    expect(res.butterflyArbitrageFree).toBe(true);
  });

  it('Wave 331: Andersen & Bollerslev (1998) models intraday diurnal U-shape seasonality', () => {
    const engine = new AndersenBollerslev1998IntradayVol.AndersenBollerslev1998IntradayVol();
    const openBurst = engine.evaluate({
      intradaySessionFraction: 0.02,
      rawFiveMinReturnSq: 0.000025,
      dailyGarchVarianceForecast: 0.0009,
      diurnalUShapeAmplitude: 0.45,
      harmonicDecayAlpha: 1.2,
    });
    const middayQuiet = engine.evaluate({
      intradaySessionFraction: 0.5,
      rawFiveMinReturnSq: 0.000009,
      dailyGarchVarianceForecast: 0.0009,
      diurnalUShapeAmplitude: 0.45,
      harmonicDecayAlpha: 1.2,
    });

    expect(openBurst.diurnalSeasonalityFactor).toBeGreaterThan(middayQuiet.diurnalSeasonalityFactor);
    expect(openBurst.regimeState).toBe('OPEN_CLOSE_BURST');
    expect(middayQuiet.regimeState).toBe('QUIET_MIDDAY');
  });

  it('Wave 332: Easley, Lopez de Prado & O Hara (2012) VPIN detects toxic flow and triggers liquidity withdrawal', () => {
    const engine = new EasleyLopezDePrado2012VpinToxicity.EasleyLopezDePrado2012VpinToxicity();
    const toxicRes = engine.evaluate({
      bucketVolumeSize: 100,
      buckets: [
        { buyVolume: 92, sellVolume: 8 },
        { buyVolume: 95, sellVolume: 5 },
        { buyVolume: 90, sellVolume: 10 },
        { buyVolume: 94, sellVolume: 6 },
      ],
      historicalVpinMean: 0.32,
      historicalVpinStd: 0.08,
    });

    expect(toxicRes.vpinMetric).toBeGreaterThan(0.8);
    expect(toxicRes.vpinCdfScore).toBeGreaterThan(0.95);
    expect(toxicRes.liquidityWithdrawalAction).toBe('HALT_LIQUIDITY_PROVISION');
  });
});
