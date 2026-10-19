/**
 * Formatters for Kelly vs Fixed Backtest Reports
 */

import type { ScenarioResult } from './kelly-backtest-simulation';
import type { BacktestParams } from './kelly-backtest-scenarios';

export function formatComparisonTable(results: ScenarioResult[]): string[] {
  const lines: string[] = [];
  lines.push('Scenario Comparison:');
  lines.push('='.repeat(80));
  lines.push(
    `${'Scenario'.padEnd(25)}${'Final Wealth'.padEnd(18)}${'CAGR'.padEnd(12)}${'Max DD'.padEnd(12)}${'Sharpe'}`
  );
  lines.push('-'.repeat(80));

  for (const scenario of results) {
    const { finalWealth, cagr, maxDrawdown, sharpe } = scenario.metrics;
    lines.push(
      `${scenario.name.padEnd(25)}` +
      `$${Math.round(finalWealth).toLocaleString()}`.padEnd(18) +
      `${(cagr * 100).toFixed(2)}%`.padEnd(12) +
      `${(maxDrawdown * 100).toFixed(2)}%`.padEnd(12) +
      `${sharpe.toFixed(4)}`
    );
  }
  lines.push('='.repeat(80));
  return lines;
}

export function formatImprovementTable(results: ScenarioResult[]): string[] {
  const lines: string[] = [];
  const baseMetrics = results[0].metrics;

  lines.push('Improvement vs Fixed 2%:');
  lines.push('='.repeat(80));
  lines.push(
    `${'Scenario'.padEnd(25)}${'CAGR Δ'.padEnd(12)}${'Max DD Δ'.padEnd(12)}${'Sharpe Δ'}`
  );
  lines.push('-'.repeat(80));

  for (let i = 1; i < results.length; i++) {
    const s = results[i];
    const cagrDelta = ((s.metrics.cagr - baseMetrics.cagr) / Math.abs(baseMetrics.cagr)) * 100;
    const ddDelta = ((s.metrics.maxDrawdown - baseMetrics.maxDrawdown) / baseMetrics.maxDrawdown) * 100;
    const sharpeDelta =
      ((s.metrics.sharpe - baseMetrics.sharpe) / Math.abs(baseMetrics.sharpe)) * 100;
    const sharpeDeltaFormatted = baseMetrics.sharpe === 0 ? 'N/A' : `${sharpeDelta.toFixed(1)}%`;

    lines.push(
      `${s.name.padEnd(25)}` +
      `${cagrDelta >= 0 ? '+' : ''}${cagrDelta.toFixed(1)}%`.padEnd(12) +
      `${ddDelta >= 0 ? '+' : ''}${ddDelta.toFixed(1)}%`.padEnd(12) +
      `${sharpeDelta >= 0 ? '+' : ''}${sharpeDeltaFormatted}`
    );
  }
  lines.push('='.repeat(80));
  return lines;
}

export function generateReportFileContent(
  results: ScenarioResult[],
  params: BacktestParams,
  timestamp: string,
  sharpeImprovement: number,
  bestSharpeScenario: ScenarioResult
): string {
  const baseMetrics = results[0].metrics;
  return `================================================================================
KELLY VS FIXED POSITION SIZER BACKTEST RESULTS
Generated: ${timestamp}
================================================================================

SIMULATION PARAMETERS:
- Initial bankroll: $${params.initialBankroll}
- Number of trades: ${params.numTrades}
- Win probability: ${params.winProbability} (${(params.winProbability * 100).toFixed(1)}%)
- Win/loss ratio: ${params.winLossRatio}:1 (win = ${params.winLossRatio}R, loss = 1R)
- Kelly fraction: ${params.kellyFraction} (quarter-Kelly)
- Max position cap: ${params.maxPositionFraction * 100}%
- Correlation scenarios: [${params.correlationScenarios.join(', ')}]
- Random seed: ${params.randomSeed} (Linear Congruential Generator)

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
  .map((s) => {
    const cagrDelta = ((s.metrics.cagr - baseMetrics.cagr) / Math.abs(baseMetrics.cagr)) * 100;
    const ddDelta = ((s.metrics.maxDrawdown - baseMetrics.maxDrawdown) / baseMetrics.maxDrawdown) * 100;
    const sharpeDelta = ((s.metrics.sharpe - baseMetrics.sharpe) / Math.abs(baseMetrics.sharpe)) * 100;
    return `
${s.name}:
  CAGR improvement:        ${cagrDelta >= 0 ? '+' : ''}${cagrDelta.toFixed(1)}%
  Max drawdown change:     ${ddDelta >= 0 ? '+' : ''}${ddDelta.toFixed(1)}%
  Sharpe improvement:      ${sharpeDelta >= 0 ? '+' : ''}${sharpeDelta.toFixed(1)}%
`;
  })
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
}
