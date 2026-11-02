---
title: "Rectify Stale Audit File Paths, Update Provenance (PR #222 & PR #224), and Deploy algo-trader-staging"
description: "Fix stale draft file paths across plans/reports/audit-261101-golive-poly/, record PR #222 (c726a401) and PR #224 (2512e432), and deploy algo-trader-staging after fail-closed preflight so GET /api/v1/paper-trading/status returns 200 OK."
status: completed
priority: P1
effort: 30m
branch: docs/rectify-audit-paths-and-staging-status
tags: [audit, docs, staging, paper-trading, telemetry, g1, g2]
created: 2026-11-02
---

# Plan: Rectify Stale Audit File Paths, Update Provenance (PR #222 & PR #224), and Deploy `algo-trader-staging`

## Context & Problem Statement

1. **Stale Draft File Paths & Missing Provenance in `plans/reports/audit-261101-golive-poly/`:**
   - Six audit report files (`00-scope-and-inventory.md`, `01-system-map.md`, `02-verification-matrix.md`, `03-risk-register.md`, `05-change-log.md`, `11-handoff.md`) still cite draft filenames that do not exist on `main` (`scripts/verify-staging-preflight.ts`, `src/platform/deployment/staging-preflight-validator.ts`, `src/platform/deployment/staging-manifest-guard.ts`, `src/platform/workers/edge-proxy-health.ts`, `config/staging-manifest.example.json`) instead of the committed files (`scripts/staging-preflight-check.ts`, `src/shared/preflight/staging-guard.ts`, `src/shared/preflight/staging-guard-types.ts`, `src/shared/preflight/staging-guard-wrangler.ts`, `src/platform/workers/edge-proxy-health-handler.ts`, `staging-manifest.json`).
   - Five audit report files (`00-scope-and-inventory.md`, `04-saas-and-paper-readiness.md`, `05-change-log.md`, `10-executive-summary.md`, `11-handoff.md`) stop at `PR #220` and do not yet record `PR #222` (`c726a401`, `Issue #221`) or `PR #224` (`2512e432`, `Issue #223`).
2. **Live Staging Worker Drift (`algo-trader-staging`):**
   - `algo-trader-staging` (`https://algo-trader-staging.agencyos-openclaw.workers.dev`) is still running version `183ef8eb-e1c5-4d7d-aec3-e55402744edb` deployed before `PR #224`, so `GET /api/v1/paper-trading/status` currently returns HTTP `501` instead of HTTP `200`.

## Scope Boundary & Non-Goals

- **In Scope:**
  - `plans/reports/audit-261101-golive-poly/00-scope-and-inventory.md`
  - `plans/reports/audit-261101-golive-poly/01-system-map.md`
  - `plans/reports/audit-261101-golive-poly/02-verification-matrix.md`
  - `plans/reports/audit-261101-golive-poly/03-risk-register.md`
  - `plans/reports/audit-261101-golive-poly/04-saas-and-paper-readiness.md`
  - `plans/reports/audit-261101-golive-poly/05-change-log.md`
  - `plans/reports/audit-261101-golive-poly/10-executive-summary.md`
  - `plans/reports/audit-261101-golive-poly/11-handoff.md`
  - Fail-closed preflight and staging Worker deployment (`--env staging --config wrangler.toml`) to `algo-trader-staging`.
- **Out of Scope / Non-Goals:**
  - Do not modify `wrangler.toml`, `staging-manifest.json`, `.github/workflows/ci-cd.yml`, or any TypeScript file under `src/`, `scripts/`, or `tests/`.
  - Do not touch or deploy to production (`algo-trader` Worker, `api.cashclaw.cc`, or `m1pro-home`).
  - Do not unlock Gates `G2`/`G3` or execute `#5, #9-PG` (PostgreSQL Host Staging).

## Phases

| Phase | Name | Status | File Ownership |
|---|---|---|---|
| 1 | Fail-Closed Staging Preflight, Deploy `algo-trader-staging`, and Rectify Audit Deliverables | completed | `plans/reports/audit-261101-golive-poly/{00,01,02,03,04,05,10,11}*.md` |

## Acceptance Criteria

1. `DB_NAME=algo_trader_staging DB_HOST=localhost npx tsx scripts/staging-preflight-check.ts` exits `0`.
2. `npx wrangler deploy --env staging --config wrangler.toml` succeeds on `algo-trader-staging` (`routes = []`), and `curl -sS https://algo-trader-staging.agencyos-openclaw.workers.dev/api/v1/paper-trading/status` returns HTTP `200` with JSON `{ "ok": true, "enabled": true, "killed": false, "state": { ... }, "tradeCounter": ... }`.
3. `grep -rnE "verify-staging-preflight|staging-preflight-validator|staging-manifest-guard|edge-proxy-health\.ts|staging-manifest\.example" plans/reports/audit-261101-golive-poly/` returns `0` matches.
4. `plans/reports/audit-261101-golive-poly/{00,04,05,10,11}*.md` accurately record `PR #222` (`c726a401`, `Issue #221`) and `PR #224` (`2512e432`, `Issue #223`) along with the verified live `GET /api/v1/paper-trading/status` HTTP `200` response.
5. Every file path referenced in `plans/reports/audit-261101-golive-poly/*.md` exists on `main`, and the documentation PR merges cleanly into `main` with 100% green CI checks.
