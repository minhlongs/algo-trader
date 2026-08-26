# MODULE_MAPPING — Vibe-Trading upstream → this repo

> Increment S11 · audited 2026-08-26 · evidence: `plans/reports/researcher-vibe-trading-recon-20260826.md`
> Upstream: `https://github.com/HKUDS/Vibe-Trading` (Python, MIT). This repo is TypeScript.
> Verdicts: KEEP = existing equivalent sufficient · PORT = upstream pattern adopted · ADAPT = subset lives under different name · REJECT = not wanted · DEFERRED = consciously postponed.

## Path convention legend

- **Bare paths** (e.g. `src/desk/data/binance-feed.ts`, `docs/architecture/`) are **repo-relative** — relative to the root of this repository.
- Paths prefixed with **`agent/`** or **`frontend/`** are **upstream-relative** — they point into the Vibe-Trading upstream repo layout, not this repo.
- A **`file:`** prefix (e.g. `file:src/...`) is tolerated as a synonym for the bare path when tooling emits it; strip the prefix to resolve repo-relative.

## License

Upstream `LICENSE` verified MIT (recon B1A, quoted in full in the recon report). Concept-level reuse only; no upstream source was copied into `src/`.

## Audit 2026-08-26

Every repo path below was re-checked on disk during recon. Rows 4, 27, 28 reflect B3 executor diffs present in the working tree at audit time.

| # | Master-cmd domain | Upstream module | Repo equivalent (real path) | Verdict |
|---|---|---|---|---|
| 1 | Architecture docs (P1) | `wiki/` + README | `docs/architecture/` (was only `decisions/`; 9 files created in S11) | ADAPT |
| 2 | Research pipeline | `agent/src/scheduled_research/` + `goal/` + `hypotheses/` | `src/alpha-lab/run-experiment.ts` + `src/alpha-lab/experiments/experiment-engine.ts` + `src/alpha-lab/gates/gate-evaluator.ts` | ADAPT |
| 3 | Finance skills (90) | `agent/src/skills/*` | none — domain logic in `src/desk/markets/`, `src/desk/data/binance-feed.ts`, `src/desk/arbitrage/` | REJECT |
| 4 | MCP layer (74 tools) | `agent/mcp_server.py` + `agent/src/tools/mcp.py` | `src/platform/mcp/research-mcp-server.ts` (4 tools, `readOnlyHint` added S11) + `src/api/routes/mcp-routes.ts` | PORT |
| 5 | Agents (ReAct loop) | `agent/src/agent/loop.py` | `src/engine/` (strategy-runner, trade-executor) + `src/agentic/` + `src/wiring/qwen-signals-loop.ts` | KEEP |
| 6 | Swarm | `agent/src/swarm/` | `src/intelligence/signal-consensus-swarm.ts` (+ `src/desk/intelligence/`) | ADAPT |
| 7 | Memory | `agent/src/memory/` | none — provenance via `src/alpha-lab/provenance/research-ledger.ts`; `src/shared/utils/memory-pool.ts` is unrelated infra | REJECT |
| 8 | Market-data routing | `agent/src/market_data.py` | `src/desk/market-data/provider-failover.ts` + `src/desk/data/binance-feed.ts` + `src/desk/feeds/feed-aggregator.ts` + `src/desk/data/candle-contracts.ts` | ADAPT |
| 9 | Alpha Zoo | `agent/src/factors/zoo/` | `src/alpha-lab/alpha-discovery/strategy-family-registry.ts` + `src/alpha-lab/alpha-discovery/strategy-families.ts` | DEFERRED |
| 10 | Factor research infra | `agent/src/factors/` | `src/alpha-lab/features/` | ADAPT |
| 11 | Backtesting | `agent/backtest/engines/` | `src/desk/backtesting/backtest-runner.ts` + `src/desk/backtesting/metrics-calculator.ts`; alpha path `src/alpha-lab/experiments/alpha-backtest-adapter.ts` | KEEP |
| 12 | Validation (MC/bootstrap/WF) | `agent/backtest/validation.py` | `src/alpha-lab/validation/monte-carlo-permutation.ts` + `src/alpha-lab/validation/bootstrap-sharpe.ts` + `src/alpha-lab/walkforward/walkforward-evaluator.ts` | PORT |
| 13 | Strategy discovery | `agent/src/strategy_discovery/` | `src/alpha-lab/alpha-discovery/research-informed.ts` + `src/alpha-lab/provenance/verdict-summary.ts` | ADAPT |
| 14 | Strategy store | `agent/src/strategy_store/sqlite_store.py` | `src/alpha-lab/configs/*.json` + `src/alpha-lab/provenance/run-card-index.ts` + family registry | ADAPT |
| 15 | Shadow account | `agent/src/shadow_account/` | `src/desk/paper-trading/paper-trading-loop.ts` + `src/paper-trading/paper-exchange.ts` + `src/desk/execution/paper-position-tracker.ts` + `src/desk/execution/dry-run-position-tracker.ts` | DEFERRED |
| 16 | Portfolio | `agent/src/portfolio/` | `src/desk/risk/portfolio-allocator.ts` + `src/desk/risk/portfolio-correlation.ts` + `src/desk/risk/portfolio-rebalance-guard.ts` | ADAPT |
| 17 | Risk engine | `agent/src/quantlib/risk.py` | `src/desk/risk/risk-gate-manager.ts` + `src/desk/risk/value-at-risk.ts` + `src/desk/risk/position-manager.ts` + `src/risk/kelly-position-sizer.ts` | KEEP |
| 18 | Execution policy | `agent/src/live/enforcement.py` + `order_guard.py` | `src/desk/execution/execution-mode.ts` (literal env gate) + `src/desk/execution/live-order-manager.ts` + `src/desk/execution/cex-order-executor.ts` + `src/desk/sandbox/strategy-static-scanner.ts` | PORT |
| 19 | Reporting/attribution | `agent/src/quantlib/attribution.py` | `src/alpha-lab/attribution/` (alpha-evaluator, promotion-state-machine, survival-gate) + `src/alpha-lab/reports/` + `src/desk/cli/alpha-report-handler.ts` | ADAPT |
| 20 | Provenance / run cards (P16) | `agent/src/strategy_discovery/run_artifacts.py` | `src/alpha-lab/provenance/research-ledger.ts` + `src/alpha-lab/provenance/run-card.ts` + `src/alpha-lab/provenance/run-card-index.ts` + `src/alpha-lab/provenance/record-alpha-verdict.ts` | PORT |
| 21 | Regime engine (P10) | (no direct analog) | `src/alpha-lab/regimes/regime-engine.ts` + `src/alpha-lab/regimes/regime-series.ts` | PORT |
| 22 | Data quality (P4) | (implicit in loaders) | `src/desk/data/data-quality-gate.ts` + `src/desk/data/quality-metrics.ts` + `src/desk/data/candle-contracts.ts` + `src/desk/market-data/outlier-detection.ts` + `src/desk/market-data/gap-detector.ts` | PORT |
| 23 | Persistence | `agent/src/*/sqlite_store.py` | Postgres: `src/desk/db/postgres-client.ts` + `src/desk/data/ohlcv-store.ts` + `src/shared/db/migrations/` | ADAPT |
| 24 | Security | `agent/src/security/` | `src/platform/auth/` + `src/desk/sandbox/strategy-static-scanner.ts` + `scripts/ci-gate-paper-gate-lock.sh` + `src/forest/rate-limit/docs/encryption-boundary.md` | ADAPT |
| 25 | LLM provider routing | `agent/src/providers/llm.py` | none — research pipeline is deterministic TS, zero LLM-in-the-loop | REJECT |
| 26 | Observability | (none upstream) | `src/platform/middleware/prometheus-metrics.ts` + `src/utils/sentry-init.ts` + `src/desk/core/logger.ts` | KEEP |
| 27 | System doctor (P31) | `agent/src/preflight.py` | `src/desk/cli/system-doctor.ts` + `src/desk/cli/system-doctor-defaults.ts` (added S11, `cashclaw doctor`) | PORT |
| 28 | Cost stress modes | (no direct analog) | `src/alpha-lab/cost-model/cost-stress.ts` (EXTREME added S11, `listStressModes()` returns 4) | PORT |
| 29 | Final acceptance funding-rate (P32) | multi-asset engines | `src/desk/data/binance-funding-feed.ts` + `src/desk/data/funding-store.ts` + `src/db/migrations/049-funding-rates.ts` + `src/alpha-lab/configs/funding-mean-reversion-btc-8h.json` + `scripts/calibrate-funding.ts` (added S12: funding ingest → Postgres store → 8h backtest config) | PORT |
| 30 | Frontend | `frontend/` | `dashboard/` (existing CF Pages app) | REJECT |
| 31 | Desktop | `desktop/` | none | REJECT |
| 32 | Channels (messaging) | `agent/src/channels/` | existing Telegram bot flows | KEEP |
| 33 | CLI | `agent/cli/` | `src/desk/cli/cashclaw-cli.ts` + `src/desk/cli/alpha-commands.ts` + `src/commands/` | ADAPT |
| 34 | API server | `agent/api_server.py` | `src/api/routes/` + `src/app.ts` | KEEP |

## Corrections to prior mapping

`docs/vibe-trading-migration.md` previously cited 12 repo paths that do not exist (`src/agent`, `src/swarm`, `src/memory`, `src/alpha-lab/hypotheses`, `src/alpha-lab/discovery`, `src/alpha-lab/strategies`, `src/platform/security`, `src/platform/tools`, `src/desk/paper`, `src/desk/shadow`, `src/attribution`, `src/cli`). Those rows are corrected in S11 to the real paths in the table above (rows 5, 6, 7, 13, 14, 19, 24, 33).

## See also

- `CURRENT_ARCHITECTURE.md` — what this repo actually is
- `MIGRATION_STATUS.md` — per-phase done/deferred state
- `MIGRATION_PLAN.md` — remaining deltas and the no-wholesale-migration rule
