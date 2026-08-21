# AI Research Agent

Claude is the **Chief Quant Research Assistant** — analyst, not executor.

## Location

`src/alpha-lab/reports/research-agent-api.ts` — type hub / entry point
`src/alpha-lab/reports/research-agent-types.ts` — shared types
`src/alpha-lab/reports/hypothesis-generator.ts` — deterministic hypothesis engine
`src/alpha-lab/reports/hypothesis-rules.ts` — detection rules

## What Claude May Do

- Analyze experiment results
- Identify patterns across regimes, months, volatility buckets
- Propose hypotheses for the next research cycle
- Explain why a strategy won or lost
- Compare candidate strategies against baselines

## What Claude Must NOT Do

- Place orders or bypass risk controls
- Alter live execution
- Fabricate results
- Declare profitability without statistical evidence
- Confuse OBSERVED FACT with HYPOTHESIS or SPECULATION

## Structured Output

The research interface returns:

```jsonc
{
  "hypothesis": "...",
  "observations": [],
  "possibleExplanations": [],
  "nextExperiments": [],
  "confidence": 0.0
}
```

## Hypothesis Generator

`generateHypotheses(input)` is a **deterministic, rule-based** pattern detector.
It reads an `EvaluationReport` (plus optional `CandidateResult` and baselines)
and emits up to 8 hypotheses, each with:

- `name`, `description`
- `features`, `regimeFilter`
- `entryCondition`, `exitCondition`
- `expectedMechanism`
- `confidence` — derived from signal strength by a fixed scoring formula
- `evidence` — concrete observations from the input

Detection rules:

| Rule | Trigger | Hypothesis |
|------|---------|------------|
| Regime gap | One regime has positive PnL, others don't | Add a regime filter |
| Win rate vs Sharpe | Win rate > 0.5 but Sharpe negative | Tighten stop-loss / reduce size on losers |
| Drawdown | maxDrawdown > 0.3 | Add drawdown-based position sizing |
| Profit factor | profitFactor < 1.5 | Edge is thin — better entry timing or conviction |
| Seasonality | High month variance | Test seasonality / skip weak months |
| Volatility degradation | High-vol bucket underperforms | Add volatility filter / reduce size in high vol |
| Overfitting | Beats buy-hold but loses to random | Reduce feature count, re-test with fewer params |
| Sample size | < 30 trades | Increase test period or reduce lookback |

`previousHypotheses` filters out re-proposals. `summarizeHypotheses()`
produces human-readable output for CLI / report use.

## Determinism

The generator is pure: same input → byte-identical output. No LLM calls, no
randomness. Claude can enrich these hypotheses later — the mechanical layer
guarantees the raw material is reproducible.

## CLI

```
algo-trader alpha candidates
algo-trader alpha discover <symbol> --tf <timeframe>
algo-trader alpha backtest | walkforward | compare | report | ablation | robustness
```