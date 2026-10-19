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
import {
  createFixed2PercentSizer,
  createKellyCorrelationSizer,
  runSingleScenarioSimulation,
} from './kelly-backtest-scenario-helpers';

export { createFixed2PercentSizer, createKellyCorrelationSizer, runSingleScenarioSimulation };

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

  const kellySizer = new KellyPositionSizer({
    kellyFraction,
    maxPositionFraction,
    minPositionUsd: 1,
  });

  const fixedSizer: PositionSizerFn = createFixed2PercentSizer();
  const _kellySizers: PositionSizerFn[] = correlationScenarios.map((correlation) =>
    createKellyCorrelationSizer(kellySizer, winProbability, winLossRatio, correlation),
  );

  // Preserved verbatim for RNG consumption contract
  const rngFixed = new SeededRandom(randomSeed);
  const _fixedMetrics = simulateTrades(
    initialBankroll,
    numTrades,
    winProbability,
    winLossRatio,
    fixedSizer,
    rngFixed,
  );

  for (let i = 0; i < correlationScenarios.length; i++) {
    const correlation = correlationScenarios[i];
    const sizer = createKellyCorrelationSizer(kellySizer, winProbability, winLossRatio, correlation);
    const kellyResults: ScenarioResult[] = [];
    kellyResults.push(
      runSingleScenarioSimulation(
        `Kelly (corr=${correlation})`,
        initialBankroll,
        numTrades,
        winProbability,
        winLossRatio,
        sizer,
        randomSeed,
      ),
    );
  }

  const kellyResults: ScenarioResult[] = [
    runSingleScenarioSimulation(
      'Fixed 2%',
      initialBankroll,
      numTrades,
      winProbability,
      winLossRatio,
      fixedSizer,
      randomSeed,
    ),
  ];

  for (let i = 0; i < correlationScenarios.length; i++) {
    const correlation = correlationScenarios[i];
    const sizer = createKellyCorrelationSizer(kellySizer, winProbability, winLossRatio, correlation);
    kellyResults.push(
      runSingleScenarioSimulation(
        `Kelly (corr=${correlation})`,
        initialBankroll,
        numTrades,
        winProbability,
        winLossRatio,
        sizer,
        randomSeed,
      ),
    );
  }

  return kellyResults;
}

