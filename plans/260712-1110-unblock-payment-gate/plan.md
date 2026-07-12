---
title: Unblock Payment Gate — $1K MRR Unlock
status: complete
completed: 2026-07-12
prior_art: plans/reports/from-workflow-synthesis-to-planner-260712-1110-unblock-payment-gate-report.md
---

# Unblock Payment Gate

## Goal
Fix the 3 hard blockers preventing the first paying customer from completing the signup → pay → activate flow.

## Status: Pending

## Phases

| Phase | Status |
|-------|--------|
| 01-mount-nowpayments-webhook | ✅ complete (already mounted at line 173) |
| 02-dns-routing-fix | ✅ complete (api.cashclaw.cc → 200, wrangler.toml updated) |
| 03-telegram-bot-e2e | ✅ complete (wired thresholdAlerts.initialize() into app.ts) |
| 04-end-to-end-validation | ✅ complete (26/26 tests pass across 3 suites) |

## Dependencies
- Phase 01 → 02 → 03 → 04 (sequential)
- No external dependencies

## Acceptance Criteria
1. `POST /api/webhooks/nowpayments` returns 200 (not 404)
2. `api.cashclaw.cc` resolves publicly
3. Telegram `/campaign`, `/status`, `/results` respond in prod
4. Full signup→pay→activate flow verified end-to-end with test payment

## Risk
- DNS change may require CF Pages config update
- Telegram bot token rotation if prod keys differ from staging
