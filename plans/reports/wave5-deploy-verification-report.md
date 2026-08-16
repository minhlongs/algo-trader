# Wave 5 Deploy Verification Report

- **Date:** 2026-08-16
- **Branch:** org/core-team-clean (commit 335fd9a6)
- **Status:** PASS with minor naming discrepancies

---

## Summary

Build and tests are clean. All 7 pre-deploy verification checks pass functionally.
Two minor naming discrepancies vs task spec: SSH secret is `SSH_PRIVATE_KEY` (not `VPS_SSH_KEY`), and the class is `MemoryRateLimiter` (not `MemoryFallback`). No blocking issues.

---

## Build / Test Status

| Gate | Command | Result |
|------|---------|--------|
| TypeScript Build | `pnpm run build` | PASS — 0 errors |
| Unit Tests | `pnpm test` | PASS — 461 files, 6694 tests, 0 failures, 15.59s |

---

## Pre-deploy Checks

### 1. ci-cd.yml no longer contains `deploy-vps` job
**PASS.** `grep -c "deploy-vps" .github/workflows/ci-cd.yml` returned 0. Job fully removed in commit 335fd9a6.

### 2. ci-cd.yml retains docker build + health-check gates and secrets
**PASS.**
- Docker build step: lines 46-66 (build-and-push with `docker/build-push-action`)
- Health-check job: lines 114-128 (verifies `CF_WORKER_DOMAIN /health`)
- Secrets referenced: `GITHUB_TOKEN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CF_WORKER_DOMAIN`

### 3. deploy.yml contains deploy-vps job and SSH secrets
**PASS.**
- `deploy-vps` job present with full VPS deploy pipeline
- Secrets used: `VPS_HOST` (line 16), `VPS_USER` (line 17), `SSH_PRIVATE_KEY` (line 123 via `webfactory/ssh-agent@v0.8.0`)
- SSH commands: `ssh -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_HOST}` (line 132)
- **Note:** SSH key secret named `SSH_PRIVATE_KEY`, not `VPS_SSH_KEY` as task spec assumed. Functionally equivalent.

### 4. Sentry init includes `release:` field
**PASS.**
- `src/utils/sentry-init.ts` line 14: `release: process.env.SENTRY_RELEASE || process.env.GIT_SHA || 'unknown'`
- `src/shared/utils/sentry-init.ts` line 13: `release: process.env.SENTRY_RELEASE || process.env.GIT_SHA || 'unknown'`

### 5. Backup script reference in deploy-production.sh
**PASS.** Line 156: `bash scripts/setup-backup-cron.sh` with error handling (non-critical failure path at line 159).

### 6. /ready endpoint exists
**PASS.** `src/platform/api/routes/health.ts` line 53: `healthRouter.get('/ready', async (_req: Request, res: Response) => {` -- returns `{ ready: true }` on success, `{ ready: false, reason }` on failure.

### 7. MemoryFallback MAX_ENTRIES and class methods
**PARTIAL PASS.**
- Class named `MemoryRateLimiter` (not `MemoryFallback`), in `src/shared/rate-limit/memory-fallback.ts`
- `MEMORY_FALLBACK_CONFIG` exported with `MAX_ENTRIES: 10_000` (line 23)
- Singleton exported: `memoryRateLimiter` (line 314)
- Public methods found:
  - `checkLimit(options)` -- equivalent of `check` + `set` combined
  - `getCount(userId, windowMs?)` -- line 164
  - `reset(userId)` -- line 180
  - `clearAll()` -- line 193
  - `getStats()` -- line 202, returns `{ entries, maxEntries, utilizationPercent }`
- **Missing standalone `get` and `set` methods** -- the combined `checkLimit` serves both roles. This is a naming/design difference, not a functional gap.

### 8. logger.error in circuit-breaker admin routes
**PASS.** 5 `logger.error` calls in `src/platform/api/routes/admin.ts`:
- Line 60: `[Admin] Halt trading failed`
- Line 90: `[Admin] Resume trading failed`
- Line 130: `[Admin] List circuit breakers failed`
- Line 150: `[Admin] Reset circuit breaker failed`
- Line 164: `[Admin] Reset all circuit breakers failed`

All 3 circuit-breaker routes (`/circuit-breakers`, `/circuit-breakers/:name/reset`, `/circuit-breakers/reset-all`) have `logger.error` in their catch blocks. Exceeds the "at least 3" requirement.

Note: `/admin/status` catch block (line 114) is missing `logger.error` but this is NOT a circuit-breaker route.

---

## Missing Items

| # | Item | Severity | Detail |
|---|------|----------|--------|
| 1 | SSH secret name mismatch | LOW | Task expected `VPS_SSH_KEY`; actual is `SSH_PRIVATE_KEY`. Functionally correct. |
| 2 | Class name mismatch | LOW | Task expected `MemoryFallback`; actual is `MemoryRateLimiter`. File is `memory-fallback.ts` so the module name matches. |
| 3 | No standalone `get`/`set` methods | LOW | `checkLimit` combines both. `getCount` provides read access. No functional gap. |
| 4 | `/admin/status` missing logger.error | LOW | Non-circuit-breaker route. 5 of 6 catch blocks have logger.error. |

---

## Next Actions

1. **Deploy-ready.** No blocking issues found.
2. Pre-fill GitHub secrets: `VPS_HOST`, `VPS_USER`, `SSH_PRIVATE_KEY`, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CF_WORKER_DOMAIN`.
3. Optional: add `logger.error` to `/admin/status` catch block for consistency.
4. Optional: rename `MemoryRateLimiter` to `MemoryFallback` if strict naming alignment desired (requires updating imports and tests).
