---
title: "Signals API Marketplace — Next Wave VIII"
description: "Sell trading signal feeds via REST API. $29/$99/$299 monthly tiers. Webhook or polling delivery."
status: pending
priority: P2
branch: main
tags:
  - signals-api
  - marketplace
  - billing
blockedBy: []
blocks: []
created: "2026-07-04T09:41:00.000Z"
createdBy: "ck:brainstorm → ck:plan"
source: brainstorm
brainstorm: plans/reports/brainstorm-260704-0941-signals-api-report.md
---

# Signals API Marketplace — Next Wave VIII

## Overview

Bán trading signal feeds qua REST API. Customer subscribe → nhận signals real-time (webhook hoặc polling). Revenue stream mới độc lập với platform.

## Phases

| Phase | Name | Effort | Status |
|-------|------|--------|--------|
| 1 | [Backend Signal Publisher](./phase-01-backend-signal-publisher.md) | 2 days | Pending |
| 2 | [API Endpoints](./phase-02-api-endpoints.md) | 1 day | Pending |
| 3 | [NOWPayments Billing](./phase-03-nowpayments-billing.md) | 1 day | Pending |
| 4 | [Verify and Merge](./phase-04-verify-and-merge.md) | 0.5 day | Pending |

## Pricing

| Tier | Price | Rate | Webhook | History |
|------|-------|------|---------|---------|
| Signals Basic | $29/mo | 1/sec | ❌ | 1 day |
| Signals Pro | $99/mo | 10/sec | ✅ | 7 days |
| Signals Enterprise | $299/mo | 100/sec | ✅ | 30 days |

## Success Criteria
- [ ] Signal publisher pushes signals to subscribers in real-time
- [ ] POST /api/v1/signals/subscribe creates subscription
- [ ] GET /api/v1/signals/feed returns signals for authenticated subscriber
- [ ] POST /api/v1/signals/webhook delivers signals via webhook
- [ ] NOWPayments billing works for all 3 signal tiers
- [ ] 2,936+ tests, 0 regressions
