import { describe, it, expect } from 'vitest';
import {
  computeVarCvar,
  computeTailDivergence,
  LeverageExposureGuard,
} from '../fixtures/risk-contract.fixture';

export function registerTier2RiskVarTests(): void {
  describe('Tier 2: Boundary - Feature 6: Parametric & Historical VaR/CVaR (F6)', () => {
    it('B6.1: handles zero variance (flat returns) gracefully without NaN', () => {
      const returns = [0, 0, 0, 0, 0, 0];
      const res = computeVarCvar(returns, 100000, 0.95, 1);
      expect(Number.isFinite(res.parametricVaR)).toBe(true);
      expect(Number.isFinite(res.historicalVaR)).toBe(true);
    });

    it('B6.2: handles single extreme tail return (-90%) appropriately scaling CVaR', () => {
      const returns = [0.01, 0.01, 0.01, 0.01, 0.01, -0.90];
      const res = computeVarCvar(returns, 100000, 0.95, 1);
      expect(res.historicalCVaR).toBeGreaterThan(50000);
    });

    it('B6.3: computes 99% confidence VaR strictly greater than 95% confidence VaR', () => {
      const returns = [-0.01, -0.02, 0.01, 0.02, -0.015, 0.005, -0.03];
      const v95 = computeVarCvar(returns, 100000, 0.95, 1);
      const v99 = computeVarCvar(returns, 100000, 0.99, 1);
      expect(v99.parametricVaR).toBeGreaterThan(v95.parametricVaR);
    });

    it('B6.4: scales VaR over long 30-day horizon accurately with sqrt(30)', () => {
      const returns = [-0.01, 0.01, -0.02, 0.02, 0.005];
      const v1 = computeVarCvar(returns, 100000, 0.95, 1);
      const v30 = computeVarCvar(returns, 100000, 0.95, 30);
      expect(v30.parametricVaR).toBeCloseTo(v1.parametricVaR * Math.sqrt(30), 0);
    });

    it('B6.5: historical CVaR strictly bounds historical VaR (CVaR >= VaR)', () => {
      const returns = [-0.05, -0.02, -0.01, 0.01, 0.02, 0.03, -0.04];
      const res = computeVarCvar(returns, 100000, 0.95, 1);
      expect(res.historicalCVaR).toBeGreaterThanOrEqual(res.historicalVaR);
    });
  });

  describe('Tier 2: Boundary - Feature 7: Tail Risk Divergence Ratio (F7)', () => {
    it('B7.1: ratio at exactly 1.500000 evaluates isTailDivergent=false', () => {
      const res = computeTailDivergence(1000, 1500, 1.5);
      expect(res.isTailDivergent).toBe(false);
    });

    it('B7.2: ratio at 1.50001 evaluates isTailDivergent=true', () => {
      const res = computeTailDivergence(1000, 1500.1, 1.5);
      expect(res.isTailDivergent).toBe(true);
    });

    it('B7.3: sub-Gaussian distribution (ratio < 1.0) yields isTailDivergent=false', () => {
      const res = computeTailDivergence(2000, 1800, 1.5);
      expect(res.ratio).toBeLessThan(1.0);
      expect(res.isTailDivergent).toBe(false);
    });

    it('B7.4: zero parametric CVaR handles denominator clamp safely', () => {
      const res = computeTailDivergence(0, 500, 1.5);
      expect(Number.isFinite(res.ratio)).toBe(true);
      expect(res.isTailDivergent).toBe(true);
    });

    it('B7.5: extreme fat tail ratio (> 10.0x) is detected cleanly', () => {
      const res = computeTailDivergence(500, 6000, 1.5);
      expect(res.ratio).toBeGreaterThan(10);
      expect(res.isTailDivergent).toBe(true);
    });
  });

  describe('Tier 2: Boundary - Feature 8: Leverage & Exposure Guard (F8)', () => {
    it('B8.1: gross leverage at exactly 3.000x is permitted', () => {
      const guard = new LeverageExposureGuard(3.0);
      const res = guard.checkExposure(100000, { binance: 120000, bybit: 100000, polymarket: 80000 });
      expect(res.grossLeverage).toBe(3.0);
      expect(res.isAllowed).toBe(true);
    });

    it('B8.2: gross leverage at 3.001x is rejected', () => {
      const guard = new LeverageExposureGuard(3.0);
      const res = guard.checkExposure(100000, { binance: 120000, bybit: 100100, polymarket: 80000 });
      expect(res.grossLeverage).toBeGreaterThan(3.0);
      expect(res.isAllowed).toBe(false);
    });

    it('B8.3: single venue concentration at exactly 50.00% is permitted', () => {
      const guard = new LeverageExposureGuard(3.0, 0.50);
      const res = guard.checkExposure(100000, { binance: 100000, bybit: 100000 });
      expect(res.isAllowed).toBe(true);
    });

    it('B8.4: perfectly hedged portfolio (net exposure = $0) correctly computes gross leverage', () => {
      const guard = new LeverageExposureGuard(3.0);
      const res = guard.checkExposure(100000, { longBtc: 100000, shortBtc: -100000 });
      expect(res.netExposure).toBe(0);
      expect(res.grossLeverage).toBe(2.0);
      expect(res.isAllowed).toBe(true);
    });

    it('B8.5: zero position portfolio yields 0 gross leverage and passes', () => {
      const guard = new LeverageExposureGuard(3.0);
      const res = guard.checkExposure(100000, { btc: 0, eth: 0 });
      expect(res.grossLeverage).toBe(0);
      expect(res.isAllowed).toBe(true);
    });
  });
}
