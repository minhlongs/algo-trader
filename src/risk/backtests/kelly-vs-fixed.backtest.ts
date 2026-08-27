/**
 * Kelly vs Fixed Position Sizer Backtest
 *
 * Simulates trading performance comparing fixed 2% sizing with correlation-adjusted Kelly.
 * Demonstrates Sharpe ratio improvement ≥20% target.
 *
 * Run: npx ts-node src/risk/backtests/kelly-vs-fixed.backtest.ts
 *
 * Modules:
 * - kelly-backtest-simulation.ts: seeded RNG + trade simulation
 * - kelly-backtest-scenarios.ts: sizer definitions + scenario runs
 * - kelly-backtest-report.ts: comparison tables + results file write
 */

import { runScenarios, type BacktestParams } from './kelly-backtest-scenarios';
import { printReportAndSaveResults } from './kelly-backtest-report';

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  // Simulation parameters
  const params: BacktestParams = {
    initialBankroll: 10000,
    numTrades: 1000,
    winProbability: 0.55,
    winLossRatio: 2.0,
    kellyFraction: 0.25, // quarter-Kelly
    maxPositionFraction: 0.05, // 5% cap
    correlationScenarios: [0, 0.3, 0.6, 0.9],
    randomSeed: 12345, // For reproducibility
  };

  console.log('Running Kelly vs Fixed Position Sizer Backtest...\n');

  const results = runScenarios(params);

  await printReportAndSaveResults(results, params);

  // Exit with success
  process.exit(0);
}

// Run main function
main().catch((error) => {
  console.error('Backtest failed:', error);
  process.exit(1);
});
