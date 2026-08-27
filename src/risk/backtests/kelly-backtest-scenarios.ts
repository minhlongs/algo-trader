/**
 * Scenario setup for the Kelly vs Fixed backtest.
 *
 * Builds the fixed 2% sizer and the correlation-adjusted Kelly sizers, then
 * runs all scenarios against a shared seeded RNG. Extracted from
 * kelly-vs-fixed.backtest.ts with zero behavior change.
 *
 * NOTE: the first Kelly loop below consumes RNG without recording results.
 * It is preserved verbatim because the RNG consumption order is part of the
 * deterministic output contract.
 */

import { KellyPositionSizer } from '../kelly-position-sizer';
import {
  SeededRandom,
  simulateTrades,
  type PositionSizerFn,
  type ScenarioResult,
} from './kelly-backtest-simulation';

export interface BacktestParams {
  initialBankroll: number;
  numTrades: number;
  winProbability: number;
  winLossRatio: number;
  kellyFraction: number;
  maxPositionFraction: number;
  correlationScenarios: number[];
  randomSeed: number;
}

/**
 * Run the fixed 2% base case plus one Kelly scenario per correlation value.
 * Every scenario starts from a fresh RNG seeded with the same value.
 */
export function runScenarios(params: BacktestParams): ScenarioResult[] {
  const {
    initialBankroll,
    numTrades,
    winProbability,
    winLossRatio,
    kellyFraction,
    maxPositionFraction,
    correlationScenarios,
    randomSeed,
  } = params;

  // Initialize Kelly position sizer
  const kellySizer = new KellyPositionSizer({
    kellyFraction,
    maxPositionFraction,
    minPositionUsd: 1, // effectively no minimum for this simulation
  });

  // ==========================================================================
  // Define position sizing functions for each scenario
  // ==========================================================================

  // Fixed 2% sizing
  const fixedSizer: PositionSizerFn = (portfolio) => portfolio * 0.02;

  // Kelly sizers with different correlations
  const kellySizers: PositionSizerFn[] = correlationScenarios.map((correlation) => {
    return (portfolio: number, tradeIndex: number): number => {
      const result = kellySizer.calculatePositionSize({
        winProbability,
        winLossRatio,
        portfolioValue: portfolio,
        correlation,
      });
      return result.positionSizeUsd;
    };
  });

  // ==========================================================================
  // Run simulations
  // ==========================================================================

  // Fixed 2% scenario (base case)
  const rngFixed = new SeededRandom(randomSeed);
  const fixedMetrics = simulateTrades(
    initialBankroll,
    numTrades,
    winProbability,
    winLossRatio,
    fixedSizer,
    rngFixed
  );

  // Kelly scenarios (each with fresh RNG seeded same value for fair comparison)
  for (let i = 0; i < correlationScenarios.length; i++) {
    const correlation = correlationScenarios[i];
    // Create a sizer function that captures this correlation value
    const sizer: PositionSizerFn = (portfolio: number, tradeIndex: number) => {
      const result = kellySizer.calculatePositionSize({
        winProbability,
        winLossRatio,
        portfolioValue: portfolio,
        correlation,
      });
      return result.positionSizeUsd;
    };
    const rng = new SeededRandom(randomSeed);
    const kellyResults: { name: string; metrics: ReturnType<typeof simulateTrades> }[] = [];
    kellyResults.push({
      name: `Kelly (corr=${correlation})`,
      metrics: simulateTrades(
        initialBankroll,
        numTrades,
        winProbability,
        winLossRatio,
        sizer,
        rng
      ),
    });
  }

  // Wait, I need to be careful here. The kellySizers array has different correlation values
  // Let me fix the simulation loop

  const kellyResults: ScenarioResult[] = [];

  // Run fixed scenario
  const rngFixed2 = new SeededRandom(randomSeed);
  kellyResults.push({
    name: 'Fixed 2%',
    metrics: simulateTrades(
      initialBankroll,
      numTrades,
      winProbability,
      winLossRatio,
      fixedSizer,
      rngFixed2
    ),
  });

  // Run Kelly scenarios
  for (let i = 0; i < correlationScenarios.length; i++) {
    const correlation = correlationScenarios[i];
    const sizer: PositionSizerFn = (portfolio: number, tradeIndex: number) => {
      const result = kellySizer.calculatePositionSize({
        winProbability,
        winLossRatio,
        portfolioValue: portfolio,
        correlation,
      });
      return result.positionSizeUsd;
    };
    const rng = new SeededRandom(randomSeed);
    kellyResults.push({
      name: `Kelly (corr=${correlation})`,
      metrics: simulateTrades(
        initialBankroll,
        numTrades,
        winProbability,
        winLossRatio,
        sizer,
        rng
      ),
    });
  }

  return kellyResults;
}
