# Subsystem — Trading Pipeline

**Overview.** Composition root that wires Kelly position sizing, 6-tier drawdown, TWAP execution, wallet manager, and immutable audit into a single `recordTradeOutcome()` orchestration point. Every trade outcome must flow through this method to preserve the wallet+drawdown+audit invariant.

**Entry points.**
- `src/trading-pipeline.ts` — `createTradingPipeline()` factory
- `src/app.ts` — constructs ApiServer + pipeline at boot
- `src/index.ts` — CLI subcommands (`gru`, `arb:auto`, `kronos`) call into pipeline

**Dependencies.**
- `src/risk/kelly-position-sizer.ts` (quarter-Kelly cap, 5% max position)
- `src/risk/tiered-drawdown-breaker.ts` (NORMAL→ALERT→REDUCE→HALT→HARD_STOP→DAILY_PAUSE)
- `src/execution/twap-executor.ts` (chunked time-weighted execution; threshold via `twapThresholdUsd`)
- `src/execution/order-executor.ts` ⚠ `placeOrder()` L130-151 is a mock — 100% fills assumed
- `src/wallet/wallet-manager.ts`
- `src/audit/immutable-trade-audit.ts` (append-only JSONL to `~/.cashclaw/trades.jsonl`)
- `src/polymarket/clob-client.ts` (v1, primary) or `clob-v2-adapter.ts` (v2, parallel)

**Runtime flow.**
```
strategy emits intent → Kelly sizes → TWAP chunks (if size > threshold)
   → OrderExecutor.placeOrder() ⚠ MOCK → pretend fill
   → pipeline.recordTradeOutcome(trade, newValue):
        wallet.recordTrade(trade)
        drawdown.update(newValue)   // may flip state, halt trading
        audit.append(trade)         // immutable
```

**Important files & line refs.**
- `src/trading-pipeline.ts` — 103 lines, contains the interface and factory
- `src/execution/order-executor.ts:130-151` — MOCK fill simulation
- `src/risk/tiered-drawdown-breaker.ts` — six-state machine
- `~/.cashclaw/trades.jsonl` — audit sink (runtime artifact, gitignored)

**Risks.**
1. **OrderExecutor is mocked** — anything calling it gets fake fills regardless of venue connectivity. HIGH.
2. **No transaction across wallet/drawdown/audit** — partial state if any of the three throws. MEDIUM.
3. **Audit file unencrypted, mode 644** — user-readable. LOW.
4. **TWAP kill_timeout=180s in PM2** — graceful shutdown depends on in-flight TWAPs finishing in 150s. MEDIUM.
5. **Two CLOB versions in deps + code** — unclear which is canonical. MEDIUM.

**Missing docs.**
- No doc explains the mock-fill nature of OrderExecutor (false sense of safety).
- No diagram of drawdown state transitions vs trade volume triggers.
- No spec for what triggers v1 vs v2 CLOB selection.

**Confidence: HIGH.**
