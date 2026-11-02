# Phase 1: Fail-Closed Staging Preflight, Deploy `algo-trader-staging`, and Rectify Audit Deliverables

## Overview

Execute the fail-closed staging preflight check, deploy the latest `main` (`2512e432`) Worker build to `algo-trader-staging` (`routes = []`), verify `GET /api/v1/paper-trading/status` returns HTTP `200`, and rectify all stale draft file paths and missing PR provenance (`PR #222` `c726a401` and `PR #224` `2512e432`) across `plans/reports/audit-261101-golive-poly/`.

## Implementation Steps

1. **Run Fail-Closed Staging Preflight & Deploy `algo-trader-staging`:**
   - Run `DB_NAME=algo_trader_staging DB_HOST=localhost npx tsx scripts/staging-preflight-check.ts` and confirm exit code `0`.
   - Run `npx wrangler deploy --env staging --config wrangler.toml` and capture the new Worker Version ID.
   - Verify live staging read-only probes:
     - `GET https://algo-trader-staging.agencyos-openclaw.workers.dev/api/health` -> `200 OK`
     - `GET https://algo-trader-staging.agencyos-openclaw.workers.dev/api/v1/paper-trading/status` -> `200 OK`
     - `GET https://algo-trader-staging.agencyos-openclaw.workers.dev/api/v1/paper-trades` -> `200 OK`
2. **Rectify Stale File Paths Across 6 Audit Files (`00`, `01`, `02`, `03`, `05`, `11`):**
   - `scripts/verify-staging-preflight.ts` -> `scripts/staging-preflight-check.ts`
   - `src/platform/deployment/staging-preflight-validator.ts` & `src/platform/deployment/staging-manifest-guard.ts` -> `src/shared/preflight/staging-guard.ts`, `src/shared/preflight/staging-guard-types.ts`, `src/shared/preflight/staging-guard-wrangler.ts`
   - `src/platform/workers/edge-proxy-health.ts` -> `src/platform/workers/edge-proxy-health-handler.ts`
   - `config/staging-manifest.example.json` -> `staging-manifest.json`
3. **Update Provenance (`PR #222` & `PR #224`) Across 5 Audit Files (`00`, `04`, `05`, `10`, `11`):**
   - Record `PR #222` (`c726a401`, `Issue #221`) and `PR #224` (`2512e432`, `Issue #223`) plus the live `GET /api/v1/paper-trading/status` HTTP `200` verification and new Worker Version ID.
4. **Verification:**
   - Confirm `grep -rnE "verify-staging-preflight|staging-preflight-validator|staging-manifest-guard|edge-proxy-health\.ts|staging-manifest\.example" plans/reports/audit-261101-golive-poly/` returns `0` lines.
   - Confirm every backticked `src/` and `scripts/` path in `plans/reports/audit-261101-golive-poly/*.md` exists on disk.
