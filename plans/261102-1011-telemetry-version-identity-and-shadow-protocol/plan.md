---
title: "Paper Trading Telemetry Version Identity Envelope, Closed-Trade D1 Fields & 30-Day Shadow Protocol"
description: "Add timestamp + versionIdentity envelope to GET /api/v1/paper-trading/status, expose exitPrice + closedAt on GET /api/v1/paper-trades, and record SHA provenance proof (1222ce87 vs 1fa01ca4 vs 2512e432 vs c842756f) and Two-Tier 30-Day Shadow Protocol across audit deliverables 04, 08, and 11."
status: completed
priority: P1
effort: 30m
branch: feat/telemetry-version-identity-and-shadow-protocol
tags: [telemetry, paper-trading, provenance, shadow-protocol, audit, g1, g2]
created: 2026-11-02
---

# Plan: Paper Trading Telemetry Version Identity Envelope, Closed-Trade D1 Fields & 30-Day Shadow Protocol

## Context & Problem Statement

1. **Telemetry Identity Envelope (`GET /api/v1/paper-trading/status`):**
   - Requirement 2 of the go-live audit mandates that new paper-trading telemetry snapshots carry an explicit `timestamp` and `versionIdentity` envelope so every sampled snapshot is self-identifying and auditable during the 30-day shadow window without relying solely on external wrapper metadata.
   - `getPaperTradingStatus` (`src/platform/workers/paper-trading-entry.ts`) currently returns `{ ok: true, enabled, killed, state, tradeCounter }` without `timestamp` or `versionIdentity`.
2. **Closed-Trade Audit Fields (`GET /api/v1/paper-trades`):**
   - `handlePaperTradesLedger` (`src/platform/workers/edge-proxy-inline-routes.ts`) queries `paper_trades_v3` for `id, market_id AS tokenId, side, size_usd AS size, entry_price AS price, pnl, strategy, source, created_at AS timestamp` and omits `exit_price` (`exitPrice`) and `closed_at` (`closedAt`), which are persisted by `PaperTradingLoop` (`src/desk/paper-trading/paper-trading-persistence.ts:44-50`) and needed to verify per-trade closure fee ($0.10) and realized PnL formulas directly from the API.
3. **Provenance Reconciliation (`1222ce87` vs `1fa01ca4` vs `2512e432` vs `c842756f`) & Two-Tier 30-Day Shadow Protocol (`04`, `08`, `11`):**
   - Audit reports `04-saas-and-paper-readiness.md`, `08-live-readiness-and-canary.md`, and `11-handoff.md` have been updated with the mathematical proof of Worker version `1222ce87-907a-402d-87d6-10cb8172be4f` vs static `COMMIT_SHA` `1fa01ca4b89eea4b88e335cdbf0e928da65c1142` vs `2512e432` and `c842756f`, the full `killed=false` KV/D1 zero-drift reconciliation across 63 trades (`SUM(pnl) = -5.193679`), and the complete Two-Tier 30-Day Shadow Protocol (`G1-Soak` vs `G2-Poly-Shadow`).

## Scope Boundary & Non-Goals

- **In Scope:**
  - `src/platform/workers/paper-trading-entry.ts`: Add `timestamp` (ISO-8601 UTC string) and `versionIdentity` (`commitSha`, `shortSha`, `deployedAt`, `deployBranch`, `environment`) to `getPaperTradingStatus(kv, env)` and export `PaperTradingVersionIdentity`.
  - `src/platform/workers/edge-proxy-inline-routes.ts`: Add `exit_price` (`exitPrice: number | null`) and `closed_at` (`closedAt: string | null`) to `handlePaperTradesLedger`.
  - `src/platform/workers/__tests__/paper-trading-status-route.test.ts` and `src/platform/workers/__tests__/edge-proxy-health-route.test.ts`: Add unit test assertions for `timestamp`, `versionIdentity`, `exitPrice`, and `closedAt`.
  - `plans/reports/audit-261101-golive-poly/04-saas-and-paper-readiness.md`, `08-live-readiness-and-canary.md`, and `11-handoff.md`: Synchronize documentation of the newly implemented `timestamp`/`versionIdentity` and `exitPrice`/`closedAt` fields alongside the provenance proof and 30-day shadow protocol.
- **Out of Scope / Non-Goals:**
  - Do not mutate remote staging or production Cloudflare Workers, secrets, D1, or KV during the active `G1-Soak` run unless explicitly authorized with a logged Version Transition Marker.
  - Do not enable `LIVE_TRADING_ENABLED`, signing, allowances, or transfers.
  - Keep `#5, #9-PG` (PostgreSQL Host Staging) and Gates `G2`/`G3` strictly `BLOCKED`.

## Phases

| Phase | Name | Status | File Ownership |
|---|---|---|---|
| 1 | Implement Telemetry `timestamp` + `versionIdentity` and Ledger `exitPrice` + `closedAt` with TDD Unit Tests & Audit Sync | in_progress | `src/platform/workers/paper-trading-entry.ts`, `src/platform/workers/edge-proxy-inline-routes.ts`, `src/platform/workers/__tests__/paper-trading-status-route.test.ts`, `src/platform/workers/__tests__/edge-proxy-health-route.test.ts`, `plans/reports/audit-261101-golive-poly/{04,08,11}*.md` |

## Acceptance Criteria

1. `getPaperTradingStatus(kv, env)` returns `timestamp` (valid ISO-8601 UTC string) and `versionIdentity: { commitSha, shortSha, deployedAt, deployBranch, environment }` populated from `env`/`process.env` with safe `'unknown'`/`null` fallbacks and zero KV/D1 mutations.
2. `handlePaperTradesLedger` queries `exit_price, closed_at` from `paper_trades_v3` and returns `exitPrice: number | null` and `closedAt: string | null` on each trade item while preserving all existing fields (`id, tokenId, side, price, size, pnl, strategy, source, timestamp`).
3. All unit tests in `src/platform/workers/__tests__/paper-trading-status-route.test.ts` and `src/platform/workers/__tests__/edge-proxy-health-route.test.ts` pass (`0` failures), and `npx tsc --noEmit` exits `0`.
4. All touched `.ts` files remain under the 200 LOC ceiling (`paper-trading-entry.ts <= 200`, `edge-proxy-inline-routes.ts <= 200`).
5. Audit reports `04`, `08`, and `11` accurately reflect the implemented telemetry fields, SHA provenance proof, and Two-Tier 30-Day Shadow Protocol.
