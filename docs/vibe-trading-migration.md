# Vibe-Trading → CashClaw / ZEN Alpha Factory — Migration Map

Internal doc (EN). Machine-readable companion: `MIGRATION_LOG.json` at repo root.

## Principle

> AI proposes. Research validates. Risk disposes. Execution obeys only approved policy.

Upstream reference: `https://github.com/HKUDS/Vibe-Trading` (Python). This repo (`https://github.com/minhlongs/algo-trader`) is the target. **No wholesale fork.** Concepts ported; working CashClaw functionality is preserved. Backwards compatibility is maintained wherever practical.

## Mapping

> **S11 correction (2026-08-26):** the prior version of this table cited 12 repo paths that do not exist (`src/agent`, `src/swarm`, `src/memory`, `src/alpha-lab/hypotheses`, `src/alpha-lab/discovery`, `src/alpha-lab/strategies`, `src/platform/security`, `src/platform/tools`, `src/desk/paper`, `src/desk/shadow`, `src/attribution`, `src/cli`). Every row below now cites a real, on-disk path. Full audited table: `docs/architecture/MODULE_MAPPING.md` §"Audit 2026-08-26".

| Upstream module | Current equivalent (real path) | Decision | Why |
|---|---|---|---|
| `agent/src/core` (agent runtime) | `src/engine/` (strategy-runner.ts, trade-executor.ts) + `src/agentic/` + `src/wiring/qwen-signals-loop.ts` | **KEEP** | Deterministic TS pipelines; upstream ReAct loop not ported |
| `agent/src/swarm` | `src/intelligence/signal-consensus-swarm.ts` (+ `src/desk/intelligence/`) | **ADAPT** | Consensus swarm covers signal aggregation; generic worker pool not needed |
| `agent/src/memory` | none — provenance via `src/alpha-lab/provenance/research-ledger.ts` | **REJECT** | Agent-conversation memory N/A without ReAct loop; ledger covers research memory |
| `agent/src/hypotheses` | `src/alpha-lab/run-experiment.ts` + `src/alpha-lab/experiments/experiment-engine.ts` | **ADAPT** | Hypothesis → deterministic experiment engine with gates |
| `agent/src/strategy_discovery` | `src/alpha-lab/alpha-discovery/research-informed.ts` + `src/alpha-lab/provenance/verdict-summary.ts` | **ADAPT** | Evidence-gating via verdict ledger instead of evidence_store |
| `agent/src/strategy_store` | `src/alpha-lab/configs/*.json` + `src/alpha-lab/provenance/run-card-index.ts` + family registry | **ADAPT** | Configs + indexed run cards serve the catalog role |
| `agent/src/quantlib` | `src/alpha-lab/` (validation, regimes, cost-model, attribution) | **ADAPT** | Quant research folded into alpha-lab |
| `agent/src/providers` | `src/desk/data/binance-feed.ts` + `src/desk/market-data/provider-failover.ts` | **ADAPT** | Market-data provider abstraction built here (S2) |
| `agent/src/security` | `src/platform/auth/` + `src/desk/sandbox/strategy-static-scanner.ts` + `scripts/ci-gate-paper-gate-lock.sh` | **ADAPT** | Fail-closed via CI gates + sandbox + literal env gate |
| `agent/src/tools` | `src/platform/mcp/` | **ADAPT** | Tool surface = MCP servers |
| `agent/mcp_server.py` | `src/platform/mcp/research-mcp-server.ts` + `src/api/routes/mcp-routes.ts` | **PORT (S5, S11)** | 4 read-only research tools; S11 added `annotations:{readOnlyHint:true}` to all 4; full 74-tool suite deferred (YAGNI) |
| `agent/skills/ccxt` | `src/desk/markets/cex/` | **KEEP** | CCXT integration already present |
| `agent/skills/shadow-account` | `src/desk/paper-trading/paper-trading-loop.ts` + `src/desk/execution/paper-position-tracker.ts` + `src/desk/execution/dry-run-position-tracker.ts` | **PARTIAL** | Paper executor + dry-run tracker cover ~80%; broker-statement reconciliation deferred (needs real statement schema) |
| `agent/skills/performance-attribution` | `src/alpha-lab/attribution/` (alpha-evaluator, promotion-state-machine, survival-gate) | **ADAPT** | Promotion state machine replaces upstream attribution routes |
| `agent/skills/thesis-tracker` | `src/alpha-lab/` | **ADAPT** | Thesis tracking in alpha-lab |
| `agent/skills/quant-statistics` | `src/alpha-lab/validation/` | **PORT (S3)** | Monte Carlo permutation + bootstrap Sharpe CI |
| `agent/backtest/` | `src/desk/backtesting/backtest-runner.ts` + `src/alpha-lab/experiments/alpha-backtest-adapter.ts` | **KEEP** | Backtest engine exists |
| `agent/cli/` | `src/desk/cli/cashclaw-cli.ts` + `src/desk/cli/alpha-commands.ts` | **ADAPT** | Non-TUI command set; `doctor` added S11 |
| `agent/api_server.py` | `src/api/routes/` + `src/app.ts` | **KEEP** | API server exists |
| `agent/scripts/` | `scripts/` | **KEEP** | Deploy/verification scripts exist |
| `agent/src/preflight.py` (system doctor) | `src/desk/cli/system-doctor.ts` + `src/desk/cli/system-doctor-defaults.ts` | **PORT (S11)** | `cashclaw doctor` — 5 labelled checks, exit 0 only if no FAIL |
| (cost stress modes) | `src/alpha-lab/cost-model/cost-stress.ts` | **PORT (S11)** | EXTREME preset added; `listStressModes()` returns NORMAL/CONSERVATIVE/ADVERSE/EXTREME |
| `tools/ci_env_var_gate.py` | `scripts/ci-gate-paper-gate-lock.sh` + `scripts/ci-gate-secret-scan.mjs` | **ADAPT** | No direct port; env/secret discipline enforced by Gate 2 (secret scan) + Gate 6 (live-eligibility marker never assigned). Prior "ci-env-var-gate" citation was fictional — corrected S11 |
| `frontend/` | `dashboard/` | **REJECT** | Existing dashboard sufficient; do not replace |
| `desktop/` | — | **REJECT** | No desktop product requirement |
| `docker-compose.yml` | `Dockerfile` | **KEEP** | Existing Docker setup preserved |
| `wiki/` | `docs/` + `docs/architecture/` | **ADAPT** | Documentation consolidated into `docs/`; 9 architecture docs created S11 |

## Deferred (with reason)

- **Multi-asset backtest engines** (china A-share, forex, india, korea, options): repo is crypto + prediction markets only; porting = dead code.
- **40+ data loaders** (akshare, tushare, eastmoney, yfinance): only Binance/CCXT needed; each loader adds secret surface + maintenance.
- **Full 74-tool MCP suite**: S5 delivered 4 high-value read-only tools; more tools only when a real consumer exists.
- **Full factor zoo** (`factors/zoo`): alpha-lab features + strategy-families already form the foundation; porting the zoo duplicates the registry.
- **Shadow account reconciliation**: needs a real broker-statement schema — no demand yet.
- **MASTER COMMAND phases 5–34**: multiple sessions; `MIGRATION_LOG.json` marks deferred with reason.

## What was shipped (S1–S11)

| Stage | Deliverable | Tests |
|---|---|---|
| S1 | Recon + architecture freeze (docs were NOT created here — see correction below) | n/a |
| S2 | Data quality gate + candle contracts | data-quality-gate + candle-contracts suites |
| S3 | Provenance ledger, run cards, run-card index, statistical validation (Monte Carlo, bootstrap) | provenance + validation suites |
| S4 | Execution safety: single execution-mode gate, static strategy scanner, 4 live-submit paths enumerated, 0 unguarded | execution-mode + strategy-static-scanner suites |
| S5 | Research MCP server (4 read-only tools, PRO tier gate) + JSON-RPC routes | 36 new tests |
| S6 | `MIGRATION_LOG.json` + this doc | n/a |
| S7 | Research feedback loop (verdict recording) | 10 new tests; alpha-lab 274/274 |
| S8 | Research-informed prioritization (families ranked by verdict ledger) | 16 new tests; alpha-lab 290/290 |
| S9 | Regime-aware research artifacts (regimesPresent in artifacts/walkforward) | 7 new tests; targeted 27/27 |
| S10 | Alpha gap-closure (E7/F2 closed; G1 carried) | full suite green |
| S11 | Master-command audit: 9 architecture docs, MCP `readOnlyHint` ×4, `cashclaw doctor`, EXTREME stress mode | baseline 7132 + new MCP/doctor/cost-stress suites |

**S1 correction (S11):** the S1 log entry claimed 9 `docs/architecture/*.md` files were created — they never existed until S11 (verified absent from tree and all git history). `MIGRATION_LOG.json` now carries `correctedBy: "S11"` on the S1 entry.

**Full suite baseline: 7132/7132** before S11 additions; final S11 count owned by tester.

## Invariants preserved

- `LIVE_TRADING_ENABLED === 'true'` is a literal-string env gate; no code path sets it. Live trading stays opt-in only.
- All research results carry provenance (ledger hash chain + run-card config hash).
- Performance claims distinguish IS / OOS / PAPER / LIVE via the `ResultClass` discriminated union.
- Generated strategy code runs inside the sandbox boundary (static scanner + WASM sandbox).
- No API keys, tokens, or credentials in code or commits.