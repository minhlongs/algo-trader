# CURRENT_ARCHITECTURE — what this repo actually is

> Increment S11 · audited 2026-08-26 · all paths verified on disk.
> This repo (`algo-trader`, product: CashClaw / ZEN Alpha Factory) is a TypeScript trading-research
> platform for crypto + prediction markets, paper-only by default. It is NOT a port of any single
> upstream; it is an evolution (S1–S11 + CashClaw workstream).

## Top-level layout

| Area | Path | Role |
|---|---|---|
| Research lab | `src/alpha-lab/` | Deterministic experiment engine, validation, provenance, regimes, gates |
| Trading desk | `src/desk/` | Market data, execution, paper trading, risk, backtesting, CLI |
| Core engine | `src/engine/` | Strategy runner + trade executor (`strategy-runner.ts`, `trade-executor.ts`) |
| Agentic layer | `src/agentic/` | Domain agents (billing, content, lead-hunter, strategy-lab, …) |
| Intelligence | `src/intelligence/` | Signal consensus swarm (`signal-consensus-swarm.ts`) |
| Platform | `src/platform/` | MCP servers, auth, middleware (Prometheus) |
| API | `src/api/routes/` + `src/app.ts` | HTTP surface |
| Dashboard | `dashboard/` | Cloudflare Pages frontend |
| CI gates | `scripts/` | Secret scan, paper-gate-lock, quality ratchet |

## Research pipeline (alpha-lab)

Flow: config → experiment → validation → gates → verdict → ledger.

1. **Config**: `src/alpha-lab/configs/*.json` (e.g. `rsi-mean-reversion.json`) + family registry `src/alpha-lab/alpha-discovery/strategy-family-registry.ts`.
2. **Experiment**: `src/alpha-lab/run-experiment.ts` drives `src/alpha-lab/experiments/experiment-engine.ts` (IS/OOS splits via `split-metrics.ts`).
3. **Validation**: `src/alpha-lab/validation/monte-carlo-permutation.ts`, `bootstrap-sharpe.ts`; walkforward `src/alpha-lab/walkforward/walkforward-evaluator.ts`.
4. **Regimes**: `src/alpha-lab/regimes/regime-engine.ts` + `regime-series.ts` tag artifacts (`regimesPresent`).
5. **Cost model**: `src/alpha-lab/cost-model/cost-stress.ts` — 4 stress modes (NORMAL/CONSERVATIVE/ADVERSE/EXTREME).
6. **Gates**: `src/alpha-lab/gates/gate-evaluator.ts` + `src/alpha-lab/check-gates.ts`.
7. **Attribution/promotion**: `src/alpha-lab/attribution/promotion-state-machine.ts` (DRAFT → PAPER_APPROVED → LIVE_APPROVED; paper-only policy enforced).
8. **Provenance**: hash-chained ledger `src/alpha-lab/provenance/research-ledger.ts`, run cards `run-card.ts` + `run-card-index.ts`, verdicts `record-alpha-verdict.ts` + `verdict-summary.ts`.
9. **Prioritization**: `src/alpha-lab/alpha-discovery/research-informed.ts` ranks families by verdict ledger (S8).

## Trading desk

- **Market data**: `src/desk/data/binance-feed.ts` (klines), `src/desk/data/ohlcv-store.ts` (Postgres persistence), `src/desk/market-data/provider-failover.ts` (circuit breaker + SLA), `src/desk/feeds/feed-aggregator.ts`.
- **Data quality**: `src/desk/data/data-quality-gate.ts` + `quality-metrics.ts` + `candle-contracts.ts`; outlier/gap detection in `src/desk/market-data/`.
- **Execution**: mode gate `src/desk/execution/execution-mode.ts` (READ_ONLY default), `live-order-manager.ts`, `cex-order-executor.ts`; sandbox `src/desk/sandbox/strategy-static-scanner.ts`.
- **Paper trading**: `src/desk/paper-trading/paper-trading-loop.ts`, `src/paper-trading/paper-exchange.ts`, `src/desk/execution/paper-position-tracker.ts`, `dry-run-position-tracker.ts`.
- **Risk**: `src/desk/risk/risk-gate-manager.ts`, `value-at-risk.ts`, `portfolio-allocator.ts`, `src/risk/kelly-position-sizer.ts`.
- **Backtesting**: `src/desk/backtesting/backtest-runner.ts` + `metrics-calculator.ts`; alpha adapter `src/alpha-lab/experiments/alpha-backtest-adapter.ts`.
- **CLI**: `src/desk/cli/cashclaw-cli.ts` (commands incl. `doctor`, alpha ops) + `alpha-commands.ts`, `alpha-report-handler.ts`, `system-doctor.ts`.

## Platform & integrations

- **MCP**: `src/platform/mcp/research-mcp-server.ts` (4 read-only tools, `readOnlyHint: true`), `signal-mcp-server.ts`; routes `src/api/routes/mcp-routes.ts`.
- **Observability**: `src/platform/middleware/prometheus-metrics.ts`, `src/utils/sentry-init.ts`, `src/desk/core/logger.ts`.
- **Persistence**: Postgres via `src/desk/db/postgres-client.ts`; migrations `src/shared/db/migrations/`.
- **Dashboard**: `dashboard/` deployed to Cloudflare Pages (`scripts/deploy-cloudflare.sh`).

## Operating doctrine

- Paper-only by default; LIVE requires a literal env string (see `SECURITY_MODEL.md`).
- Every research number traces to a ledger hash + run-card config hash.
- Deterministic TypeScript pipeline — zero LLM-in-the-loop in research.
- CI ratchet: `quality-baseline.json` enforced by `scripts/check-quality-baseline.mjs` (8 gates).

## See also

- `DATA_FLOW.md` — candle → experiment → artifact flow
- `AGENT_FLOW.md` — how agents and the signal loop operate
- `SECURITY_MODEL.md` — execution gating and fail-closed controls
