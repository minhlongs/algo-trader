# Vibe-Trading → CashClaw / ZEN Alpha Factory — Migration Map

Internal doc (EN). Machine-readable companion: `MIGRATION_LOG.json` at repo root.

## Principle

> AI proposes. Research validates. Risk disposes. Execution obeys only approved policy.

Upstream reference: `https://github.com/HKUDS/Vibe-Trading` (Python). This repo (`https://github.com/minhlongs/algo-trader`) is the target. **No wholesale fork.** Concepts ported; working CashClaw functionality is preserved. Backwards compatibility is maintained wherever practical.

## Mapping

| Upstream module | Current equivalent | Decision | Why |
|---|---|---|---|
| `agent/src/core` (agent runtime) | `src/agent/` + `src/wiring/` | **KEEP** | Existing agent runtime is sufficient; upstream is Python, repo is TypeScript/Bun |
| `agent/src/swarm` | `src/swarm/` | **KEEP** | Swarm orchestration already implemented |
| `agent/src/memory` | `src/memory/` | **KEEP** | Memory system exists |
| `agent/src/hypotheses` | `src/alpha-lab/hypotheses/` | **ADAPT** | Renamed to alpha-lab namespace for provenance |
| `agent/src/strategy_discovery` | `src/alpha-lab/discovery/` | **ADAPT** | Discovery pipeline integrated into alpha-lab |
| `agent/src/strategy_store` | `src/alpha-lab/strategies/` | **KEEP** | Strategy registry already present |
| `agent/src/quantlib` | `src/alpha-lab/` | **ADAPT** | Quant research folded into alpha-lab |
| `agent/src/providers` | `src/desk/data/` | **ADAPT** | Market-data provider abstraction built here (S2) |
| `agent/src/security` | `src/platform/security/` | **KEEP** | Security model already defined |
| `agent/src/tools` | `src/platform/tools/` | **KEEP** | Tool surface exists |
| `agent/mcp_server.py` | `src/platform/mcp/` | **PORT (S5)** | 4 read-only research tools; full 74-tool suite deferred (YAGNI) |
| `agent/skills/ccxt` | `src/desk/markets/cex/` | **KEEP** | CCXT integration already present |
| `agent/skills/shadow-account` | `src/desk/paper/` + `src/desk/shadow/` | **PARTIAL** | Paper executor + dry-run position tracker cover ~80%; broker-statement reconciliation deferred (needs real statement schema) |
| `agent/skills/performance-attribution` | `src/attribution/` | **KEEP** | Attribution exists |
| `agent/skills/thesis-tracker` | `src/alpha-lab/` | **ADAPT** | Thesis tracking in alpha-lab |
| `agent/skills/quant-statistics` | `src/alpha-lab/validation/` | **PORT (S3)** | Monte Carlo permutation + bootstrap Sharpe CI |
| `agent/backtest/` | `src/desk/backtesting/` | **KEEP** | Backtest engine exists |
| `agent/cli/` | `src/cli/` | **KEEP** | CLI exists |
| `agent/api_server.py` | `src/api/` | **KEEP** | API server exists |
| `agent/scripts/` | `scripts/` | **KEEP** | Deploy/verification scripts exist |
| `tools/ci_env_var_gate.py` | `scripts/ci-env-var-gate.*` | **PORT** | CI env-var gate pattern adopted |
| `frontend/` | `frontend/` | **REJECT** | Existing dashboard sufficient; do not replace |
| `desktop/` | — | **REJECT** | No desktop product requirement |
| `docker-compose.yml` | `Dockerfile` | **KEEP** | Existing Docker setup preserved |
| `wiki/` | `docs/` | **ADAPT** | Documentation consolidated into `docs/` |

## Deferred (with reason)

- **Multi-asset backtest engines** (china A-share, forex, india, korea, options): repo is crypto + prediction markets only; porting = dead code.
- **40+ data loaders** (akshare, tushare, eastmoney, yfinance): only Binance/CCXT needed; each loader adds secret surface + maintenance.
- **Full 74-tool MCP suite**: S5 delivered 4 high-value read-only tools; more tools only when a real consumer exists.
- **Full factor zoo** (`factors/zoo`): alpha-lab features + strategy-families already form the foundation; porting the zoo duplicates the registry.
- **Shadow account reconciliation**: needs a real broker-statement schema — no demand yet.
- **MASTER COMMAND phases 5–34**: multiple sessions; `MIGRATION_LOG.json` marks deferred with reason.

## What was shipped (S1–S6)

| Stage | Deliverable | Tests |
|---|---|---|
| S1 | Recon + architecture freeze; `docs/architecture/` | n/a |
| S2 | Data quality gate + candle contracts | data-quality-gate + candle-contracts suites |
| S3 | Provenance ledger, run cards, run-card index, statistical validation (Monte Carlo, bootstrap) | provenance + validation suites |
| S4 | Execution safety: single execution-mode gate, static strategy scanner, 4 live-submit paths enumerated, 0 unguarded | execution-mode + strategy-static-scanner suites |
| S5 | Research MCP server (4 read-only tools, PRO tier gate) + JSON-RPC routes | 36 new tests |
| S6 | `MIGRATION_LOG.json` + this doc | n/a |

**Full suite: 7080/7081 passing** (1 pre-existing failure in `security-integration.test.ts`, confirmed on clean baseline).

## Invariants preserved

- `LIVE_TRADING_ENABLED === 'true'` is a literal-string env gate; no code path sets it. Live trading stays opt-in only.
- All research results carry provenance (ledger hash chain + run-card config hash).
- Performance claims distinguish IS / OOS / PAPER / LIVE via the `ResultClass` discriminated union.
- Generated strategy code runs inside the sandbox boundary (static scanner + WASM sandbox).
- No API keys, tokens, or credentials in code or commits.