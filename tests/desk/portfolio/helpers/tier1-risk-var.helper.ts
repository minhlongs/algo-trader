import { describe, it, expect } from 'vitest';
import {
  computeVarCvar,
  computeTailDivergence,
  LeverageExposureGuard,
} from '../fixtures/risk-contract.fixture';

export function registerTier1RiskVarTests(): void {
  describe('Feature 6: Parametric & Historical VaR/CVaR (F6)', () => {
    const returns = [-0.02, -0.015, -0.01, 0.005, 0.01, 0.015, 0.02, -0.03, 0.012, 0.008];
    const nav = 100000;

    it('F6.1: computes parametric VaR at 95% and 99% confidence horizons', () => {
      const v95 = computeVarCvar(returns, nav, 0.95, 1);
      const v99 = computeVarCvar(returns, nav, 0.99, 1);
      expect(v95.parametricVaR).toBeGreaterThan(0);
      expect(v99.parametricVaR).toBeGreaterThan(v95.parametricVaR);
    });

    it('F6.2: computes historical VaR and CVaR (Expected Shortfall)', () => {
      const res = computeVarCvar(returns, nav, 0.95, 1);
      expect(res.historicalVaR).toBeGreaterThan(0);
      expect(res.historicalCVaR).toBeGreaterThanOrEqual(res.historicalVaR);
    });

    it('F6.3: scales VaR with square root of time horizon (sqrt(t))', () => {
      const v1 = computeVarCvar(returns, nav, 0.95, 1);
      const v10 = computeVarCvar(returns, nav, 0.95, 10);
      expect(v10.parametricVaR).toBeCloseTo(v1.parametricVaR * Math.sqrt(10), 0);
    });

    it('F6.4: enforces CVaR >= VaR condition across parametric and historical methods', () => {
      const res = computeVarCvar(returns, nav, 0.95, 1);
      expect(res.parametricCVaR).toBeGreaterThanOrEqual(res.parametricVaR);
      expect(res.historicalCVaR).toBeGreaterThanOrEqual(res.historicalVaR);
    });

    it('F6.5: returns sensible default risk bounds when observation count is small', () => {
      const res = computeVarCvar([0.01, -0.01], nav, 0.95, 1);
      expect(res.parametricVaR).toBeGreaterThan(0);
      expect(res.portfolioNav).toBe(nav);
    });
  });

  describe('Feature 7: Tail Risk Divergence Ratio (F7)', () => {
    it('F7.1: calculates ratio of historical CVaR to parametric CVaR', () => {
      const res = computeTailDivergence(2000, 3200);
      expect(res.ratio).toBeCloseTo(1.6, 2);
    });

    it('F7.2: flags tail divergence when ratio strictly exceeds 1.5 threshold', () => {
      const res = computeTailDivergence(2000, 3200, 1.5);
      expect(res.isTailDivergent).toBe(true);
    });

    it('F7.3: does not flag divergence under Gaussian/normal distribution (ratio <= 1.5)', () => {
      const res = computeTailDivergence(2000, 2400, 1.5);
      expect(res.isTailDivergent).toBe(false);
    });

    it('F7.4: handles near-zero parametric CVaR without division-by-zero crashes', () => {
      const res = computeTailDivergence(0, 100);
      expect(Number.isFinite(res.ratio)).toBe(true);
    });

    it('F7.5: captures jump risk in fat-tailed distribution scenarios', () => {
      const normalRes = computeTailDivergence(1500, 1600);
      const fatTailRes = computeTailDivergence(1500, 3500);
      expect(fatTailRes.ratio).toBeGreaterThan(normalRes.ratio);
      expect(fatTailRes.isTailDivergent).toBe(true);
    });
  });

  describe('Feature 8: Leverage & Exposure Guard (F8)', () => {
    it('F8.1: permits portfolio positions when gross leverage <= 3.0x', () => {
      const guard = new LeverageExposureGuard(3.0);
      const res = guard.checkExposure(100000, { binance: 90000, bybit: 60000, polymarket: 50000 });
      expect(res.isAllowed).toBe(true);
      expect(res.grossLeverage).toBe(2.0);
    });

    it('F8.2: rejects position expansion when gross leverage exceeds 3.0x', () => {
      const guard = new LeverageExposureGuard(3.0);
      const res = guard.checkExposure(100000, { binance: 250000, polymarket: 100000 });
      expect(res.isAllowed).toBe(false);
      expect(res.grossLeverage).toBe(3.5);
      expect(res.violationReason).toBeDefined();
    });

    it('F8.3: computes net directional exposure across long and short positions', () => {
      const guard = new LeverageExposureGuard();
      const res = guard.checkExposure(100000, { longLeg: 80000, shortLeg: -50000 });
      expect(res.netExposure).toBe(30000);
    });

    it('F8.4: enforces single-venue concentration limit (<= 50% of gross capital)', () => {
      const guard = new LeverageExposureGuard(3.0, 0.50);
      const res = guard.checkExposure(100000, { binance: 180000, bybit: 20000 });
      expect(res.isAllowed).toBe(false);
      expect(res.violationReason).toContain('exceeds cap');
    });

    it('F8.5: handles empty or zero-NAV portfolio without crashing', () => {
      const guard = new LeverageExposureGuard();
      const res = guard.checkExposure(0, {});
      expect(res.grossLeverage).toBe(0);
      expect(res.isAllowed).toBe(true);
    });
  });
}
