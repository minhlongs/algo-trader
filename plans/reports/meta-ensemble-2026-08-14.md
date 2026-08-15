# ML Meta-Ensemble: Optimal Signal Weight Learning

## What was done

Built an ML meta-ensemble module that learns optimal signal weights from historical prediction accuracy, replacing static weight fusion with a data-driven adaptive approach.

### Files created

- `/Users/macbook/algo-trader/src/desk/ml/meta-ensemble/meta-learner-types.ts` — Interfaces, config defaults, prediction shape
- `/Users/macbook/algo-trader/src/desk/ml/meta-ensemble/meta-learner.ts` — Core EMA-based weight learning engine
- `/Users/macbook/algo-trader/src/desk/ml/meta-ensemble/adaptive-fusion.ts` — Drop-in replacement for static `fuseSignals`
- `/Users/macbook/algo-trader/src/desk/ml/meta-ensemble/index.ts` — Barrel export
- `/Users/macbook/algo-trader/src/desk/ml/meta-ensemble/__tests__/meta-learner.test.ts` — Unit tests for meta-learner
- `/Users/macbook/algo-trader/src/desk/ml/meta-ensemble/__tests__/adaptive-fusion.test.ts` — Unit tests for adaptive fusion

### Files modified

- `/Users/macbook/algo-trader/src/desk/strategies/polymarket/btc-fifteen-minute-strategy.ts` — Replaced `fuseSignals` with `adaptiveFuse`

### Architecture

```
Historical predictions (data/predictions.json)
  |
  v
MetaLearner (EMA win-rate per strategy + Wilson score CI)
  |
  v
AdaptiveFusion (meta weights if data sufficient, else static fallback)
  |
  v
FusionResult (same shape as before — backward compatible)
```

### Key design decisions

1. **EMA (not simple average)**: Recent accuracy matters more. Decay=0.85 by default.
2. **Wilson score CI**: Honest uncertainty at small sample sizes (better than normal approximation).
3. **Confidence boost**: Narrower CI = higher effective weight — rewards strategies with proven consistency.
4. **Graceful fallback**: Falls back to caller-provided static weights when meta-learner has < minSamples resolved predictions.
5. **Drop-in replacement**: `adaptiveFuse()` returns same FusionResult shape + extra `weightSource` audit field.
6. **30-second cache TTL**: Reads predictions.json at most every 30 seconds to avoid disk thrash.
7. **Modular split**: Meta-learner split into 3 files (types, core, adaptive fusion) to stay under 200 LOC each.

### TypeScript compilation

All new files compile cleanly under `npx tsc --noEmit`. Pre-existing errors in `strategy-registry-full.ts`, `polymarket-adapter.ts`, `app.ts` are unrelated.

### Tests

Test files created but could not run in this environment — vitest's native Linux bindings are missing (node_modules were installed on macOS, but this sandbox runs Linux). Tests are structurally sound and follow the same vitest patterns used in `signal-fusion-regime.test.ts`.

## Unresolved questions

1. **Cross-platform arb strategy integration**: `btc-fifteen-minute-strategy.ts` was wired to adaptive fusion, but `kronos-strategy.ts` and `GruStrategy.ts` use `ISignal` output (action/confidence/reason) rather than `SignalInput` format. Wiring them requires a signal adapter layer — not done here since it would change their interfaces.

2. **Prediction-to-signal-name mapping**: The tracker stores predictions by `strategy` name (e.g. "kronos", "gru"), but `fuseSignals` uses signal `name` (e.g. "momentum", "revert"). The meta-learner uses `strategy` field. For the meta-ensemble to work end-to-end, signal names in `fuseSignals` calls need to map to strategy names tracked by the accuracy tracker. Currently `btc-fifteen-minute-strategy.ts` uses sub-signal names (momentum, volatility, mean-reversion) that don't map to strategy-level predictions. This mapping needs a one-to-one mapping between strategy names and signal names for the meta-learner to be effective.

3. **Evolving decay**: The EMA decay (0.85) is static. A more sophisticated approach would adapt the decay based on regime or performance drift, but that adds complexity beyond current needs.

4. **Backtesting integration**: No backtest harness was created to compare adaptive vs static fusion performance. This would validate whether meta-learned weights actually improve prediction accuracy over time.
