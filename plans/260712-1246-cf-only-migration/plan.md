---
title: "CF-Only Migration — Eliminate VPS Dependency"
description: "Migrate all business logic from VPS proxy into Cloudflare Worker. Zero VPS dependency."
status: pending
priority: P1
branch: "main"
tags: [architecture, migration, cf-workers, vps-removal]
blockedBy: []
blocks: []
created: "2026-07-12T05:46:50.697Z"
createdBy: "ck:plan"
source: skill
---

# CF-Only Migration — Eliminate VPS Dependency

## Overview
Edge-proxy Worker currently handles auth/health but proxy-routes all /api/* to `VPS_ORIGIN` (unreachable). This plan migrates ALL business logic into the Worker using Durable Objects (shard management), D1 (subscriptions), and KV (auth/cache). Zero VPS dependency after Phase 1.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Iteration1-Subscription-Billing](./phase-01-iteration1-subscription-billing.md) | Complete |
| 2 | [Iteration2-Telegram-Copilot-CoreAPI](./phase-02-iteration2-telegram-copilot-coreapi.md) | Complete |
| 3 | [Iteration3-Dashboard-Polish](./phase-03-iteration3-dashboard-polish.md) | Complete |

## Dependencies

- NOWPayments API key, IPN secret, invoice IDs (user-provided)
- Telegram bot token (user-provided)
- D1 database created via: `wrangler d1 create algo-trader-db`
- Migrations in `migrations/`

## Acceptance Criteria

- `api.cashclaw.cc/api/health` → 200 (already done)
- `api.cashclaw.cc/api/version` → `{"sha": "..."}`
- `POST /api/webhooks/nowpayments` → HMAC verify + tier update
- `GET /api/v1/subscriptions/me` → returns user tier
- Telegram `/ask` → responds from worker
- Zero dependency on `VPS_ORIGIN` on production
- `pnpm build` → 0 errors

## Brainstorm Report

[plans/reports/brainstorm-cf-only-migration-260712-1217-report.md](../reports/brainstorm-cf-only-migration-260712-1217-report.md)
