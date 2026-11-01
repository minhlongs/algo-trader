---
title: "Rectify Cloudflare Infrastructure Identifiers in Go-Live & Polymarket Audit Deliverables"
description: "Synchronize Production/Staging D1 UUIDs, KV Namespace IDs, and Staging Worker URL in plans/reports/audit-261101-golive-poly/{01,04,09,10} with wrangler.toml and staging-manifest.json while maintaining Paper Edge Staging lock."
status: completed
priority: P1
effort: 0.5h
branch: docs/rectify-golive-poly-audit-identifiers
tags: [docs, audit, staging, polymarket, g1]
created: 2026-11-02
---

# Plan: Rectify Cloudflare Infrastructure Identifiers in Go-Live & Polymarket Audit Deliverables

## Context & Problem Statement

Following the merge of `S0–S2` (`PR #214`), `S3/G1` (`PR #216`), and `S4–S5` (`PR #218` at `eb04a19fa5f711671967a9fe491a2b15a5ccc552`), live verification against `wrangler.toml` and `staging-manifest.json` identified 6 lines across 4 audit report files (`01-system-map.md`, `04-saas-and-paper-readiness.md`, `09-open-core-and-packaging.md`, `10-executive-summary.md`) that retained draft UUIDs (`1f020fb2...`, `6e7b31a5...`, `c4ef0537...`, `3094f632...`) and a draft subdomain (`algo-trader-staging.minhlongs.workers.dev`) instead of the actual provisioned resources (`algo-trader-staging.agencyos-openclaw.workers.dev`, Production D1 `f29559f2-8e0b-461a-bd01-5665581beeee`, Production KV `6c7199c0259b42db943aa13b200d8ea1`, Staging D1 `943fd11e-c81a-4342-afa6-7e80aa7a18df`, Staging KV `1ef051223fde46629f0af6bf270e8315`).

## Scope Boundary & Non-Goals

- **In Scope:**
  - `plans/reports/audit-261101-golive-poly/01-system-map.md`
  - `plans/reports/audit-261101-golive-poly/04-saas-and-paper-readiness.md`
  - `plans/reports/audit-261101-golive-poly/09-open-core-and-packaging.md`
  - `plans/reports/audit-261101-golive-poly/10-executive-summary.md`
- **Out of Scope / Non-Goals:**
  - Do not modify any files in `src/`, `scripts/`, `tests/`, `wrangler.toml`, or `staging-manifest.json`.
  - Do not execute `#5, #9-PG` (PostgreSQL Host Staging) or unlock `G2/G3` (Shadow/Live Capital).
  - Do not touch production (`algo-trader` Worker or `m1pro-home`).

## Phases

| Phase | Name | Status | File Ownership |
|---|---|---|---|
| 1 | Rectify 4 Audit Report Files & Verify Zero Draft Identifiers | completed | `plans/reports/audit-261101-golive-poly/01-system-map.md`, `plans/reports/audit-261101-golive-poly/04-saas-and-paper-readiness.md`, `plans/reports/audit-261101-golive-poly/09-open-core-and-packaging.md`, `plans/reports/audit-261101-golive-poly/10-executive-summary.md` |

## Acceptance Criteria

1. `grep -rnE "minhlongs\.workers\.dev|c4ef0537|3094f632|1f020fb2|6e7b31a5|algo-trader-subscribers-staging" plans/reports/audit-261101-golive-poly/` returns `0` matches.
2. `01-system-map.md`, `04-saas-and-paper-readiness.md`, `09-open-core-and-packaging.md`, and `10-executive-summary.md` record the exact Production D1 (`f29559f2-8e0b-461a-bd01-5665581beeee`), Production KV (`6c7199c0259b42db943aa13b200d8ea1`), Staging Worker URL (`https://algo-trader-staging.agencyos-openclaw.workers.dev/api/health`), Staging D1 (`943fd11e-c81a-4342-afa6-7e80aa7a18df`, `algo-trader-staging`), and Staging KV (`1ef051223fde46629f0af6bf270e8315`).
3. `curl -sS https://algo-trader-staging.agencyos-openclaw.workers.dev/api/health` returns HTTP 200 with `"status":"ok","environment":"staging","readiness":{"d1":"ready","schema":"ready"}`.
4. All safety gates (`LIVE_TRADING_ENABLED` disabled, `routes = []` on `[env.staging]`, `#5/#9-PG` and `G2/G3` `BLOCKED`) remain intact.
