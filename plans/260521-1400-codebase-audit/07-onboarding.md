# Onboarding — Reading Order for a New Engineer

Goal: get a fresh engineer to a working mental model in **one focused day**, then enough to ship safely in **one week**.

> Treat `docs/` (75+ existing files) as *background reference*, not authoritative. Verify against code.

---

## Day 1 (4 hours) — Big picture

| Step | Read | Time | Why |
|------|------|------|-----|
| 1 | `plans/260521-1400-codebase-audit/00-executive-summary.md` | 10m | What this repo is. |
| 2 | `plans/260521-1400-codebase-audit/06-glossary.md` | 15m | Tribal vocabulary (CashClaw, AlphaEar, Kronos, RaaS tiers, drawdown tiers). |
| 3 | `plans/260521-1400-codebase-audit/01-repo-map.md` | 20m | Where everything lives. |
| 4 | `plans/260521-1400-codebase-audit/02-architecture.md` | 40m | Entrypoints + request flow + event bus + dep graph. |
| 5 | `plans/260521-1400-codebase-audit/04-deployment-topology.md` | 20m | Runtime targets (Worker / Pages / VPS Docker / M1 launchd). |
| 6 | `plans/260521-1400-codebase-audit/05-risks-and-gaps.md` | 30m | Land mines. Read before touching anything. |
| 7 | `README.md` | 20m | Marketing copy + endpoint list (pricing claims are stale — see R-10). |
| 8 | `src/trading-pipeline.ts` (full file, ~100 LOC) | 15m | Core invariant: `recordTradeOutcome()` is the single orchestration point. |
| 9 | `src/app.ts` + `src/index.ts` | 20m | How the app boots. |
| 10 | `src/workers/edge-proxy.ts` | 25m | What the edge does vs proxies. |

---

## Day 2–3 — Subsystem deep dives

Pick the subsystem you'll touch and read in this order:

### If you're working on trading logic
1. `03-subsystems/trading-pipeline.md`
2. `src/trading-pipeline.ts`
3. `src/risk/kelly-position-sizer.ts` + `src/risk/tiered-drawdown-breaker.ts`
4. `src/execution/twap-executor.ts` + `src/execution/order-executor.ts` (⚠ note: `placeOrder` is mock, R-01)
5. `src/wiring/strategy-wiring.ts:72-101` (strategy registry)
6. One strategy from the registry to see the contract

### If you're working on RaaS/billing/auth
1. `03-subsystems/raas-billing-auth.md`
2. `src/auth/auth-server.ts`
3. `src/billing/license-service.ts` + `subscription-service.ts` + `payment-service.ts`
4. `src/billing/nowpayments-service.ts` + `src/api/routes/webhooks/nowpayments-webhook.ts`
5. `src/billing/dunning-service.ts` + `src/jobs/dunning-kv-sync.ts`
6. `src/middleware/feature-gate.ts` (⚠ note: manual per-route, R-05)
7. `docs/LICENSE_GATING.md`

### If you're working on intelligence / signals
1. `03-subsystems/intelligence.md`
2. `intelligence/server.py` (Python sidecar)
3. `src/intelligence/` (TS client + semantic graph)
4. `src/signals/` (publisher + dedup + SSE)
5. `src/paper-trading-orchestrator.ts` (⚠ note: string-match gate, R-03)
6. `src/kronos-fair-value.ts` (orphan client, R-18)

### If you're working on feeds / arbitrage
1. `03-subsystems/feeds-and-venues.md`
2. `src/messaging/topic-schema.ts` (event bus contract)
3. `src/feeds/feed-aggregator.ts`
4. `src/polymarket/clob-client.ts` vs `clob-v2-adapter.ts` (⚠ R-06)
5. One arbitrage cluster: `src/arbitrage/split-merge-arb-executor.ts` (easiest to grok)
6. `src/wiring/strategy-wiring.ts`

### If you're working on infrastructure
1. `03-subsystems/infrastructure.md`
2. `wrangler.toml` + `dashboard/wrangler.toml`
3. `docker-compose.yml` + `Dockerfile`
4. `ecosystem.config.cjs`
5. `scripts/sync-sqlite-to-d1.ts`
6. launchd plists (note R-11 broken template path)

### If you're working on frontend
1. `03-subsystems/frontend.md`
2. `dashboard/src/main.tsx` + `App.tsx` (routing)
3. `dashboard/src/stores/auth-store.ts` + `lib/auth-client.ts`
4. `dashboard/src/lib/api-client.ts`
5. `dashboard/functions/api/stats.ts` (CF Pages Function reading D1)
6. `src/dashboard/dashboard-server.ts` (NOT a duplicate — backend API for SPA)

---

## Week 1 — Hands-on

| Day | Activity |
|-----|----------|
| 4 | Run paper trading locally: `cashclaw paper --capital 200`. Inspect `data/paper-trades.json`. |
| 4 | Boot full stack via `docker-compose up`. Hit `:3000/api/health`. |
| 5 | Read 1 random strategy + trace its NATS topic subscription end-to-end. |
| 5 | Read 1 webhook handler (`nowpayments-webhook.ts`) end-to-end. |
| 6 | Tail audit JSONL: `tail -f ~/.cashclaw/trades.jsonl` during paper run. |
| 6 | Spin up Vite dev: `cd dashboard && npm run dev`. Log in, walk the routes. |
| 7 | Skim `tests/` to learn the testing conventions (vitest unit + playwright E2E + k6 load). |

---

## Don't break these (cribbed from `05-risks-and-gaps.md`)

1. Never bypass `pipeline.recordTradeOutcome()` — wallet+drawdown+audit invariant.
2. Never trust signal source string for paper-only routing — fix R-03 if extending.
3. Never deploy without setting `BETTER_AUTH_SECRET` / `JWT_SECRET`.
4. Never add a billing service that lives only in memory — use PG.
5. Never add a new route without `requireTier()` — `requireFeature()` if feature-flagged.
6. Never directly write to `~/.cashclaw/trades.jsonl` — go through `ImmutableTradeAudit`.

---

## Reference

- Raw subagent reports for traceability: `plans/260521-1400-codebase-audit/reports/explore-01..07-*.md`
- Audit charter: `plans/260521-1400-codebase-audit/plan.md`
- Repo HEAD at audit: `f344fc9`
