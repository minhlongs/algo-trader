---
priority: P1
status: pending
title: "Phase 3: LeadHunter"
estimated_days: 2
---

# Phase 3: LeadHunter

## Overview

Telegram DM orchestration: welcome message, FAQ, daily check-in, churn-risk alert. Reuses existing Telegram bot (`src/platform/telegram/bot.ts`, handlers in `auto-support-handlers.ts`).

## Why this phase now

Reuses proven Telegram bot. No new infra. Low risk.

## Key Findings from Research

- Telegram bot at `src/platform/telegram/bot.ts` — grammy-based, singleton pattern
- Command handlers: `bot-command-handlers.ts` (start, help, status, campaign, results)
- Auto-support handlers: `auto-support-handlers.ts` (faq, support, pricing)
- User sessions: `Map<number, UserSession>` — in-memory, telegramUserId → session
- `LicenseService` at `src/platform/billing/license-service.ts` — map API key `->` license

## Missing Infrastructure

- `telegram_user_license_map` table (or in-memory bridge) to link `telegramUserId` → `licenseId`

## Files to Create

- `src/agentic/lead-hunter.ts` — Agent orchestrator wrapping Telegram DM flows
- `src/agentic/types/lead-hunter-types.ts` — Types for DM flows + churn signals
- `src/platform/telegram/user-link-store.ts` — Persistent telegramUserId ↔ licenseId mapping

## Files to Modify

- `src/platform/telegram/bot.ts` — Register new DM text handler + callback handler
- `src/platform/api/server.ts` — Add route to trigger manual check-in (for testing)

## Flow

```
New signup detected (listen to OnboardingService events)
  → LeadHunter.sendWelcome(telegramUserId)
    → DM: "Welcome! /faq for questions. We'll check in daily."

Daily cron:
  → LeadHunter.sendDailyCheckIn(activeUsers)
    → DM: personalized tip based on usage

Churn risk detected (via TrialDripService or custom logic):
  → LeadHunter.alertHuman(licenseId) → DM to operator
    → 30min grace: auto-discount if not acknowledged
```

## Implementation Steps

1. Create `UserLinkStore` — Map + file-backed persistence (PDF2: durable for >10K users, HDD: accept in-memory + file for now)
2. Implement `LeadHunterAgent`:
   - `detectNewSignup(licenseId)` — subscribe to onboarding events or poll
   - `detectChurnRisk()` — check: last activity > 7d, trial expiring < 3d, tier downgrade signal
   - `sendWelcome(userId)` — Telegram DM via `bot.api.sendMessage()`
   - `sendDailyCheckIn()` — batch-send personalized tips
   - `escalateToHuman(licenseId)` — DM operator (TOKEN_ADMIN from env)
3. Handle `DM text` in `bot.ts`: route to LeadHunter if not a command (fallback to AutoSupport)
4. Write tests: mock grammy, test churn logic, test escalation

## Acceptance Criteria

- [ ] New signup → welcome DM within 5 minutes
- [ ] Daily check-in sends once per user per day (dedup via timestamp)
- [ ] Churn risk → operator alert
- [ ] FAQ commands work without breaking existing handlers
- [ ] All tests pass

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Telegram rate limit (30 msg/sec) | Low (< 1K users) | Medium | Batch with 1s delay between users |
| In-memory session loss on restart | Medium | Low | Use file-backed store in `UserLinkStore` |
| Operator DM spam | Low | Low | Per-user cooldown: 1 alert/day |

## Rollback

Remove DM handlers from `bot.ts`, remove `LeadHunterAgent` class. In-memory state is transient.
