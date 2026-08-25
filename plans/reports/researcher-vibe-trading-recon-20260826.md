# Researcher Report — Vibe-Trading Upstream Recon (B1A) + Gap Table (B1B)

> Increment S11 · branch `feat/vibe-audit-gap-closure` · read-only · 2026-08-26
> Work context: /Users/macbook/algo-trader · Upstream clone: /tmp/Vibe-Trading (fresh shallow clone, outside prod tree)

## Part A — B1A Upstream Recon

### License verification

`ls /tmp/Vibe-Trading/LICENSE` exits 0. Header quoted verbatim:

```
MIT License

Copyright (c) 2026 Vibe-Trading Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
```

**LICENSE = MIT.** Concept-level reuse is unencumbered; a NOTICE file also ships upstream.

### Upstream source layout (read from real code, not README)

Top level: `agent/` (Python package), `frontend/` (React/Vite), `desktop/` (Electron), `tools/`, `wiki/`, `scripts/`. The Python package entry points are `agent/api_server.py` (HTTP API) and `agent/mcp_server.py` (MCP server, self-documented as surfacing **74 tools**).

Key modules under `agent/src/` (all verified on disk):

| Module | What it does (1-line, from source headers) |
|---|---|
| `agent/src/agent/loop.py` | AgentLoop: ReAct core loop with 5-layer context management (microcompact → context_collapse → auto_compact → compact tool → iterative update); siblings: context.py, memory.py, skills.py, tools.py, trace.py, grounding.py |
| `agent/src/skills/` | **90 finance skills** (akshare, alpha-zoo, ccxt, candlestick, chanlun, yfinance, tushare, volatility, valuation-model, trade-journal, thesis-tracker, web-reader, stablecoin-flow, us-etf-flow, …) |
| `agent/mcp_server.py` + `agent/src/tools/mcp.py` | MCP layer: server exposes 74 tools; mcp.py is the MCP *client* adapter ("MCP client adapter and remote tool wrappers") |
| `agent/src/tools/` | ~50 tool wrappers (market_data_tool, portfolio_risk_tool, quantlib_tool, strategy_discovery_tool, swarm_tool, web_search_tool, ocr…) |
| `agent/src/swarm/` | Multi-agent swarm: models.py, presets/, runtime.py, serialization.py, store.py, task_store.py, worker.py |
| `agent/src/memory/` | Memory system: hierarchy.py, compression.py, persistent.py, semantic_links.py, search_index.py, lifecycle.py (SQLite-backed) |
| `agent/src/market_data.py` | "Shared market data helpers for MCP and local agent tools" — single-file routing/fetching |
| `agent/backtest/loaders/` | 40+ data loaders (akshare_loader, alphavantage_loader, baostock_loader, …) |
| `agent/backtest/engines/` | Multi-asset engines incl. china_a_share, korea_equity, options_portfolio, vietnam_equity, forex |
| `agent/backtest/validation.py` | "Statistical validation": Bootstrap Sharpe CI, Walk-Forward analysis, Monte Carlo permutation — auto-invoked by BaseEngine.run_backtest when config.validation present |
| `agent/src/factors/zoo/` | Alpha Zoo: academic/, alpha101/, fundamental/, gtja191/, qlib158/ factor families |
| `agent/src/factors/` | Factor infra: base.py, _backend.py, store.py, sqlite_store.py, metrics.py, bench_runner_strict.py |
| `agent/src/strategy_discovery/` | "Evidence-gated facade over Alpha Zoo + SDM": facade.py, evidence_harness.py, evidence_store.py, run_artifacts.py, guard.py — "never ships seed performance data… every number served comes from real backtest runs" |
| `agent/src/strategy_store/` | Strategy catalog persistence (sqlite_store.py) |
| `agent/src/shadow_account/` | Shadow-account reconciliation (backtester.py et al.) |
| `agent/src/portfolio/` | Portfolio service: service.py, store.py, risk_parity.py, turnover_aware.py |
| `agent/src/quantlib/` | Quant library: risk.py, crossvalidation.py, multipletesting.py, timeseries.py, attribution.py, eventstudy.py, factormodel.py, options.py, performance.py, var_backtest.py, credit.py, fixedincome.py, fundmath.py, impact.py, valuation/ |
| `agent/src/live/` | Live-trading enforcement: enforcement.py, order_guard.py, sdk_order_gate.py, halt.py, audit.py, classification.py, mandate/, advisory/, runtime/ (scheduler, runner, reconcile, flatten) |
| `agent/src/governance/` | ledger.py, manifest.py (governance ledger) |
| `agent/src/goal/` | Research goals: context.py, models.py, policy.py, store.py |
| `agent/src/hypotheses/` | Hypothesis registry (registry.py, cli_handlers.py) |
| `agent/src/scheduled_research/` | Scheduled research playbooks: playbooks/, executor.py, proposals.py, verdict.py, store.py |
| `agent/src/security/` | network.py, scanner.py, workspace_access.py, workspace_policy.py — fail-closed checks |
| `agent/src/providers/` | LLM routing: llm.py, llm_providers.json, chat.py, copilot_auth.py, content_filter.py, openai_codex.py, capabilities.py |
| `agent/src/api/` | HTTP routes: alpha_routes, attribution_routes, auth_routes, live_routes, options_routes, portfolio_routes, runs_routes, qveris_routes… |
| `agent/src/channels/` | 15+ messaging channels (discord, dingtalk, email, feishu, matrix, qq, msteams…) + bus/ + pairing/ |
| `agent/cli/` | Rich TUI CLI: commands/ (chat, goal, memory, research_playbook, session, show, slash_router, strategy_evidence, institutional/), ui/, components/ |
| `agent/src/preflight.py` | "Startup preflight checks for data sources and LLM provider… prints status table; non-critical failures warn, LLM failure blocks" — the upstream *system doctor* analog |
| `agent/src/session/` | Session persistence + search |
| `frontend/` | React SPA (pages/, stores/, i18n/) |
| `desktop/` | Electron wrapper |

## Part B — B1B Gap Table (repo reality vs MIGRATION_LOG.json vs 34 phases)

Method: seeded by plan §1 (scout-verified), extended. Every repo path below was re-checked on disk this session. Note: executor B3 diffs landed in the working tree DURING this recon — rows affected say so explicitly (`git status` shows cost-stress.ts, research-mcp-server.ts modified; system-doctor.ts untracked-new).

Verdicts: KEEP = existing equivalent sufficient; PORT = ported/upstream pattern adopted; ADAPT = adapted subset lives under different name; REJECT = not wanted; DEFERRED = consciously postponed with reason.

| # | Master-command domain | Upstream module | Repo equivalent (real path) | Verdict | Reason | Risk | Status |
|---|---|---|---|---|---|---|---|
| 1 | Architecture docs (P1) | wiki/ + README doctrine | `docs/architecture/` — contains ONLY `decisions/` (4 ADRs); 9 files absent; `git log --all -- docs/architecture/CURRENT_ARCHITECTURE.md` empty | ADAPT | MIGRATION_LOG S1 entry claims done — FALSE (aspirational). B2 creates 9 truthful audit docs | LOW | OPEN → docs-manager B2 |
| 2 | Research pipeline | `agent/src/scheduled_research/` + `goal/` + `hypotheses/` | `src/alpha-lab/run-experiment.ts` + `src/alpha-lab/experiments/experiment-engine.ts` + `src/alpha-lab/gates/gate-evaluator.ts` | ADAPT | Upstream is playbook/goal-driven agent research; repo is deterministic experiment engine with gates — different paradigm, same outcome | LOW | COVERED |
| 3 | Finance skills (90) | `agent/src/skills/*` | No skill dir; domain logic lives in `src/desk/markets/`, `src/desk/data/binance-feed.ts`, `src/desk/arbitrage/`, strategies | REJECT | Crypto+prediction-markets only; 90 CN/US-equity skills = dead code (matches MIGRATION_LOG deferred #2) | LOW | DEFERRED (standing) |
| 4 | MCP layer (74 tools) | `agent/mcp_server.py` + `agent/src/tools/mcp.py` | `src/platform/mcp/research-mcp-server.ts` (4 tools: list_experiments :79, get_run_card :95, get_alpha_report :111, get_backtest_summary :126) + `signal-mcp-server.ts` + `src/api/routes/mcp-routes.ts` | PORT | 4 high-value read-only tools shipped S5; 74-tool suite YAGNI-deferred. readOnlyHint annotations were ABSENT at recon start — executor added `annotations:{readOnlyHint:true}` ×4 (:84) mid-recon | LOW | GAP CLOSED (B3a in-flight) |
| 5 | Agents (ReAct loop) | `agent/src/agent/loop.py` (5-layer context mgmt) | `src/engine/` (core/, strategy-runner.ts, trade-executor.ts) + `src/agentic/*-agent.ts` + `src/wiring/qwen-signals-loop.ts` | KEEP | Repo runs deterministic TS pipelines, not an LLM ReAct loop; porting upstream loop would change product shape | MED | KEEP (do not port) |
| 6 | Swarm | `agent/src/swarm/` (worker, presets, task_store) | `src/intelligence/signal-consensus-swarm.ts` (+ desk mirror `src/desk/intelligence/`) | ADAPT | Consensus-swarm covers signal aggregation use case; generic worker-pool swarm not needed | LOW | COVERED |
| 7 | Memory | `agent/src/memory/` (hierarchy, compression, persistent) | No research-memory module; nearest: `src/shared/utils/memory-pool.ts` (infra, unrelated) + Postgres persistence | REJECT | Agent-conversation memory is N/A without ReAct loop; research provenance persisted via ledger instead | LOW | REJECT (paradigm mismatch) |
| 8 | Market-data routing | `agent/src/market_data.py` (single shared helper) | `src/desk/market-data/provider-failover.ts` (circuit breaker + SLA tracker) + `src/desk/data/binance-feed.ts:128 fetchBinanceHistory` + `src/desk/feeds/feed-aggregator.ts` + candle-contracts | ADAPT | No file named "router"; failover+aggregator+contracts cover routing functionally | LOW | COVERED (documented-as-adapted) |
| 9 | Alpha Zoo | `agent/src/factors/zoo/` (alpha101, gtja191, qlib158, academic, fundamental) | `src/alpha-lab/alpha-discovery/strategy-family-registry.ts` + `strategy-families.ts` + `src/alpha-lab/features/` | DEFERRED | Full factor zoo duplicates registry (YAGNI, MIGRATION_LOG deferred #5) | LOW | DEFERRED (keep deferral) |
| 10 | Factor research infra | `agent/src/factors/` (base, backend, store, metrics) | `src/alpha-lab/features/` feature pipeline | ADAPT | Feature computation exists scoped to shipped families | LOW | COVERED |
| 11 | Backtesting | `agent/backtest/engines/` (multi-asset) | `src/desk/backtesting/backtest-runner.ts` + `metrics-calculator.ts` + `gamma-historical-provider.ts`; alpha path: `src/alpha-lab/experiments/alpha-backtest-adapter.ts` | KEEP | Single crypto engine suffices; multi-asset engines dead code (deferred #1) | LOW | COVERED |
| 12 | Validation (MC/bootstrap/WF) | `agent/backtest/validation.py` | `src/alpha-lab/validation/monte-carlo-permutation.ts` + `bootstrap-sharpe.ts` (S3) + `src/alpha-lab/walkforward/walkforward-evaluator.ts` (S9 regimes-aware) | PORT | Ported in S3/S9; tests exist | LOW | DONE |
| 13 | Strategy discovery | `agent/src/strategy_discovery/` (evidence-gated facade, evidence_harness, run_artifacts, guard) | `src/alpha-lab/alpha-discovery/research-informed.ts` (S8: ranks families by verdict ledger) + `src/alpha-lab/provenance/verdict-summary.ts` | ADAPT | Evidence-gating principle implemented via verdict ledger instead of evidence_store | LOW | COVERED |
| 14 | Strategy store | `agent/src/strategy_store/sqlite_store.py` | `src/alpha-lab/configs/*.json` + `src/alpha-lab/provenance/run-card-index.ts` + family registry | ADAPT | Configs + indexed run cards serve catalog role | LOW | COVERED |
| 15 | Shadow account | `agent/src/shadow_account/` (reconciliation) | `src/desk/paper-trading/paper-trading-loop.ts` + `paper-trade-executor.ts` + `src/paper-trading/paper-exchange.ts` + `src/desk/execution/paper-position-tracker.ts` + `dry-run-position-tracker.ts` | PARTIAL→DEFERRED | Paper/shadow covered ~80%; broker-statement reconciliation needs real statement schema (deferred #3) | LOW | DEFERRED (keep) |
| 16 | Portfolio | `agent/src/portfolio/` (service, risk_parity, turnover_aware) | `src/desk/risk/portfolio-allocator.ts` + `portfolio-correlation.ts` + `portfolio-rebalance-guard.ts` + polymarket delta-neutral monitor; CashClaw sibling has 9-overlay engine (not ported here) | ADAPT | Allocator+correlation+rebalance guard cover current needs | LOW | COVERED |
| 17 | Risk engine | `agent/src/quantlib/risk.py` + `portfolio_risk_tool` | `src/desk/risk/risk-gate-manager.ts` + `value-at-risk.ts` + `position-manager.ts` + `src/risk/kelly-position-sizer.ts` | KEEP | VaR + gates + sizing exceed upstream single-file risk module for this scope | LOW | COVERED |
| 18 | Execution policy | `agent/src/live/enforcement.py` + `order_guard.py` + `sdk_order_gate.py` | `src/desk/execution/execution-mode.ts:48` (literal-string LIVE gate → READ_ONLY default) + `live-order-manager.ts` + `cex-order-executor.ts` + static scanner (S4) | PORT | Stronger than upstream: fail-closed literal env gate, 0 unguarded submit paths | HIGH if broken | DONE |
| 19 | Reporting/attribution | `agent/src/quantlib/attribution.py` + `api/attribution_routes.py` | `src/alpha-lab/attribution/` (alpha-evaluator, promotion-state-machine DRAFT→PAPER_APPROVED→LIVE_APPROVED, survival-gate) + `src/alpha-lab/reports/` + `src/desk/cli/alpha-report-handler.ts` | ADAPT | Promotion state machine replaces upstream attribution routes; paper-only policy | LOW | COVERED |
| 20 | Provenance / run cards (P16) | `agent/src/strategy_discovery/run_artifacts.py` | `src/alpha-lab/provenance/research-ledger.ts` (hash chain) + `run-card.ts` + `run-card-index.ts` + `record-alpha-verdict.ts` (S3+S7) | PORT | Shipped S3/S7; config-hash provenance invariant holds | LOW | DONE |
| 21 | Regime engine (P10) | (no direct upstream analog; quantlib/timeseries adjacent) | `src/alpha-lab/regimes/regime-engine.ts` + `regime-series.ts` (S9 wired into artifacts/walkforward) | PORT | Done S9; regimesPresent in artifacts verified | LOW | DONE |
| 22 | Data quality (P4) | (implicit in loaders) | `src/desk/data/data-quality-gate.ts` + `data-quality-types.ts` + `quality-metrics.ts` + `candle-contracts.ts` (S2) + `src/desk/market-data/outlier-detection*.ts` + `gap-detector.ts` | PORT | Exceeds upstream (upstream has no explicit gate module) | LOW | DONE |
| 23 | Persistence | `agent/src/*/sqlite_store.py` pattern | Postgres: `src/desk/db/postgres-client.ts` + `src/desk/data/ohlcv-store.ts` (storeCandle/bulkInsertCandles/getHistoricalData/getCandleCount) + `src/shared/db/migrations/` | ADAPT | SQLite-per-module replaced by central Postgres; fine | LOW | COVERED |
| 24 | Security | `agent/src/security/` (scanner, workspace_access/policy) + fail-closed doctrine | `src/platform/auth/` + `src/desk/sandbox/strategy-static-scanner.ts` + `scripts/ci-gate-paper-gate-lock.sh` (Gate 6) + `src/forest/rate-limit/docs/encryption-boundary.md` + secret-scan Gate 2 | ADAPT | Fail-closed preserved via CI gates + sandbox + literal env gate | MED | COVERED |
| 25 | LLM provider routing | `agent/src/providers/llm.py` + llm_providers.json + copilot_auth.py | NONE in repo (`grep -rln openrouter src --include=*.ts` empty; no ai-provider module) | REJECT | Repo research pipeline is deterministic TS with zero LLM-in-the-loop; upstream routes LLMs for its ReAct agent which we do not port (row 5) | LOW | REJECTED |
| 26 | Observability | (none dedicated upstream) | `src/platform/middleware/prometheus-metrics.ts` + `src/utils/sentry-init.ts` + `src/desk/core/logger.ts` | KEEP | Upstream has no Prometheus/Sentry; repo observability exceeds it | LOW | COVERED |
| 27 | System doctor (P31) | `agent/src/preflight.py` (startup connectivity table) | `src/alpha-lab/check-gates.ts` (gate table only); NO doctor cmd existed at recon start — executor created `src/desk/cli/system-doctor.ts` mid-recon (untracked) | PORT | Gap confirmed then closed by B3b; verify tests before merge | LOW | GAP CLOSING (B3b in-flight) [unverified final state] |
| 28 | Cost stress modes | (no direct upstream analog) | `src/alpha-lab/cost-model/cost-stress.ts` — NORMAL/CONSERVATIVE/ADVERSE at recon start; EXTREME added mid-recon (type union :17, `listStressModes()` :147 returns 4 modes) | PORT | Escrow G1 closure via B3c; matches sibling CashClaw precedent ≈100bps | LOW | GAP CLOSING (B3c in-flight) [unverified final state] |
| 29 | Final acceptance funding-rate (P32) | upstream multi-asset engines could host it | No funding/OI data source anywhere: `grep -rl fundingRate\|openInterest src/desk/data/` = EMPTY; `funding-rate-arb.ts` infers from order book only | BLOCKED | DERIV stays DEFERRED (escrow). Honest substitute: rsi-mean-reversion-btc-1h E2E with dataSource==="real" (plan B4) | MED (real-data availability) | BLOCKED (by design) |
| 30 | Frontend | `frontend/` React SPA | `dashboard/` (existing CF Pages app) | REJECT | Existing dashboard sufficient; do not replace (deferred #6) | LOW | REJECTED (standing) |
| 31 | Desktop | `desktop/` Electron | — | REJECT | No desktop product requirement | LOW | REJECTED (standing) |
| 32 | Channels (messaging) | `agent/src/channels/` (15+ platforms) | Existing Telegram bot flows (protected) | KEEP | Only Telegram needed; porting 15 channels adds surface | LOW | KEEP |
| 33 | CLI | `agent/cli/` (TUI, commands/, institutional/) | `src/desk/cli/cashclaw-cli.ts` + alpha-* handlers + `src/commands/` | ADAPT | Non-TUI command set covers research ops; doctor being added (B3b) | LOW | COVERED |
| 34 | API server | `agent/api_server.py` + `agent/src/api/*_routes.py` | `src/api/routes/*` + `src/app.ts` + CF Workers | KEEP | Existing API surface larger than needed; preserve contracts | LOW | COVERED |

## Key findings for docs-manager (B2/B5)

1. **S1 log entry is false** — confirmed independently: `docs/architecture/` has only `decisions/` (4 ADRs), zero architecture docs in tree or any git ref. B2 must create 9 docs; B5 must correct the log (`correctedBy: "S11"`).
2. **`docs/vibe-trading-migration.md` mapping table cites 12 repo paths that DO NOT EXIST**: `src/agent`, `src/swarm`, `src/memory`, `src/alpha-lab/hypotheses`, `src/alpha-lab/discovery`, `src/alpha-lab/strategies`, `src/platform/security`, `src/platform/tools`, `src/desk/paper`, `src/desk/shadow`, `src/attribution`, `src/cli`. Real equivalents found (rows 5–7, 13, 19, 24, 33 above). This doc needs row corrections in B5 step 2 — otherwise MODULE_MAPPING.md will inherit fiction.
3. **All spot-checked DONE claims verified true**: data-quality-gate, monte-carlo-permutation, bootstrap-sharpe, regime-engine(+series), execution-mode (:48 literal gate), promotion-state-machine, provider-failover, run-card, strategy-family-registry.
4. **Executor raced this recon**: B3a readOnlyHint (now 8 grep hits, 4 annotated entries), B3b system-doctor.ts (new file), B3c EXTREME mode (:17, :147) all appeared in working tree during recon. Final states marked `[unverified]` — tester must own them.
5. **Funding/OI absence re-confirmed** — DERIV DEFERRED stands; B4 substitute per plan.
6. Upstream `preflight.py` is the closest thing to P31 doctor (startup status table, fail-closed on critical deps) — good citation for VIBE_TRADING_ARCHITECTURE.md.

## Unresolved questions

- None blocking. Only open item: whether owner ratifies EXTREME preset values at PR review (plan §3 flags MED; revert trivial).
