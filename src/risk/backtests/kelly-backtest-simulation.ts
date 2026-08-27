/**
 * Core simulation primitives for the Kelly vs Fixed backtest.
 *
 * Seeded RNG (Linear Congruential Generator) + trade simulation producing
 * wealth/CAGR/drawdown/Sharpe metrics. Extracted from kelly-vs-fixed.backtest.ts
 * with zero behavior change.
 */

// ============================================================================
// Seeded Random Number Generator (Linear Congruential Generator)
// ============================================================================

/**
 * LCG for reproducible random numbers.
 * Using constants from Numerical Recipes.
 */
export class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed % 4294967296;
    if (this.seed < 0) this.seed += 4294967296;
  }

  /** Returns uniform random number in [0, 1) */
  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }

  /** Returns random integer in [0, max) */
  nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }
}

// ============================================================================
// Simulation Types
// ============================================================================

export interface Metrics {
  finalWealth: number;
  cagr: number;
  maxDrawdown: number;
  sharpe: number;
}

export type PositionSizerFn = (portfolio: number, tradeIndex: number) => number;

export interface ScenarioResult {
  name: string;
  metrics: Metrics;
}

// ============================================================================
// Core Simulation Logic
// ============================================================================

/**
 * Simulate a series of trades with a given position sizing strategy.
 */
export function simulateTrades(
  initialBankroll: number,
  numTrades: number,
  winProbability: number,
  winLossRatio: number,
  positionSizer: PositionSizerFn,
  rng: SeededRandom
): Metrics {
  let portfolio = initialBankroll;
  let peak = portfolio;
  const drawdowns: number[] = [];
  const dailyReturns: number[] = [];

  for (let i = 0; i < numTrades; i++) {
    // Calculate position size for this trade
    const positionSize = positionSizer(portfolio, i);

    // Determine outcome (win/loss)
    const isWin = rng.next() < winProbability;
    const pnl = isWin ? positionSize * winLossRatio : -positionSize;

    // Update portfolio
    const previousPortfolio = portfolio;
    portfolio += pnl;

    // Track drawdown
    peak = Math.max(peak, portfolio);
    const drawdown = (peak - portfolio) / peak;
    drawdowns.push(drawdown);

    // Track daily return
    if (previousPortfolio > 0) {
      const dailyReturn = (portfolio - previousPortfolio) / previousPortfolio;
      dailyReturns.push(dailyReturn);
    }
  }

  // Calculate metrics
  const maxDrawdown = drawdowns.length > 0 ? Math.max(...drawdowns) : 0;

  // CAGR: (final / initial)^(1/years) - 1
  // Assume 252 trading days per year, 1 trade per day
  const years = numTrades / 252;
  const totalReturn = portfolio / initialBankroll;
  const cagr = years > 0 ? Math.pow(totalReturn, 1 / years) - 1 : 0;

  // Sharpe ratio: (mean daily return / std dev) * sqrt(252)
  // Risk-free rate = 0
  let sharpe = 0;
  if (dailyReturns.length > 0) {
    const meanReturn = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;
    const variance =
      dailyReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) /
      dailyReturns.length;
    const stdDev = Math.sqrt(variance);
    sharpe = stdDev > 0 ? (meanReturn / stdDev) * Math.sqrt(252) : 0;
  }

  return {
    finalWealth: portfolio,
    cagr,
    maxDrawdown,
    sharpe,
  };
}
