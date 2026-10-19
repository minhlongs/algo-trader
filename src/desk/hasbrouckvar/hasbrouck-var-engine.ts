/**
 * Hasbrouck (1991) Bivariate Vector Autoregressive (VAR) Trade Impact Engine.
 * Decomposes quote changes into permanent trade-correlated information and transitory noise.
 * Strictly < 150 LOC, zero :any.
 */

import {
  TradeObservation,
  HasbrouckConfig,
  HasbrouckVarResult,
  VarLagCoefficients,
} from './hasbrouck-var-types';
import { HasbrouckVarMath } from './hasbrouck-var-math';

export class HasbrouckVarEngine {
  private readonly config: HasbrouckConfig;

  constructor(config?: Partial<HasbrouckConfig>) {
    this.config = {
      maxLags: config?.maxLags ?? 3,
      impulseHorizon: config?.impulseHorizon ?? 10,
    };
  }

  /**
   * Estimates bivariate VAR and inverts into VMA impulse responses.
   */
  public estimate(data: readonly TradeObservation[]): HasbrouckVarResult {
    const p = Math.max(1, this.config.maxLags);
    const horizon = this.config.impulseHorizon;
    const n = data.length;

    if (n <= p + 5) {
      throw new Error(`Insufficient trade observations (${n}) for lag order ${p}`);
    }

    // Prepare regressor matrices
    // Equation 1: x_t = sum(b_r * r_{t-i}) + sum(b_x * x_{t-i}) + eps_{x,t}
    // Equation 2: r_t = c0 * x_t + sum(a_r * r_{t-i}) + sum(a_x * x_{t-i}) + eps_{r,t}
    const X_trade: number[][] = [];
    const y_trade: number[] = [];
    const X_quote: number[][] = [];
    const y_quote: number[] = [];

    for (let t = p; t < n; t++) {
      const rowXTrade: number[] = [];
      for (let lag = 1; lag <= p; lag++) {
        rowXTrade.push(data[t - lag].returnMidquote);
        rowXTrade.push(data[t - lag].tradeSign);
      }
      X_trade.push(rowXTrade);
      y_trade.push(data[t].tradeSign);

      const rowXQuote: number[] = [data[t].tradeSign]; // Contemporaneous x_t
      for (let lag = 1; lag <= p; lag++) {
        rowXQuote.push(data[t - lag].returnMidquote);
        rowXQuote.push(data[t - lag].tradeSign);
      }
      X_quote.push(rowXQuote);
      y_quote.push(data[t].returnMidquote);
    }

    // Estimate coefficients via OLS
    const betaTrade = HasbrouckVarMath.estimateOls(X_trade, y_trade);
    const betaQuote = HasbrouckVarMath.estimateOls(X_quote, y_quote);

    const b_r: number[] = [];
    const b_x: number[] = [];
    for (let i = 0; i < p; i++) {
      b_r.push(betaTrade[2 * i] ?? 0);
      b_x.push(betaTrade[2 * i + 1] ?? 0);
    }

    const c0 = betaQuote[0] ?? 0;
    const a_r: number[] = [];
    const a_x: number[] = [];
    for (let i = 0; i < p; i++) {
      a_r.push(betaQuote[1 + 2 * i] ?? 0);
      a_x.push(betaQuote[1 + 2 * i + 1] ?? 0);
    }

    const coefficients: VarLagCoefficients = { a_r, a_x, b_r, b_x, c_r: c0 };

    // Impulse response function
    const { irfQuote, irfTrade } = HasbrouckVarMath.computeImpulseResponse(
      a_r,
      a_x,
      c0,
      b_r,
      b_x,
      p,
      horizon
    );

    // Permanent price impact: accumulated quote response to unit trade shock
    const permanentImpact = irfQuote.reduce((acc, v) => acc + v, 0);

    // Variance decomposition
    const totalReturnVar = HasbrouckVarMath.variance(data.map(d => d.returnMidquote));
    const randomWalkVar = permanentImpact * permanentImpact * HasbrouckVarMath.variance(data.map(d => d.tradeSign));
    const infoShare = totalReturnVar > 0 ? Math.min(100.0, Math.max(0.0, (randomWalkVar / totalReturnVar) * 100.0)) : 0;

    return {
      lags: p,
      sampleCount: n,
      coefficients,
      impulseResponseQuote: irfQuote,
      impulseResponseTrades: irfTrade,
      permanentPriceImpact: permanentImpact,
      randomWalkVariance: randomWalkVar,
      totalReturnVariance: totalReturnVar,
      informationSharePct: infoShare,
    };
  }
}
