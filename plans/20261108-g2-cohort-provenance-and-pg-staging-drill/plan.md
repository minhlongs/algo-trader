# Plan: `G2-Poly-Shadow` Cohort Protection, Build-Time Provenance & Host PostgreSQL Staging Drill (`#5, #9-PG`)

- **Date:** 2026-11-08
- **Branch:** `feat/g2-cohort-provenance-and-pg-staging-drill`
- **Status:** completed
- **Route:** Bugfix + Hardening (`/ak-vibe --auto --ship`)

## 1. Objective & Scope

Execute the confirmed dual package (**Hạng mục A + Hạng mục B**) from the `audit-261101-golive-poly` handoff ledger:

1. **Hạng mục A (`G2-Poly-Shadow` Cohort Protection & Version Provenance Hardening):**
   - Protect `T0_G2 = 1794047000444` (`2026-11-07T09:03:20.444Z`) across periodic `PAPER` shadow probe invocations (`gapMs > MAX_RESTART_GAP_MS` of 15 minutes) by supporting `allowCohortContinuation` in `restoreReconcilerState` (`src/desk/polymarket/g2-shadow-telemetry.ts`) and `restoreOrchestratorState` (`src/desk/polymarket/live-trading-state-persistence.ts`) when `unexplainedDriftUsdc === 0` and `unknownOrderCount === 0`.
   - Emit an explicit `version_transition` telemetry event (`Version Transition Marker` per §2.5 of `08-live-readiness-and-canary.md`) into `~/.cashclaw/g2-poly-shadow-telemetry.jsonl` whenever `sourceCommitSha` or `srcTreeHash` advances between runs while preserving `startedAtMs` and zero accounting drift.
   - Harden `/api/version` (`src/platform/workers/api/version.ts`) and `getPaperTradingStatus` (`src/platform/workers/paper-trading-entry.ts`) with build-time / env provenance fallback (`BUILD_COMMIT_SHA`, `SRC_TREE_HASH`, `provenanceSource`) without redeploying `algo-trader-staging` during `G1-Soak` and without breaking existing `paper-trading-status-route.test.ts` assertions.

2. **Hạng mục B (Unblock `#5, #9-PG` / Risk `R-06` — Host PostgreSQL 15.17 Staging & Backup/Restore Drill):**
   - Fix the 3 empirically reproduced PostgreSQL 15.17 migration failures:
     - `src/db/migrations/041-audit-hash-chain.ts` (`42702: column reference "id" is ambiguous` in `payload` CTE)
     - `src/shared/db/migrations/056-add-kyc-verifications.ts` (`42883: function randomblob(integer) does not exist` on PostgreSQL)
     - `src/db/migrations/002-phase33-indexes.ts` (`42703: column "user_id" does not exist` on PostgreSQL vs SQLite mock)
   - Create and execute `scripts/drills/postgres-staging-drill.ts` (`<= 200` LOC) against local PostgreSQL 15.17 (`localhost:5432`, `algo_trader_staging` and `algo_trader_staging_restored`) verifying:
     - `scripts/staging-preflight-check.ts` PASS
     - All `51/51` migrations in `MIGRATIONS` apply cleanly (`0` errors)
     - Rollback (`rollbackLastMigration`) and re-apply (`runMigrations`) succeed cleanly
     - Representative SaaS + trading rows seeded across core tables, backed up via `pg_dump -Fc`, restored via `pg_restore` into `algo_trader_staging_restored`, and reconciled via symmetric `EXCEPT` (`0` row drift) with sub-second RTO and `RPO = 0 rows`.
   - Synchronize `plans/reports/audit-261101-golive-poly/00..11*.md` to mark `#5, #9-PG` and `R-06` as `VERIFIED` (`PASS`) and record the `G2-Poly-Shadow` Version Transition Marker and cohort continuation.

3. **Non-Goals / Hard Constraints (Hạng mục C):**
   - Zero mutations to `algo-trader-staging` Cloudflare Worker during `G1-Soak` (`startedAt = 1793536843401`).
   - Zero production host (`m1pro-home`) or production Worker (`algo-trader`) touches.
   - Gate `G3` remains strictly `BLOCKED` (`LIVE_TRADING_ENABLED=false` everywhere).
   - Quality Ratchet enforced: `anyTypes <= 0`, `consoleCalls <= 2`, `filesOverMaxLines <= 0` (`<= 200` LOC), `bannedImports == 0`, `eslintDisables <= 0`.

## 2. Files to Modify / Create

- `src/desk/polymarket/g2-shadow-telemetry.ts` (`<= 200` LOC)
- `src/desk/polymarket/live-trading-state-persistence.ts` (`<= 200` LOC)
- `src/desk/polymarket/live-trading-types.ts` (`<= 200` LOC)
- `src/desk/polymarket/live-trading-adapter-setup.ts` (`<= 200` LOC)
- `src/desk/polymarket/live-trading-orchestrator.ts` (`<= 200` LOC)
- `scripts/run-g2-poly-shadow-probe.ts` (`<= 200` LOC)
- `src/platform/workers/api/version.ts` (`<= 200` LOC)
- `src/platform/workers/paper-trading-entry.ts` (`<= 200` LOC)
- `src/db/migrations/041-audit-hash-chain.ts` (`<= 200` LOC)
- `src/shared/db/migrations/056-add-kyc-verifications.ts` (`<= 200` LOC)
- `src/db/migrations/002-phase33-indexes.ts` (`<= 200` LOC)
- `scripts/drills/postgres-staging-drill.ts` (`<= 200` LOC)
- `src/desk/polymarket/__tests__/g2-shadow-telemetry.test.ts` (`<= 200` LOC)
- `src/platform/workers/__tests__/version-provenance.test.ts` (`<= 200` LOC)
- `tests/unit/db/postgres-migrations-dialect.test.ts` (`<= 200` LOC)
- `plans/reports/audit-261101-golive-poly/00..11*.md`

## 3. Acceptance Criteria & Verification

1. `npx tsx scripts/run-g2-poly-shadow-probe.ts` preserves `startedAtMs === 1794047000444`, `unexplainedDriftUsdc === 0`, and records a `version_transition` entry in `~/.cashclaw/g2-poly-shadow-telemetry.jsonl`.
2. `npx tsx scripts/drills/postgres-staging-drill.ts` completes against PostgreSQL 15.17 (`localhost:5432`) with `51/51` migrations applied, rollback + re-apply verified, and `pg_dump`/`pg_restore` `RPO = 0 rows` (`totalDriftRows = 0`).
3. `npx tsc --noEmit`, targeted & suite Vitest tests, `npm run check:leaderboard`, and `node scripts/check-quality-baseline.mjs` all pass with 0 errors.
