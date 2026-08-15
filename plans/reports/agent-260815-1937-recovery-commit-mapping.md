# Recovery Commit Mapping — 9 Lost Commits Analysis

**Date:** 2026-08-15
**Branch:** `recovery-9-lost-commits` (remote: `origin/recovery-9-lost-commits` on minhlongs/algo-trader)
**Author:** bootstrap (cashclaw-bootstrap@trade-bot.local), Aug 12–14 2026
**Context:** Force-push to minhlongs/main destroyed 9 commits. All 9 recovered via `git fsck --unreachable`.

## Architecture Divergence

Recovery commits target `src/worker.ts` (Cloudflare Worker / Hono-based).
Current main uses `src/platform/api/server.ts` (Express + Node.js).
Completely different architecture — cherry-pick produces only conflicts and dead code.

**All 9 features have equivalent or better implementations in main.**

## Commit → Current Main Equivalence Map

### 1. `aa913510` — wire authGuard middleware
**Recovery:** Added `authGuard()` import + `app.use('*', authGuard())` to `src/worker.ts`
**Main equivalent:** `src/platform/middleware/auth-middleware.ts` (JWT-based `authMiddleware`) + `src/platform/middleware/license-resolver.ts` (Bearer→License bridge) + `src/platform/middleware/require-admin-key.ts` (constant-time admin auth)
**Status:** ✅ Superseded by more robust 3-layer auth in main

### 2. `e71b484d` — scope authGuard to API routes only
**Recovery:** Moved `authGuard()` from `*` to `/api/bots`, `/api/killswitch`
**Main equivalent:** `setupMiddleware()` in `server.ts` applies `authMiddleware` globally before all routes; `/health` and `/metrics` are explicitly outside `/api` subtree and exempt
**Status:** ✅ Superseded — same scoping strategy, more granular

### 3. `0d6a4a16` — wildcard authGuard paths
**Recovery:** Changed `/api/bots` → `/api/bots/*`, `/api/killswitch` → `/api/killswitch/*` etc.
**Main equivalent:** `authMiddleware` runs before all route registration; wildcard is implicit
**Status:** ✅ Superseded — global middleware approach eliminates need for per-route paths

### 4. `26f664b4` — circuit-open guard in scheduler + orchestrator health
**Recovery:** Added circuit-open check in `src/forest/scheduler.ts`
**Main equivalent:** `src/desk/market-data/provider-failover.ts` (full circuit breaker pattern) + `src/platform/middleware/prometheus-metrics.ts` (circuit breaker state tracking with Prometheus gauge)
**Status:** ✅ Superseded — production circuit breaker with observability

### 5. `75550fce` — provider abstraction, circuit breaker, rate-limiter budget hooks
**Recovery:** OmniRoute Phase 1-6 provider abstraction layer
**Main equivalent:** `src/lib/llm-router.ts` (`assertOmniRouteConfig` + LLM routing abstraction) + `src/forest/rate-limit/redis-rate-limiter.ts` (tier-aware Redis rate limiting)
**Status:** ✅ Superseded — main has provider failover + tier-aware rate limiting

### 6. `e31be811` — OmniRoute Phase 4: StrategyChain
**Recovery:** Added `StrategyChain` to `src/land/bots/` + `src/tree/exchange/`
**Main equivalent:** `src/desk/wiring/augmented-signal-pipeline.ts` (full signal pipeline with AI validation)
**Status:** ✅ Superseded — pipeline architecture in main is more mature

### 7. `1937d5f3` — duplicate hydration guard fix
**Recovery:** Fixed `loadAllBotsFromD1` duplicate guard in `src/land/`
**Main equivalent:** `src/desk/cli/` handlers — CashClaw trade handlers with proper singleton guards
**Status:** ✅ Superseded — entire `src/land/` module was refactored out in main

### 8. `f8b14aac` — CashClaw D1 persistence + paper-only lockdown
**Recovery:** D1-backed persistence in `src/land/` + Paper mode restrictions
**Main equivalent:** `src/seed/db/d1-monitoring.ts` (D1 read-only monitoring) + `src/desk/trading-pipeline.ts` (`~/.cashclaw/` persistence) + Paper mode via `PAPER_MODE` env var throughout
**Status:** ✅ Superseded — different persistence layer (PostgreSQL + file-based), same functionality

### 9. `8f631da5` — OmniRoute excellence map (10 GAPs)
**Recovery:** Quality improvement checklist for OmniRoute subsystem
**Main equivalent:** Documentation/planning artifact; not code. Main's equivalent quality gates live in `docs/ai-first-enforcement-gates.md` + vitest coverage thresholds (80% lines/functions/branches)
**Status:** ✅ Superseded — quality enforcement is now automated via CI gates, not manual checklist

## Decision

**No cherry-pick applied.** All features already exist in main's architecture.
Recovery branch preserved at `origin/recovery-9-lost-commits` as historical reference.

## Notes

- Commit `9b8845b2` (bearer auth guard + version endpoint, base of recovery) was also excluded — version endpoint exists in `/health` response (`json.version`)
- Commit `bfe418b3` (baseline with .gitignore) — `.gitignore` already maintained in main
