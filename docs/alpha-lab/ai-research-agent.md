# AI Research Agent Interface — Alpha Discovery

## Purpose

LLM-friendly, deterministic interface for autonomous alpha discovery. Exposes structured methods that return JSON. No side effects.

## Available Operations

| Operation | Input | Output | Description |
|-----------|-------|--------|-------------|
| `runExperiment` | candles + config | ExperimentResult | Run single experiment |
| `evaluateWalkForward` | candles + config | WalkForwardResult | Rolling walk-forward evaluation |
| `evaluate` | candles + trades + labels + regimes | EvaluationReport | Regime-aware evaluation |
| `evaluateAlpha` | candidate + candles | AlphaVerdict | Compare against baselines |
| `runAllBaselines` | candles + cost params | BaselineRun[] | All 4 baseline benchmarks |
| `batchLabel` | candles + tp/sl/maxHolding | TripleBarrierResult[] | Event labels |
| `classifyRegime` | candles | MarketRegime | Regime classification |

## Workflow

```
1. Load candle data
2. classifyRegime per bar → regime tags
3. buildFeatureVector per bar → feature vectors
4. batchLabel → event labels (TP/SL/timeout)
5. runExperiment → train/val/test metrics
6. evaluateWalkForward → overfit gap + consistency
7. evaluate → regime/month/volatility breakdown
8. runAllBaselines → benchmark comparison
9. evaluateAlpha → PASS/FAIL verdict
10. survivalGate → final gate (with ablation)
11. promotion state machine → CANDIDATE → PAPER_APPROVED
```

## Full Discovery API

```typescript
import { runFullDiscovery } from '@/alpha-lab/reports/research-agent-api';

const result = await runFullDiscovery(candles, config);
// → { experiment, walkForward, evaluation, baselines, verdict }
```

## Causal Invariants

- All functions are deterministic.
- No future data in features, labels, or regime detection.
- Fees + slippage applied to all trades.

## Files

- `src/alpha-lab/reports/research-agent-api.ts` — re-exports all research operations
- `src/alpha-lab/reports/research-agent-types.ts` — type definitions