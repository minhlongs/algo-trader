---
title: "Phase 3 — Persist Billing to PostgreSQL"
description: "Migrate SubscriptionService, PaymentService, and TrialDripService from in-memory Maps to PostgreSQL"
status: pending
priority: P1
effort: L
needsStitch: false
---

# Phase 3 — Persist Billing to PostgreSQL

## Context
3 core billing services use in-memory Maps:
- `SubscriptionService` — all subscription history lost on restart
- `PaymentService` — all payment records lost on restart
- `TrialDripService` — all drip campaign state lost on restart

## Tasks
1. Audit current in-memory data models
2. Create PostgreSQL migrations for billing tables
3. Refactor services to use Prisma/DB instead of Maps
4. Verify data survives restart in tests

## Files to examine
- `src/platform/billing/`
- `src/platform/api/routes/`
- Prisma schema
