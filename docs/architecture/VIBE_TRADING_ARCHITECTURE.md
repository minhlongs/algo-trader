# VIBE_TRADING_ARCHITECTURE — upstream reference system

> Increment S11 · audited 2026-08-26 from a real clone at `/tmp/Vibe-Trading` (outside prod tree).
> Evidence: `plans/reports/researcher-vibe-trading-recon-20260826.md` Part A.
> Upstream: `https://github.com/HKUDS/Vibe-Trading` — Python, MIT-licensed.

## License

MIT, verified on disk (`/tmp/Vibe-Trading/LICENSE` exists; header quoted verbatim in the recon report, copyright "2026 Vibe-Trading Contributors"). Concept-level reuse only — no upstream source copied into `src/`.

## What upstream is

An LLM-agent-driven trading research platform: a Python ReAct agent (`agent/src/agent/loop.py`) with 5-layer context management, ~90 finance skills, a 74-tool MCP server, multi-agent swarm, SQLite-backed memory, multi-asset backtest engines, and React/Electron frontends.

## Key subsystems (verified on disk)

| Subsystem | Upstream path | Notes |
|---|---|---|
| Agent core | `agent/src/agent/loop.py` | ReAct loop; context.py, memory.py, skills.py, tools.py, trace.py |
| Skills | `agent/src/skills/` | ~90 finance skills (akshare, alpha-zoo, ccxt, chanlun, yfinance, …) |
| MCP server | `agent/mcp_server.py` | 74 tools; client adapter `agent/src/tools/mcp.py` |
| Tool wrappers | `agent/src/tools/` | ~50 wrappers (market_data, portfolio_risk, quantlib, strategy_discovery, swarm, web_search) |
| Swarm | `agent/src/swarm/` | worker.py, runtime.py, presets/, task_store.py |
| Memory | `agent/src/memory/` | hierarchy, compression, persistent, search_index (SQLite) |
| Market data | `agent/src/market_data.py` | single shared helper for MCP + local tools |
| Backtest loaders | `agent/backtest/loaders/` | 40+ loaders (akshare, alphavantage, baostock, …) |
| Backtest engines | `agent/backtest/engines/` | china_a_share, korea_equity, options_portfolio, vietnam_equity, forex |
| Validation | `agent/backtest/validation.py` | Bootstrap Sharpe CI, walk-forward, Monte Carlo permutation |
| Factor zoo | `agent/src/factors/zoo/` | alpha101, gtja191, qlib158, academic, fundamental |
| Strategy discovery | `agent/src/strategy_discovery/` | evidence-gated facade; "every number served comes from real backtest runs" |
| Shadow account | `agent/src/shadow_account/` | reconciliation backtester |
| Portfolio | `agent/src/portfolio/` | service, risk_parity, turnover_aware |
| Quantlib | `agent/src/quantlib/` | risk, attribution, eventstudy, factormodel, options, var_backtest |
| Live enforcement | `agent/src/live/` | enforcement.py, order_guard.py, sdk_order_gate.py, halt.py |
| Governance | `agent/src/governance/` | ledger.py, manifest.py |
| Security | `agent/src/security/` | network.py, scanner.py, workspace_access/policy — fail-closed |
| LLM providers | `agent/src/providers/` | llm.py routing, copilot_auth.py, content_filter.py |
| API | `agent/src/api/` + `agent/api_server.py` | HTTP routes per domain |
| Channels | `agent/src/channels/` | 15+ messaging platforms |
| CLI | `agent/cli/` | Rich TUI with commands/ |
| Preflight | `agent/src/preflight.py` | startup status table; LLM failure blocks — the system-doctor analog |
| Frontend | `frontend/` | React SPA |
| Desktop | `desktop/` | Electron wrapper |

## Doctrinal overlap with this repo

Upstream and this repo share three principles, implemented differently:

1. **Evidence-gating** — upstream: `strategy_discovery` evidence store; here: verdict ledger (`src/alpha-lab/provenance/record-alpha-verdict.ts`).
2. **Fail-closed execution** — upstream: `agent/src/live/enforcement.py`; here: literal env gate (`src/desk/execution/execution-mode.ts`) + CI paper-gate-lock.
3. **Statistical validation** — upstream: `agent/backtest/validation.py`; here: ported in S3 (`src/alpha-lab/validation/`).

## What we deliberately do NOT take

- ReAct LLM loop + memory + 90 skills + LLM provider routing (paradigm mismatch — this repo is deterministic TS).
- Multi-asset engines + 40+ loaders (crypto + prediction markets only).
- 74-tool MCP suite (4 read-only tools suffice; YAGNI).
- React frontend + Electron desktop (existing `dashboard/`).

Full per-module decisions: `MODULE_MAPPING.md`.
