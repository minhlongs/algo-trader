import { describe, it, expect } from 'vitest';
import { CevEngine } from '../../../../src/desk/cev/cev-engine.js';
import { CevMath } from '../../../../src/desk/cev/cev-math.js';
import { CevOptionParams } from '../../../../src/desk/cev/cev-types.js';

describe('Cox (1975) Constant Elasticity of Variance (CEV) Engine Suite', () => {
  describe('CevMath Special Functions', () => {
    it('computes logGamma accurately', () => {
      // Gamma(1) = 1 => logGamma(1) = 0
      expect(Math.abs(CevMath.logGamma(1.0))).toBeLessThan(1e-7);
      // Gamma(2) = 1 => logGamma(2) = 0
      expect(Math.abs(CevMath.logGamma(2.0))).toBeLessThan(1e-7);
      // Gamma(5) = 24 => logGamma(5) = ln(24) = 3.17805383
      expect(CevMath.logGamma(5.0)).toBeCloseTo(Math.log(24), 5);
    });

    it('computes gammp (regularized lower incomplete gamma) correctly', () => {
      expect(CevMath.gammp(1.0, 0.0)).toBe(0);
      expect(CevMath.gammp(1.0, 1.0)).toBeCloseTo(1.0 - Math.exp(-1.0), 5);
    });

    it('computes normal CDF correctly', () => {
      expect(CevMath.normalCdf(0.0)).toBeCloseTo(0.5, 6);
      expect(CevMath.normalCdf(1.96)).toBeCloseTo(0.975002, 4);
      expect(CevMath.normalCdf(-1.96)).toBeCloseTo(0.024998, 4);
    });

    it('computes non-central chi-square CDF', () => {
      // For lambda = 0, reduces to central chi-square = gammp(nu/2, x/2)
      const cdfCentral = CevMath.nonCentralChiSquareCdf(2.0, 2.0, 0.0);
      expect(cdfCentral).toBeCloseTo(1.0 - Math.exp(-1.0), 4);
      // Non-zero non-centrality parameter
      const cdfNonCentral = CevMath.nonCentralChiSquareCdf(4.0, 2.0, 1.0);
      expect(cdfNonCentral).toBeGreaterThan(0);
      expect(cdfNonCentral).toBeLessThan(1);
    });
  });

  describe('CevEngine Boundary Conditions and Pricing', () => {
    const baseCallParams: CevOptionParams = {
      spot: 100,
      strike: 100,
      timeToExpiry: 1.0,
      riskFreeRate: 0.05,
      dividendYield: 0.0,
      volatility: 0.25,
      beta: 1.0, // Square-root diffusion
      isCall: true,
    };

    it('validates strictly positive inputs and beta in (0, 2]', () => {
      expect(() => CevEngine.validate({ ...baseCallParams, spot: -10 })).toThrow(/Spot price/);
      expect(() => CevEngine.validate({ ...baseCallParams, strike: 0 })).toThrow(/Strike price/);
      expect(() => CevEngine.validate({ ...baseCallParams, beta: 2.5 })).toThrow(/Elasticity beta/);
      expect(() => CevEngine.validate({ ...baseCallParams, beta: 0 })).toThrow(/Elasticity beta/);
    });

    it('prices ATM call with beta = 1.0', () => {
      const res = CevEngine.price(baseCallParams);
      expect(res.callPrice).toBeGreaterThan(0);
      expect(res.price).toBe(res.callPrice);
      expect(res.alpha).toBeCloseTo(1.0, 5);
    });

    it('satisfies Put-Call parity under CEV', () => {
      const callRes = CevEngine.price(baseCallParams);
      const putRes = CevEngine.price({ ...baseCallParams, isCall: false });
      const discountS = baseCallParams.spot * Math.exp(-baseCallParams.dividendYield * baseCallParams.timeToExpiry);
      const discountK = baseCallParams.strike * Math.exp(-baseCallParams.riskFreeRate * baseCallParams.timeToExpiry);

      // Parity: C - P = S*e^(-qT) - K*e^(-rT)
      const diff = callRes.callPrice - putRes.putPrice;
      const expected = discountS - discountK;
      expect(diff).toBeCloseTo(expected, 4);
    });

    it('converges to Black-Scholes formula as beta approaches 2.0', () => {
      const bsParams: CevOptionParams = { ...baseCallParams, beta: 2.0 };
      const res = CevEngine.price(bsParams);

      // Analytical Black-Scholes call price for S=100, K=100, T=1, r=0.05, q=0, vol=0.25
      // d1 = (0.05 + 0.5*0.25^2)/0.25 = 0.325, d2 = 0.325 - 0.25 = 0.075
      // S * N(0.325) - K * exp(-0.05) * N(0.075) = 100*0.62740 - 100*0.95123*0.52989 = 62.74 - 50.406 = 12.33
      expect(res.callPrice).toBeCloseTo(12.336, 1);
    });

    it('computes robust and bounded finite difference Greeks', () => {
      const res = CevEngine.price(baseCallParams);
      const { delta, gamma, vega, theta, rho, elasticityDelta } = res.greeks;

      expect(delta).toBeGreaterThan(0);
      expect(delta).toBeLessThan(1.0);
      expect(gamma).toBeGreaterThan(0);
      expect(vega).toBeGreaterThan(0);
      expect(theta).toBeLessThan(0); // Call time decay
      expect(rho).toBeGreaterThan(0); // Sensitivity to rate for call
      expect(Number.isFinite(elasticityDelta)).toBe(true);
    });
  });
});
