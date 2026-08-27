/**
 * Reporting for the Kelly vs Fixed backtest.
 *
 * Prints the scenario comparison + improvement tables to stdout and writes
 * the detailed results file. Extracted from kelly-vs-fixed.backtest.ts with
 * zero behavior change.
 */

import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import type { ScenarioResult } from './kelly-backtest-simulation';
import type { BacktestParams } from './kelly-backtest-scenarios';

/**
 * Print comparison/improvement tables and summary, then persist detailed
 * results. Returns the output path of the written results file.
 */
export async function printReportAndSaveResults(
  results: ScenarioResult[],
  params: BacktestParams
): Promise<string> {
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

  const baseMetrics = results[0].metrics;

  // Console output: comparison table
  console.log('Scenario Comparison:');
  console.log('='.repeat(80));
  console.log(
    `${'Scenario'.padEnd(25)}${'Final Wealth'.padEnd(18)}${'CAGR'.padEnd(12)}${'Max DD'.padEnd(12)}${'Sharpe'}`
  );
  console.log('-'.repeat(80));

  for (const scenario of results) {
    const { finalWealth, cagr, maxDrawdown, sharpe } = scenario.metrics;
    console.log(
      `${scenario.name.padEnd(25)}` +
      `$${Math.round(finalWealth).toLocaleString()}`.padEnd(18) +
      `${(cagr * 100).toFixed(2)}%`.padEnd(12) +
      `${(maxDrawdown * 100).toFixed(2)}%`.padEnd(12) +
      `${sharpe.toFixed(4)}`
    );
  }

  console.log('='.repeat(80));
  console.log('');

  // Improvement table
  console.log('Improvement vs Fixed 2%:');
  console.log('='.repeat(80));
  console.log(
    `${'Scenario'.padEnd(25)}${'CAGR Δ'.padEnd(12)}${'Max DD Δ'.padEnd(12)}${'Sharpe Δ'}`
  );
  console.log('-'.repeat(80));

  for (let i = 1; i < results.length; i++) {
    const s = results[i];
    const cagrDelta = ((s.metrics.cagr - baseMetrics.cagr) / Math.abs(baseMetrics.cagr)) * 100;
    const ddDelta = ((s.metrics.maxDrawdown - baseMetrics.maxDrawdown) / baseMetrics.maxDrawdown) * 100;
    const sharpeDelta =
      ((s.metrics.sharpe - baseMetrics.sharpe) / Math.abs(baseMetrics.sharpe)) * 100;

    const sharpeDeltaFormatted = baseMetrics.sharpe === 0 ? 'N/A' : `${sharpeDelta.toFixed(1)}%`;

    console.log(
      `${s.name.padEnd(25)}` +
      `${cagrDelta >= 0 ? '+' : ''}${cagrDelta.toFixed(1)}%`.padEnd(12) +
      `${ddDelta >= 0 ? '+' : ''}${ddDelta.toFixed(1)}%`.padEnd(12) +
      `${sharpeDelta >= 0 ? '+' : ''}${sharpeDeltaFormatted}`
    );
  }

  console.log('='.repeat(80));
  console.log('');

  // Summary
  const bestSharpeScenario = results
    .slice(1)
    .reduce((best, curr) => (curr.metrics.sharpe > best.metrics.sharpe ? curr : best));
  const sharpeImprovement =
    ((bestSharpeScenario.metrics.sharpe - baseMetrics.sharpe) / Math.abs(baseMetrics.sharpe)) *
    100;

  console.log('SUMMARY:');
  console.log(`- Initial bankroll: $${initialBankroll.toLocaleString()}`);
  console.log(`- Trades simulated: ${numTrades}`);
  console.log(`- Win probability: ${(winProbability * 100).toFixed(1)}%`);
  console.log(`- Win/loss ratio: ${winLossRatio}:1`);
  console.log(`- Kelly fraction: ${kellyFraction} (quarter-Kelly)`);
  console.log(`- Max position cap: ${maxPositionFraction * 100}%`);
  console.log('');
  console.log(`Target: Sharpe improvement ≥20%`);
  console.log(`Achieved: ${sharpeImprovement.toFixed(1)}% improvement with ${bestSharpeScenario.name}`);
  console.log(`Status: ${sharpeImprovement >= 20 ? '✓ PASS' : '✗ FAIL'}`);
  console.log('');

  // ==========================================================================
  // Save detailed results to file
  // ==========================================================================

  const outputDir = '/Users/macbook/algo-trader/plans/20260617-1430-differentiation-quick-wins';
  const outputPath = join(outputDir, 'backtest-kelly-results.txt');

  const timestamp = new Date().toISOString();
  const outputContent = `
================================================================================
KELLY VS FIXED POSITION SIZER BACKTEST RESULTS
Generated: ${timestamp}
================================================================================

SIMULATION PARAMETERS:
- Initial bankroll: $${initialBankroll}
- Number of trades: ${numTrades}
- Win probability: ${winProbability} (${(winProbability * 100).toFixed(1)}%)
- Win/loss ratio: ${winLossRatio}:1 (win = ${winLossRatio}R, loss = 1R)
- Kelly fraction: ${kellyFraction} (quarter-Kelly)
- Max position cap: ${maxPositionFraction * 100}%
- Correlation scenarios: [${correlationScenarios.join(', ')}]
- Random seed: ${randomSeed} (Linear Congruential Generator)

ASSUMPTIONS:
- 1 trade per day (252 trading days per year for CAGR)
- Risk-free rate = 0 (Sharpe ratio calculation)
- No transaction costs, slippage, or taxes
- Independence of trades (except correlation affects position size)
- Kelly formula: f* = (bp - q) / b, where b = win/loss ratio, p = win prob, q = 1-p
- Correlation adjustment: position *= (1 - correlation)
- Minimum position size: $1 (effectively no floor for this simulation)

${'='.repeat(80)}

PERFORMANCE METRICS:
${results
  .map(
    (s) => `
${s.name}:
  Final Wealth:   $${s.metrics.finalWealth.toFixed(2)}
  CAGR:           ${(s.metrics.cagr * 100).toFixed(2)}%
  Max Drawdown:   ${(s.metrics.maxDrawdown * 100).toFixed(2)}%
  Sharpe Ratio:   ${s.metrics.sharpe.toFixed(4)}
`
  )
  .join('='.repeat(80) + '\n')}

${'='.repeat(80)}

IMPROVEMENT ANALYSIS (vs Fixed 2%):
${results
  .slice(1)
  .map(
    (s) => {
      const cagrDelta = ((s.metrics.cagr - baseMetrics.cagr) / Math.abs(baseMetrics.cagr)) * 100;
      const ddDelta =
        ((s.metrics.maxDrawdown - baseMetrics.maxDrawdown) / baseMetrics.maxDrawdown) * 100;
      const sharpeDelta =
        ((s.metrics.sharpe - baseMetrics.sharpe) / Math.abs(baseMetrics.sharpe)) * 100;
      return `
${s.name}:
  CAGR improvement:        ${cagrDelta >= 0 ? '+' : ''}${cagrDelta.toFixed(1)}%
  Max drawdown change:     ${ddDelta >= 0 ? '+' : ''}${ddDelta.toFixed(1)}%
  Sharpe improvement:      ${sharpeDelta >= 0 ? '+' : ''}${sharpeDelta.toFixed(1)}%
`;
    }
  )
  .join('---\n')}

${'='.repeat(80)}

CONCLUSION:
- Best Sharpe ratio: ${bestSharpeScenario.name} (${bestSharpeScenario.metrics.sharpe.toFixed(4)})
- Sharpe improvement vs Fixed 2%: ${sharpeImprovement.toFixed(1)}%
- Target achieved: ${sharpeImprovement >= 20 ? 'YES ✓' : 'NO ✗'}

${sharpeImprovement >= 20
  ? '\nThe simulation confirms that correlation-adjusted Kelly position sizing\nachieves ≥20% Sharpe ratio improvement over fixed 2% sizing.'
  : '\nNOTE: Sharpe improvement was below 20% target. Consider:\n- Lower win probability or different win/loss ratio\n- Higher correlation scenarios\n- Different Kelly fraction\n- More trades (longer simulation)'}

================================================================================
`;

  // Ensure directory exists and write file
  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, outputContent);

  console.log(`Detailed results saved to: ${outputPath}`);
  console.log('');

  return outputPath;
}
