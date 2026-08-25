# DATA_FLOW — candle → experiment → artifact

> Increment S11 · audited 2026-08-26 · all paths and function names verified on disk.

## Stage 1 — Ingestion

```
Binance klines API
  └─ src/desk/data/binance-feed.ts  (fetchBinanceHistory, :128)
       └─ src/desk/data/candle-contracts.ts   (boundary schema validation)
            └─ src/desk/data/ohlcv-store.ts   (Postgres: storeCandle :39,
                 bulkInsertCandles :68, getHistoricalData :122, getCandleCount :167)
```

- Persistence: Postgres via `src/desk/db/postgres-client.ts`; schema in `src/shared/db/migrations/`.
- Sentiment side-channel: `src/desk/data/sentiment-feed.ts` (no funding/OI source exists — see `MIGRATION_PLAN.md`).
- Provider resilience: `src/desk/market-data/provider-failover.ts` (circuit breaker + SLA tracker); aggregation `src/desk/feeds/feed-aggregator.ts`. There is no file named "router" — routing is covered by failover + aggregator + contracts (master-command P3, verdict ADAPT).

## Stage 2 — Quality gate

```
ohlcv-store ──► src/desk/data/data-quality-gate.ts
                  ├─ quality-metrics.ts        (metric computation)
                  ├─ data-quality-types.ts     (types)
                  ├─ src/desk/market-data/outlier-detection.ts
                  └─ src/desk/market-data/gap-detector.ts
```

Candles failing quality checks are flagged before entering research (S2).

## Stage 3 — Experiment

```
src/alpha-lab/configs/*.json (e.g. rsi-mean-reversion.json)
  └─ src/alpha-lab/run-experiment.ts
       ├─ experiments/experiment-engine.ts   (IS/OOS splits via split-metrics.ts)
       ├─ experiments/alpha-backtest-adapter.ts (bridges desk backtest engine)
       ├─ regimes/regime-engine.ts + regime-series.ts (regime tagging)
       └─ cost-model/cost-stress.ts (NORMAL/CONSERVATIVE/ADVERSE/EXTREME)
```

The artifact written by `run-experiment.ts` labels its data source at `:153` (`dataSource: source`). Acceptance runs require `dataSource === 'real'` — a mock-source run is never accepted as evidence.

## Stage 4 — Validation

```
experiment output
  ├─ validation/monte-carlo-permutation.ts   (S3)
  ├─ validation/bootstrap-sharpe.ts          (S3)
  ├─ walkforward/walkforward-evaluator.ts    (regimes-aware, S9)
  └─ gates/gate-evaluator.ts + check-gates.ts (gate table)
```

## Stage 5 — Provenance + verdict

```
run-experiment.ts --record
  ├─ provenance/research-ledger.ts   (hash-chained ledger)
  ├─ provenance/run-card.ts          (config hash per run)
  ├─ provenance/run-card-index.ts
  └─ provenance/record-alpha-verdict.ts → verdict-summary.ts
       └─ alpha-discovery/research-informed.ts (ranks families by verdicts, S8)
```

## Stage 6 — Promotion + reporting

```
attribution/promotion-state-machine.ts  (DRAFT → PAPER_APPROVED → LIVE_APPROVED)
attribution/alpha-evaluator.ts, survival-gate.ts
reports/ + src/desk/cli/alpha-report-handler.ts
```

Paper-only policy: LIVE_APPROVED is reachable in the state machine but live order submission is separately gated (`SECURITY_MODEL.md`).

## Stage 7 — Exposure

- MCP (read-only): `src/platform/mcp/research-mcp-server.ts` — list_experiments, get_run_card, get_alpha_report, get_backtest_summary; all annotated `readOnlyHint: true` (S11).
- HTTP: `src/api/routes/mcp-routes.ts` + `src/api/routes/` + `src/app.ts`.
- CLI: `src/desk/cli/cashclaw-cli.ts` (`alpha candidates`, `alpha walkforward`, `alpha robustness`, `doctor`).
- Dashboard: `dashboard/` on Cloudflare Pages.

## See also

- `AGENT_FLOW.md` — control flow around the pipeline
- `SECURITY_MODEL.md` — where execution is gated
- `MODULE_MAPPING.md` rows 8, 22, 23 — upstream equivalents
