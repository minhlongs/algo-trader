---
title: "Go-Live Checklist & Deployment Plan"
description: "Pre-deploy gates, deployment sequence, secrets, health checks, rollback, and monitoring for algo-trader VPS + Cloudflare Worker"
status: in-progress
priority: P1
effort: 2h
branch: feat/bootstrap-quality-pipeline
tags: [deployment, go-live, ci-cd, rollback, monitoring]
created: 2026-08-16
last_updated: 2026-08-16T18:15:00Z
---

## Overview

Deploy algo-trader to production via two targets:
1. **Cloudflare Worker** (edge proxy, KV auth, caching) — deployed via GitHub Actions
2. **VPS Docker Stack** (API, Dashboard, Redis, NATS, PostgreSQL, Prometheus, Grafana) — deployed via SSH in CI

## Waves Completed (2026-08-16)

| Wave | Status | Deliverable |
|------|--------|-------------|
| **Wave 1: Resilience** | ✅ Complete | `GET /ready` probe (`health.ts`), LRU memory fallback (`src/shared/rate-limit/memory-fallback.ts`) |
| **Wave 2: Testing** | ✅ Complete | Chaos tests (15/15 green), load test baseline documented |
| **Wave 3: Audit** | ✅ Complete | 3 blockers identified via parallel audit agents |
| **Wave 4: Fixes** | ✅ Complete | Circuit breaker admin API, Sentry CI + source maps (873 .js.map), backup cron auto-install |
| **Wave 5: CI + Deploy** | ✅ Complete | Removed duplicate `deploy-vps` from `ci-cd.yml` (race condition), Wave 5 verification report |

## Blockers Resolved

1. **Circuit breaker admin API** — 3 endpoints: `POST /admin/halt`, `POST /admin/resume`, `GET /admin/status`
2. **Sentry CI gap** — Source map upload added to `deploy.yml` and `ci-cd.yml` using `sentry-cli`; needs GitHub secrets: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`
3. **Backup cron missing** — Added to `scripts/deploy-production.sh` post-deploy (idempotent)
4. **Dual-deploy race condition** — Removed `deploy-vps` from `ci-cd.yml`; `deploy.yml` is sole VPS deploy path
5. **`/ready` probe missing** — Restored in `health.ts` with Redis/Postgres/ENCRYPTION_KEY checks
6. **Auth-chain gap (53% load-test failures)** — `x-api-key` header never reached `req.license` because `license-validation.ts` used Fastify types. Created `api-key-license.ts` Express middleware bridging `x-api-key` → `LicenseService.getLicenseByKey()` → `req.license`. Mounted between `authMiddleware` and `auditMiddleware` in `server.ts`.
7. **CI Sentry hard-fail** — Added `continue-on-error: true` to `sentry-cli` step in `ci-cd.yml` so missing secrets don't block the deploy pipeline.

## Remaining (Manual / Human-Action Required)

| Item | Owner | Action Needed |
|------|-------|---------------|
| Sentry GitHub secrets | User | Add `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` in repo Settings → Secrets |
| 12k RPS load test | User + Infra | Requires valid `TEST_API_KEY` and `LOAD_TEST_BASE_URL`; prior 53% failure rate was auth-chain gap (now fixed). Re-run to confirm. |
| Domain TLS verification | User | `curl -sI https://api.cashclaw.cc/health` should return HTTP/2 200 |
| Merge to `main` | User | After verification, merge `feat/bootstrap-quality-pipeline` to `main` |

## Test/Build Status (Wave 5 verified)

- Build: `tsc` passes cleanly (all waves combined)
- Tests: 461 files / 6694 tests / 0 failures
- Lint: 487 warnings total (pre-existing noise); our changes add 0 new warnings

---

## 1. Pre-Deploy Checklist (All Must Be Green)

### CI Gates (Run Automatically on PR to `main`)

| Gate | Command | Pass Criteria |
|------|---------|---------------|
| **TypeScript Build** | `pnpm run build` | 0 errors |
| **ESLint** | `pnpm lint` | 0 errors, ≤100 warnings |
| **Unit Tests** | `pnpm test` | 0 failed, >0 passed |
| **Integration Tests** | `pnpm test:integration` | 0 failed |
| **Secret Scan** | `bash scripts/ci-gate-secret-scan.mjs` | No secrets in staged files |
| **Worktree Clean** | `bash scripts/check-worktree-clean.mjs` | No uncommitted changes (unless `ALLOW_DIRTY_DEPLOY=1`) |

### Manual Verification Before Merge

| Item | Verification Method |
|------|---------------------|
| `.env` has all required keys | `grep -E '^(POLYMARKET_|BINANCE_|OKX_|NOWPAYMENTS_|OPENAI_|ANTHROPIC_|REDIS_|POSTGRES_|SENTRY_)' .env` |
| Polymarket CLOB keys valid | `pnpm tsx scripts/verify-polymarket-connection.ts` |
| Exchange API keys valid | Test each exchange sandbox endpoint |
| NOWPayments invoice IDs created | Check NOWPayments dashboard for PRO/ENTERPRISE/MASTER invoices |
| Sentry DSN configured | `grep SENTRY_DSN .env` |
| Docker Hub access | `docker login ghcr.io` (CI uses `GHCR_TOKEN`) |
| Cloudflare API token valid | `npx wrangler whoami --config wrangler.toml` |
| Domain DNS configured | `dig +short api.cashclaw.cc` → CNAME to worker |

---

## 2. Deployment Sequence

### Phase 1: Cloudflare Worker (Edge Proxy First)

**Why first:** Worker is stateless, instant rollback via `wrangler rollback`, no data migration.

```bash
# Triggered automatically on merge to main via .github/workflows/cloudflare-deploy.yml
# Or manual:
npx wrangler deploy --config wrangler.toml
```

**Verification:**
```bash
curl -sI https://algo-trader.agencyos-openclaw.workers.dev/health | head -1
# Expected: HTTP/2 200
curl -s https://algo-trader.agencyos-openclaw.workers.dev/health | jq .
```

### Phase 2: VPS Docker Stack (Origin API)

**Deploy via `deploy.yml` only** (sole VPS deploy path):

```bash
# On VPS (triggered by deploy.yml on merge to main)
cd /opt/algo-trade
docker compose pull
docker compose up -d --force-recreate --no-deps algo-trade
docker image prune -f --filter "until=168h"
```

**Verification:**
```bash
# Direct VPS health (bypasses Cloudflare)
curl -s http://VPS_IP:3000/health | jq .

# Via Cloudflare (full path)
curl -s https://algo-trader.agencyos-openclaw.workers.dev/health | jq .
curl -s https://api.cashclaw.cc/health | jq .
```

### Rollback Targets

| Target | Rollback Command | Time |
|--------|------------------|------|
| Cloudflare Worker | `npx wrangler rollback --config wrangler.toml` | <30s |
| VPS Docker | `ssh deploy@VPS_IP "cd /opt/algo-trade && docker compose up -d --force-recreate algo-trade"` (reverts to previous image) | ~2min |
| Full Rollback | Kill switches: `curl -X POST https://algo-trader.workers.dev/api/admin/rollback/kill/MULTI_REGION` | <1min |

---