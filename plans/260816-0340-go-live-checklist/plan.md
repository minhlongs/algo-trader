---
title: "Go-Live Checklist & Deployment Plan"
description: "Pre-deploy gates, deployment sequence, secrets, health checks, rollback, and monitoring for algo-trader VPS + Cloudflare Worker"
status: in-progress
priority: P1
effort: 2h
branch: feat/bootstrap-quality-pipeline
tags: [deployment, go-live, ci-cd, rollback, monitoring]
created: 2026-08-16
last_updated: 2026-08-16T17:50:00Z
---

## Overview

Deploy algo-trader to production via two targets:
1. **Cloudflare Worker** (edge proxy, KV auth, caching) — deployed via GitHub Actions
2. **VPS Docker Stack** (API, Dashboard, Redis, NATS, PostgreSQL, Prometheus, Grafana) — deployed via SSH in CI

## Waves Completed (2026-08-16)

| Wave | Status | Deliverable |
|------|--------|-------------|
| **Wave 1: Resilience** | ✅ Complete | `GET /ready` probe (`src/platform/api/routes/health.ts`), LRU memory fallback (`src/shared/rate-limit/memory-fallback.ts`) |
| **Wave 2: Testing** | ✅ Complete | Chaos tests (15/15 green), load test baseline documented |
| **Wave 3: Audit** | ✅ Complete | Identified 3 blockers (circuit breaker API missing, Sentry CI gap, backup cron not in pipeline) |
| **Wave 4: Fixes** | ✅ Complete | Circuit breaker admin API, Sentry CI + source maps (873 .js.map), backup cron auto-install |
| **Wave 5: Deploy & Verify** | 🔄 Pending | Push to main, verify CI gates, CO to commit |

## Blockers Resolved

1. **Circuit breaker admin API** — 3 endpoints: `POST /admin/halt`, `POST /admin/resume`, `GET /admin/status` in `src/platform/api/routes/admin.ts`
2. **Sentry CI gap** — Source map upload added to `deploy.yml` and `ci-cd.yml` using `sentry-cli`; needs GitHub secrets: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`
3. **Backup cron missing** — Added to `scripts/deploy-production.sh` post-deploy (idempotent)

## Test/Build Status

- Build: `tsc` passes cleanly (all waves combined)
- Tests: 461 files / 6694 tests / 0 failures
- Lint: 487 warnings total (pre-existing noise in `tracing.ts`); our changes add 0 new warnings

---
<!-- Continue from original Section 1 onward... -->
1. **Pre-Deploy Checklist (All Must Be Green)**

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