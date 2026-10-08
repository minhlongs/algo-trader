/**
 * Discrete Realized Variance & Variance Swap Pricing Engine
 * Computes realized variance from log returns and marks OTC variance swap payoffs.
 *
 * @module desk/derivatives/variance-swap-pricer
 */

import { VarianceSwapQuote } from './derivatives-types';

export class VarianceSwapPricer {
  /**
   * Calculates annualized realized variance from a series of asset closing prices.
   * Realized Variance = (252 / (N - 1)) * sum(ln(P_t / P_{t-1})^2)
   */
  public computeRealizedVariance(prices: number[], annualizationFactor = 252): number {
    if (prices.length < 2) {
      throw new Error('At least 2 price observations are required to calculate realized variance');
    }

    const logReturns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      const prev = prices[i - 1];
      const curr = prices[i];
      if (prev === undefined || curr === undefined || prev <= 0 || curr <= 0) {
        throw new Error('Price series must be strictly positive');
      }
      logReturns.push(Math.log(curr / prev));
    }

    const sumSquaredReturns = logReturns.reduce((sum, r) => sum + r * r, 0);
    const n = logReturns.length;
    // Standard market convention: scale by annualization factor / n
    return (annualizationFactor / n) * sumSquaredReturns;
  }

  /**
   * Evaluates payoff for a variance swap given vega notional and fair strike volatility.
   * Payoff = Variance Notional * (Realized Variance - Strike Variance)
   * where Variance Notional = Vega Notional / (2 * Strike Volatility)
   */
  public priceVarianceSwap(
    strikeVolPct: number,
    vegaNotionalUsd: number,
    realizedPrices: number[]
  ): VarianceSwapQuote {
    if (strikeVolPct <= 0 || vegaNotionalUsd <= 0) {
      throw new Error('strikeVolPct and vegaNotionalUsd must be strictly positive');
    }

    const strikeVolDecimal = strikeVolPct / 100;
    const strikeVariance = strikeVolDecimal * strikeVolDecimal;

    // Variance Notional conversion
    const varianceNotional = vegaNotionalUsd / (2 * strikeVolDecimal);

    const realizedVariance = this.computeRealizedVariance(realizedPrices);
    const payoffUsd = varianceNotional * (realizedVariance - strikeVariance);

    return {
      strikeVariance: Number(strikeVariance.toFixed(6)),
      strikeVolPct,
      vegaNotional: vegaNotionalUsd,
      varianceNotional: Number(varianceNotional.toFixed(2)),
      realizedVariance: Number(realizedVariance.toFixed(6)),
      payoffUsd: Number(payoffUsd.toFixed(2)),
    };
  }
}
