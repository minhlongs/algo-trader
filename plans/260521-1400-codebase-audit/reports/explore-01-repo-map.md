# CashClaw Algo-Trader Repository Audit
**Date**: 2026-05-21 | **Project**: @mekong/algo-trader v1.1.0 | **Type**: Modular algorithmic trading bot

---

## Top-Level Directory Inventory

| Path | TS/JS | Total | Purpose | Runtime Role | Confidence |
|------|-------|-------|---------|--------------|------------|
| `.claude` | 52 | 9144 | Claude Code workspace metadata, agent configs, hooks, skills | Config/Meta | High |
| `.github` | 0 | 4 | GitHub Actions CI/CD workflows | Config | High |
| `.mekong` | 0 | 1 | Mekong framework config file | Config | High |
| `.opencode` | 52 | 941 | OpenCode agent memory/context cache | Generated | High |
| `.wrangler` | 0 | 4 | Cloudflare Workers config | Config | High |
| `backups` | 0 | 2 | Database/state backups | Data | High |
| `config` | 0 | 3 | YAML/env configs (dry-run.yaml, launchd/) | Config | High |
| `dashboard` | 128 | 150 | React/Vue SPA frontend + standalone package (algo-trader-dashboard) | Source | High |
| `data` | 0 | 54 | SQLite databases, JSON data fixtures, blog assets | Data | High |
| `dist` | 1367 | 2190 | TypeScript compiled output (build artifact) | Build Artifact | High |
| `docker` | 0 | 13 | Dockerfile(s) + compose templates | Infra | High |
| `docs` | 0 | 80 | 50+ markdown docs (API, deployment, SOP runbooks, architecture) | Docs | High |
| `intelligence` | 0 | 10901 | Python FastAPI sidecar (alphaear); ML models, Kronos engine, FinBERT | Source/Infra | High |
| `logs` | 0 | 6 | Runtime log files | Generated | High |
| `plans` | 0 | 158 | Claude Code project plans, sprint notes, decision records | Docs/Meta | High |
| `scripts` | 5 | 23 | Build, deploy, validation, migration scripts (TypeScript + bash) | Source/Infra | High |
| `src` | 376 | 396 | Core application source (41 top-level modules) | Source | High |
| `tests` | 39 | 39 | Test suites (56 .test.ts across src/ + integration/strategy tests) | Test | High |

**Total Size**: ~430MB (dist: 13M, intelligence: 230M, .claude: 162M, src: 3.0M)

---

## Source Directory (`src/`) Detailed Breakdown

### Core Domain Modules (Primary Features)

| Module | TS/JS | Purpose | Key Files | Confidence |
|--------|-------|---------|-----------|------------|
| **strategies** | 49 | 45 specialized trading strategies (Polymarket focus) + GRU/Kronos ML | `polymarket/*.ts` (45 files), `GruStrategy.ts`, `kronos-strategy.ts`, `probability-calibrator.ts` | High |
| **arbitrage** | 35 | Opportunity detection + multi-leg execution (CLOB, neg-risk, binary) | `opportunity-detector.ts`, `executor.ts`, `binary-arbitrage-executor.ts`, `trading-loop.ts` | High |
| **api** | 33 | FastAPI gateway (REST + WebSocket), multi-exchange CCXT support | `index.ts`, `server.ts`, `ws-adapter-redis.ts` (cluster), routes/, middleware/ | High |
| **execution** | 18 | Order placement, TWAP, multi-leg Frank-Wolfe optimizer, path planning | `execution-path-planner.ts`, `twap-executor.ts`, `multi-leg-frank-wolfe-optimizer.ts`, `order-validator.ts` | High |
| **intelligence** | 17 | Signal fusion, vector embeddings, semantic search, Kronos client | `signal-fusion-engine.ts`, `signal-consensus-swarm.ts`, `vector-embedding-store.ts`, `alphaear-client.ts` | High |
| **billing** | 26 | Subscription/metering (RAAS), license gating, usage tracking | 26 files (full module) | Medium |
| **feeds** | 17 | Market data ingest (CCXT, exchange adapters, price feeds) | 17 files | Medium |
| **signal** | 14 | Signal generation, filtering, routing | 14 files | Medium |
| **polymarket** | 8 | Domain-specific market protocol integration | 8 files | Medium |
| **wiring** | 9 | Event orchestration (NATS), strategy bridge, drawdown monitor | `strategy-wiring.ts`, `nats-event-loop.ts`, `vibe-controller.ts`, `qwen-drawdown-monitor.ts` | High |
| **risk** | 9 | Drawdown, leverage, position limits, portfolio risk | 9 files | Medium |
| **jobs** | 9 | Background task scheduling (BullMQ, cron) | 9 files | Medium |
| **redis** | 9 | Redis cluster management, pub/sub, caching | 9 files | High |
| **raas** | 9 | RaaS (Robot-as-a-Service) platform API, licensing | 9 files | Medium |
| **middleware** | 8 | Auth, rate limiting, CORS, request validation | 8 files | High |
| **audit** | 8 | Trade audit logs, compliance tracking | 8 files | Medium |
| **db** | 7 | Database abstraction (SQLite, TimescaleDB, Cloudflare D1) | 7 TS + 5 migration files | High |

### Supporting Modules

| Module | TS/JS | Purpose | Key Files | Confidence |
|--------|-------|---------|-----------|------------|
| **resilience** | 6 | Circuit breakers, retry logic, bulkheads | 6 files | Medium |
| **gate** | 6 | Trading eligibility gates, risk filters | 6 files | Medium |
| **messaging** | 10 | Telegram bot, Discord, email integrations | 10 files | Medium |
| **notifications** | 5 | Event-driven notifications (WebSocket push) | 5 files | Medium |
| **ml** | 5 | ML pipeline infrastructure, embedding models | 5 files | Medium |
| **lib** | 5 | Shared utilities (math, crypto, normalization) | 5 files | High |
| **cli** | 1 | CLI entry point (cashclaw-cli.js) | `index.ts` | High |
| **auth** | 1 | JWT, OAuth handlers | `auth-server.ts` | High |
| **commands** | 5 | CLI subcommands | 5 files | Medium |
| **landing** | 2 | Public website/marketing pages | `landing-server.ts` + 12 static assets | Medium |
| **dashboard** | 9 | Admin dashboard backend routes (9 TS + HTML) | `dashboard-routes.ts`, `dashboard-server.ts`, `paper-trading-pnl-tracker.ts` | High |
| **workers** | 3 | Cloudflare Workers edge compute | `edge-proxy.ts`, `auth-handlers.ts`, `crypto-utils.ts` | Medium |
| **telegram** | 5 | Telegram bot integration | 5 files | Medium |
| **events** | 1 | Event bus (type defs) | 1 file | Low |
| **config** | 2 | Runtime config (environment-aware) | 2 files | High |
| **core** | 2 | Logging, type definitions | `logger.ts`, `types.ts` | High |
| **wallet** | 2 | Blockchain wallet integration (custody, signing) | 2 files | Medium |
| **persistence** | 1 | State persistence abstraction | 1 file | Low |
| **metering** | 1 | Usage metering (RAAS) | 1 file | Low |
| **interfaces** | 1 | Shared types/contracts | 1 file | Low |
| **data** | 1 | Data access layer | 1 file | Low |
| **ui** | 3 | React/UI components (3 TS + 2 config files, empty dir) | 3 files | Low |
| **types** | 4 | Type definitions (domain objects) | 4 files | High |
| **utils** | 4 | Utilities (formatting, validation, helpers) | 4 files | Medium |

### Entry Points & Root Files

| File | Purpose | Note |
|------|---------|------|
| `src/app.ts` | Main application bootstrap | Wires core modules |
| `src/index.test.ts`, `src/engine.test.ts` | Root-level test suites | 56 .test.ts total across repo |
| `src/engine.ts` | Strategy engine orchestrator | Qwen integration (phase 05) |

---

## Test Coverage Assessment

- **Test Files**: 56 .test.ts in src/ (vs 376 TS files = 14.9% inline test ratio)
- **Test Suites**: `/tests/` (6 dirs: integration, intelligence, lib, polymarket, resilience, strategies)
- **11 Skipped Tests**: Detected via `skip`/`pending` markers (potential debt)
- **Key Test Dirs**:
  - `tests/strategies/` (most comprehensive)
  - `tests/integration/` (Qwen e2e suite)
  - `tests/resilience/` (failure scenarios)

---

## Non-Source Directories

| Path | Count | Notes |
|------|-------|-------|
| `dashboard/` | 128 TS + config | Separate monorepo package (name: algo-trader-dashboard); uses pnpm |
| `intelligence/` (Python) | 10,901 files (230MB) | FastAPI sidecar; depends on mlx_lm, FinBERT; runs on port 8100 |
| `.claude/` | 9,144 files (162M) | Claude Code workspace memory; agent transcripts, indexed docs |
| `.opencode/` | 941 files | OpenCode cache |
| `docs/` | 80 files | 50+ markdown docs: API specs, SOPs, deployment, architecture guides |
| `scripts/` | 23 files | Build, migration, validation, monitoring (5 TS, 18 bash/shell) |

---

## Surprises & Anomalies

1. **Strategy Duplication Risk**: 45 polymarket strategies with near-identical structure (465–488 LOC each). No shared base class detected; suggests copy-paste pattern.
   
2. **Empty `ui/` Directory**: Listed as source, contains 3 TS files but no actual React components. Naming misleading.

3. **Separate Dashboard Package**: `dashboard/` is a standalone monorepo with own package.json + pnpm-lock.yaml. Not integrated into main build; separate CI target likely needed.

4. **Massive Intelligence Sidecar**: Python FastAPI (10,901 files, 230MB). Runs separately from main binary; model weights (DeepSeek R1, Nemotron Nano) not in repo.

5. **Unconfirmed Test Skips**: 11 tests marked skip/pending; no remediation tracked in git commit history.

6. **Polymarket-Heavy**: 45/49 strategies (~92%) are Polymarket-specific. Generic strategy infrastructure minimal.

7. **No Obvious Dead Code**: `git log` shows clean cleanup (e.g., "remove unrelated WIP strategy files"), but no TODOs or DEPRECATED markers found via grep.

8. **Config Fragmentation**: 3 separate config systems detected (`.claude/settings.json`, `wrangler.toml`, `ecosystem.config.cjs`, `docker-compose.yml`, `tsconfig.json`). No unified config schema.

9. **ML Model Embedding**: GRU + Kronos strategies exist, but actual model files (weights) stored in `intelligence/` Python sidecar, not TypeScript. Training/inference decoupled.

10. **CCXT Dependency Assumed**: API docs reference "multi-exchange via CCXT" but no explicit CCXT imports sampled; verify dependency chain.

---

## Open Questions

1. **Strategy Consolidation**: Do 45 Polymarket strategies share common logic? Should abstract base strategy pattern be introduced?

2. **Test Coverage Baseline**: What's target coverage %? Are skipped tests intentional tech debt or oversight?

3. **Dashboard Integration**: Is `dashboard/` decoupled intentionally (separate SPA)? Should share build artifacts (dist) with main package?

4. **Intelligence Model Lifecycle**: How are DeepSeek R1 + Nemotron weights managed? Version pinning, deployment strategy?

5. **Config Consolidation**: Should consolidate settings (.claude, env, YAML) into single source of truth?

6. **UI Directory Purpose**: Is `ui/` a placeholder for future refactoring? Should components be moved to React library or removed?

7. **Raas Module Scope**: 26-file billing/metering module—should be refactored into micro-service or kept monolith?

8. **NATS vs Redis**: Both event brokers used (wiring/, redis/)—unified event model or intentional separation?

9. **Execution Engine Complexity**: Frank-Wolfe optimizer + TWAP + multi-leg planner—backtest coverage adequate?

10. **Cloudflare Workers Deployment**: Are `workers/` files deployed separately or bundled into main binary?

---

## Build & Deployment Notes

- **Build Command**: `tsc` (standard TypeScript)
- **Incremental Build**: `tsc --incremental` supported
- **Dev Mode**: `tsc --watch` + vite for frontend (`dashboard/`)
- **CI**: GitHub Actions (4 files detected)
- **Runtime**: Node.js (main) + Python (intelligence sidecar) + Cloudflare Workers (edge)
- **Package Manager**: pnpm (lockfile present; npm fallback available)
- **Environment**: Docker supported (Dockerfile + compose), launchd (macOS), bare metal

---

## Key Files to Review First

1. `/src/app.ts` — Bootstrap order, module wiring
2. `/src/wiring/strategy-wiring.ts` — Strategy lifecycle + NATS bridge
3. `/src/strategies/kronos-strategy.ts` — ML integration model
4. `/src/api/server.ts` — API gateway entry point
5. `/src/execution/execution-path-planner.ts` — Order execution logic
6. `/src/dashboard/dashboard-server.ts` — Admin backend
7. `/intelligence/kronos_engine.py` — ML sidecar bootstrap
8. `/package.json` — Dependency tree, scripts
9. `/tsconfig.json` — Compiler settings, path aliases
10. `/docker-compose.yml` — Full stack topology

