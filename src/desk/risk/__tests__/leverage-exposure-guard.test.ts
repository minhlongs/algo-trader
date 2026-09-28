import { describe, expect, it } from 'vitest';
import { LeverageExposureGuard } from '../leverage-exposure-guard';

describe('leverage-exposure-guard Leverage & Concentration Checks', () => {
  it('permits positions when gross leverage <= 3.0x', () => {
    const guard = new LeverageExposureGuard(3.0);
    const res = guard.checkExposure(100000, {
      binance: 90000,
      bybit: 60000,
      polymarket: 50000,
    });
    expect(res.isAllowed).toBe(true);
    expect(res.grossLeverage).toBe(2.0);
  });

  it('rejects position expansion when gross leverage exceeds 3.0x', () => {
    const guard = new LeverageExposureGuard(3.0);
    const res = guard.checkExposure(100000, {
      binance: 250000,
      polymarket: 100000,
    });
    expect(res.isAllowed).toBe(false);
    expect(res.grossLeverage).toBe(3.5);
    expect(res.violationReason).toBeDefined();
  });

  it('computes net directional exposure across long and short positions', () => {
    const guard = new LeverageExposureGuard();
    const res = guard.checkExposure(100000, {
      longLeg: 80000,
      shortLeg: -50000,
    });
    expect(res.netExposure).toBe(30000);
  });

  it('enforces single-venue concentration limit (<= 50% of gross capital)', () => {
    const guard = new LeverageExposureGuard(3.0, 0.5);
    const res = guard.checkExposure(100000, {
      binance: 180000,
      bybit: 20000,
    });
    expect(res.isAllowed).toBe(false);
    expect(res.violationReason).toContain('exceeds cap');
  });

  it('handles empty or zero-NAV portfolio without crashing', () => {
    const guard = new LeverageExposureGuard();
    const res = guard.checkExposure(0, {});
    expect(res.grossLeverage).toBe(0);
    expect(res.isAllowed).toBe(true);
  });

  it('boundary: gross leverage at exactly 3.000x is permitted, 3.001x is rejected', () => {
    const guard = new LeverageExposureGuard(3.0);
    const passRes = guard.checkExposure(100000, {
      binance: 120000,
      bybit: 100000,
      polymarket: 80000,
    });
    expect(passRes.grossLeverage).toBe(3.0);
    expect(passRes.isAllowed).toBe(true);

    const failRes = guard.checkExposure(100000, {
      binance: 120000,
      bybit: 100100,
      polymarket: 80000,
    });
    expect(failRes.grossLeverage).toBeGreaterThan(3.0);
    expect(failRes.isAllowed).toBe(false);
  });

  it('boundary: single venue concentration at exactly 50.00% is permitted', () => {
    const guard = new LeverageExposureGuard(3.0, 0.5);
    const res = guard.checkExposure(100000, {
      binance: 100000,
      bybit: 100000,
    });
    expect(res.isAllowed).toBe(true);
  });

  it('computes detailed report and venue exposures', () => {
    const guard = new LeverageExposureGuard(3.0, 0.5, {
      binance: 0.5,
      polymarket_clob: 0.4,
      polymarket_amm: 0.3,
    });
    const positions = { binance: 40000, polymarket_clob: 30000, polymarket_amm: 10000 };
    const report = guard.checkDetailedReport(100000, positions);
    expect(report.grossLeverage).toBe(0.8);
    expect(report.isAllowed).toBe(true);

    const venueReport = guard.checkVenueExposure(100000, positions);
    expect(venueReport.isCompliant).toBe(true);
    expect(venueReport.venueRatios.binance).toBe(0.5);
  });

  it('validates pre-trade orders against leverage caps', () => {
    const guard = new LeverageExposureGuard(3.0, 0.5);
    const positions = { binance: 140000, bybit: 140000 };
    const pass = guard.validatePreTradeOrder(100000, positions, 10000, 'polymarket');
    expect(pass.approved).toBe(true);

    const fail = guard.validatePreTradeOrder(100000, positions, 30000, 'polymarket');
    expect(fail.approved).toBe(false);
    expect(fail.reason).toContain('Gross leverage');
  });

  it('enforces net directional leverage limit when configured', () => {
    const guard = new LeverageExposureGuard(3.0, 0.5, undefined, 1.0);
    const pass = guard.checkExposure(100000, {
      longBtc: 50000,
      longEth: 50000,
      shortSol: -40000,
    });
    expect(pass.isAllowed).toBe(true); // Net = 60,000 / 100,000 = 0.6x <= 1.0x

    const fail = guard.checkExposure(100000, {
      longBtc: 50000,
      longEth: 50000,
      longSol: 40000,
    });
    expect(fail.isAllowed).toBe(false); // Net = 140,000 / 100,000 = 1.4x > 1.0x
    expect(fail.violationReason).toContain('Net directional leverage');
  });
});
