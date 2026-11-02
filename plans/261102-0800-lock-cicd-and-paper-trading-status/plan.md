---
title: "Lock CI/CD Auto-Mutation Gates and Expose Read-Only Paper Trading Status Telemetry"
description: "Gate docker and health-check jobs in .github/workflows/ci-cd.yml behind opt-in variables with paths-ignore for markdown/plans/docs, and implement read-only GET /api/v1/paper-trading/status on Cloudflare Worker."
status: completed
priority: P1
effort: 1h
branch: feat/lock-cicd-and-paper-trading-status
tags: [ci-cd, worker, paper-trading, telemetry, g1, g2]
created: 2026-11-02
---

# Plan: Lock CI/CD Auto-Mutation Gates and Expose Read-Only Paper Trading Status Telemetry

## Context & Problem Statement

1. **Unconditional CI/CD Push Side Effects (`.github/workflows/ci-cd.yml`):** Every push to `main` currently triggers the `docker` job (building and pushing `:latest`/`:sha` images to GHCR and uploading Sentry sourcemaps) and the `health-check` job (probing `CF_WORKER_DOMAIN`) because their condition is only `if: github.event_name == 'push'`, whereas `deploy-worker` is gated by `vars.WORKER_AUTO_DEPLOY == 'true'`. Furthermore, doc-only commits (`plans/**`, `docs/**`, `**.md`) trigger the workflow unnecessarily, requiring manual `gh run cancel` interventions to preserve the `NO Production Mutation` boundary.
2. **Missing Paper Trading Status Endpoint (`GET /api/v1/paper-trading/status`):** `src/platform/workers/edge-proxy.ts` exposes `POST /api/v1/paper-trading/tick` and `GET /api/v1/paper-trades`, but `GET /api/v1/paper-trading/status` falls through to `notImplementedResponse(path)` (`501`). A purely read-only status endpoint reading from `env.CACHE` (`STATE_KEY = 'paper-trading-loop-state'`) and computing metrics via `buildLoopStatus` is needed for passive G2 shadow monitoring without triggering ticks or mutating KV/D1.

## Scope Boundary & Non-Goals

- **In Scope:**
  - `.github/workflows/ci-cd.yml`
  - `src/desk/paper-trading/paper-trading-types.ts`
  - `src/desk/paper-trading/paper-trading-metrics.ts`
  - `src/platform/workers/paper-trading-entry.ts`
  - `src/platform/workers/edge-proxy-inline-routes.ts`
  - `src/platform/workers/edge-proxy.ts`
  - `src/platform/workers/__tests__/edge-proxy-health-route.test.ts`
  - `src/platform/workers/__tests__/paper-trading-status-route.test.ts`
- **Out of Scope / Non-Goals:**
  - Do not modify `wrangler.toml`, `staging-manifest.json`, or Polymarket live execution modules.
  - Do not execute `#5, #9-PG` (PostgreSQL Host Staging) or unlock `G2/G3` (Shadow/Live Capital).
  - Do not touch production (`algo-trader` Worker or `m1pro-home`).

## Phases

| Phase | Name | Status | File Ownership |
|---|---|---|---|
| 1 | Lock CI/CD Gates & Implement Read-Only Paper Trading Status | completed | `.github/workflows/ci-cd.yml`, `src/desk/paper-trading/paper-trading-types.ts`, `src/desk/paper-trading/paper-trading-metrics.ts`, `src/platform/workers/paper-trading-entry.ts`, `src/platform/workers/edge-proxy-inline-routes.ts`, `src/platform/workers/edge-proxy.ts`, `src/platform/workers/__tests__/edge-proxy-health-route.test.ts`, `src/platform/workers/__tests__/paper-trading-status-route.test.ts` |

## Acceptance Criteria

1. `.github/workflows/ci-cd.yml` includes `workflow_dispatch`, `paths-ignore: ['plans/**', 'docs/**', '**.md']` on `push` and `pull_request`, gates `docker` behind `github.event_name == 'push' && vars.DOCKER_AUTO_PUSH == 'true'`, sets `deploy-worker.needs: test`, and gates `health-check` behind `github.event_name == 'push' && vars.WORKER_AUTO_DEPLOY == 'true'`.
2. `GET /api/v1/paper-trading/status` in `src/platform/workers/edge-proxy.ts` returns HTTP `200` with `{ ok: true, enabled, killed, state: { isRunning, running, openTrades, closedTrades, totalTrades, totalPnl, totalPnlUsd, winRate, startTime, startedAt, uptimeMs }, tradeCounter }` and performs zero writes to KV or D1.
3. Every touched source and test file stays `<= 200 LOC` and `node scripts/check-quality-baseline.mjs --quality` exits `0`.
4. All unit tests in `src/platform/workers/__tests__/paper-trading-status-route.test.ts` and `src/platform/workers/__tests__/edge-proxy-health-route.test.ts` pass 100%.
