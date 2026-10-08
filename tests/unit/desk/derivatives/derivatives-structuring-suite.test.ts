import { describe, it, expect } from 'vitest';
import { VarianceSwapPricer } from '../../../../src/desk/derivatives/variance-swap-pricer';
import { VolIndexReplicator } from '../../../../src/desk/derivatives/vol-index-replicator';
import { GreekNeutralOptimizer } from '../../../../src/desk/derivatives/greek-neutral-optimizer';

describe('Volatility Surface & Derivatives Structuring Suite', () => {
  describe('VarianceSwapPricer', () => {
    it('computes annualized realized variance and marks variance swap payoff', () => {
      const pricer = new VarianceSwapPricer();

      // Sample simulated price series with known volatility
      const prices = [100, 102, 101, 103, 102, 105, 104, 106, 105, 108, 107];
      const realizedVar = pricer.computeRealizedVariance(prices);
      expect(realizedVar).toBeGreaterThan(0);

      // Price a 20% volatility variance swap with $50,000 vega notional
      const quote = pricer.priceVarianceSwap(20.0, 50_000, prices);
      expect(quote.strikeVariance).toBeCloseTo(0.04, 4); // 0.20^2 = 0.04
      expect(quote.vegaNotional).toBe(50_000);
      expect(quote.varianceNotional).toBeCloseTo(50_000 / (2 * 0.20), 1); // 125,000
      expect(quote.realizedVariance).toBeGreaterThan(0);
      expect(typeof quote.payoffUsd).toBe('number');
    });

    it('rejects price series with fewer than 2 points or non-positive strikes', () => {
      const pricer = new VarianceSwapPricer();
      expect(() => pricer.computeRealizedVariance([100])).toThrow('At least 2 price observations');
      expect(() => pricer.priceVarianceSwap(-5, 10_000, [100, 102])).toThrow('strictly positive');
    });
  });

  describe('VolIndexReplicator', () => {
    it('replicates model-free VIX-style implied volatility index from an option chain strip', () => {
      const replicator = new VolIndexReplicator();

      const forwardPrice = 5000.0;
      const quotes = [
        { strike: 4800, callBid: 240, callAsk: 242, putBid: 40, putAsk: 42 },
        { strike: 4900, callBid: 160, callAsk: 162, putBid: 60, putAsk: 62 },
        { strike: 5000, callBid: 95, callAsk: 97, putBid: 95, putAsk: 97 }, // ATM
        { strike: 5100, callBid: 50, callAsk: 52, putBid: 150, putAsk: 152 },
        { strike: 5200, callBid: 22, callAsk: 24, putBid: 220, putAsk: 222 },
      ];

      const result = replicator.computeVixIndex({
        timeToExpiryYears: 30 / 365, // 30-day maturity
        riskFreeRate: 0.045, // 4.5% SOFR
        forwardPrice,
        quotes,
      });

      expect(result.forwardPrice).toBe(5000.0);
      expect(result.atmStrike).toBe(5000);
      expect(result.varianceRate).toBeGreaterThan(0);
      expect(result.vixIndexValue).toBeGreaterThan(10); // Typical VIX in 10-30 range
      expect(result.vixIndexValue).toBeLessThan(60);
    });

    it('rejects invalid parameters or single-strike strips', () => {
      const replicator = new VolIndexReplicator();
      expect(() =>
        replicator.computeVixIndex({
          timeToExpiryYears: 0,
          riskFreeRate: 0.05,
          forwardPrice: 100,
          quotes: [{ strike: 100, callBid: 5, callAsk: 6, putBid: 5, putAsk: 6 }],
        })
      ).toThrow('Invalid VIX strip parameters');
    });
  });

  describe('GreekNeutralOptimizer', () => {
    it('optimizes 3 hedging instruments to achieve exact Delta, Gamma, and Vega neutralization', () => {
      const optimizer = new GreekNeutralOptimizer();

      // Current portfolio Greek exposures
      const portfolio = {
        delta: 150.0,
        gamma: 25.0,
        vega: 500.0,
      };

      // 3 hedging instruments (e.g., Underlying stock, Short-term OTM option, Long-term ATM option)
      const instruments = [
        { symbol: 'STOCK', underlyingPrice: 100, deltaPerUnit: 1.0, gammaPerUnit: 0.0, vegaPerUnit: 0.0 },
        { symbol: 'OPT_SHORT', underlyingPrice: 100, deltaPerUnit: 0.45, gammaPerUnit: 0.08, vegaPerUnit: 0.15 },
        { symbol: 'OPT_LONG', underlyingPrice: 100, deltaPerUnit: 0.50, gammaPerUnit: 0.02, vegaPerUnit: 0.40 },
      ];

      const solution = optimizer.solveNeutralHedge(portfolio, instruments);

      expect(solution.isNeutralized).toBe(true);
      expect(Math.abs(solution.residualDelta)).toBeLessThan(0.05);
      expect(Math.abs(solution.residualGamma)).toBeLessThan(0.05);
      expect(Math.abs(solution.residualVega)).toBeLessThan(0.05);
      expect(typeof solution.hedgeUnits['STOCK']).toBe('number');
      expect(typeof solution.hedgeUnits['OPT_SHORT']).toBe('number');
      expect(typeof solution.hedgeUnits['OPT_LONG']).toBe('number');
    });

    it('throws error when instruments are linearly dependent or fewer than 3', () => {
      const optimizer = new GreekNeutralOptimizer();
      const portfolio = { delta: 10, gamma: 5, vega: 20 };

      // Fewer than 3 instruments
      expect(() =>
        optimizer.solveNeutralHedge(portfolio, [
          { symbol: 'S1', underlyingPrice: 10, deltaPerUnit: 1, gammaPerUnit: 0, vegaPerUnit: 0 },
        ])
      ).toThrow('At least 3 linearly independent');

      // Singular matrix (identical Greek sensitivities)
      const singularInstruments = [
        { symbol: 'S1', underlyingPrice: 10, deltaPerUnit: 1, gammaPerUnit: 0, vegaPerUnit: 0 },
        { symbol: 'S2', underlyingPrice: 10, deltaPerUnit: 2, gammaPerUnit: 0, vegaPerUnit: 0 },
        { symbol: 'S3', underlyingPrice: 10, deltaPerUnit: 3, gammaPerUnit: 0, vegaPerUnit: 0 },
      ];
      expect(() => optimizer.solveNeutralHedge(portfolio, singularInstruments)).toThrow('Singular matrix');
    });
  });
});
