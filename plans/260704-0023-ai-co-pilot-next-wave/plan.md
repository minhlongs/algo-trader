---
title: "AI Co-pilot + GTM — Next Wave IV"
description: "Natural language AI trading assistant (Dashboard Chat + Telegram) + Go-to-Market launch"
status: pending
priority: P1
branch: main
tags:
  - ai-co-pilot
  - chat
  - telegram
  - gtm
  - launch
blockedBy: []
blocks: []
created: "2026-07-04T00:23:00.000Z"
createdBy: "ck:brainstorm → ck:plan --deep --parallel"
source: brainstorm
brainstorm: plans/reports/brainstorm-260704-0023-ai-co-pilot-report.md
---

# AI Co-pilot + GTM — Next Wave IV

## Overview

Natural language AI trading assistant trên dashboard web và Telegram. User hỏi "what's my risk?" → nhận câu trả lời real-time từ hệ thống + action buttons.

Built on top of existing: XAI dashboard, AlphaEar LLM client, signal fusion engine, regime detector, prediction accuracy tracker, Telegram bot.

## Phase Structure

| Phase | Name | Effort | Status |
|-------|------|--------|--------|
| 1 | [Backend Co-pilot Core](./phase-01-backend-co-pilot-core.md) | 3-4 days | Pending |
| 2 | [GTM Email Campaign](./phase-02-gtm-email-campaign.md) | 2 days | Pending |
| 3 | [Dashboard Chat Widget](./phase-03-dashboard-chat-widget.md) | 3-4 days | Pending |
| 4 | [Telegram Ask + Launch](./phase-04-telegram-ask-launch.md) | 2 days | Pending |
| 5 | [Verify and Merge](./phase-05-verify-and-merge.md) | 1 day | Pending |

**Execution order (xen kẽ — interleaved):**
```
Day 1-3:   Phase 1 — Backend Co-pilot
Day 4-5:   Phase 2 — GTM Email Campaign  
Day 6-8:   Phase 3 — Dashboard Chat Widget
Day 9-10:  Phase 4 — Telegram + Launch Content
Day 11:    Phase 5 — Verify & Merge
```

## Success Criteria

- [ ] 5 intent handlers respond correctly with live data from existing trading services
- [ ] Fallback handler returns graceful message (AlphaEar doesn't support free-text chat — use structured "I can help with: risk, arb, performance, regime, report")
- [ ] Dashboard chat widget renders with FAB, message bubbles, typing indicator, action buttons
- [ ] Telegram /ask responds to all 5 intents within 5 seconds (with auth token in request)
- [ ] Email manually sent to FREE users (EmailService has no campaign/batch support)
- [ ] Launch content published on 2+ channels (Reddit, Twitter, Discord, Blog)
- [ ] 2,851+ tests passing, 0 regressions (currently 4 pre-existing failures)

## Red Team Review

### Finding 1: Co-pilot files placed in non-existent `src/platform/intelligence/` directory — **CRITICAL**
- **Applied:** Yes (paths corrected to `src/desk/intelligence/` across all phase files)
- **Fix:** All file paths changed from `src/platform/intelligence/` to `src/desk/intelligence/`

### Finding 2: AlphaEar does not support free-text chat — **CRITICAL**
- **Applied:** Yes (fallback handler redesigned)
- **Fix:** Replaced "LLM chat fallback" with structured intent listing. Fallback now returns pre-formatted message with 5 supported query types and action buttons.

### Finding 3: `pnpm deploy:full` does not exist — **CRITICAL**
- **Applied:** Yes (Phase 5 corrected)
- **Fix:** Changed Phase 5 deploy step from `deploy:full` to `build` + `deploy:cf`

### Finding 4: No rate limiting on LLM-backed endpoint — **CRITICAL**
- **Applied:** Yes (Phase 1 Step 7 updated)
- **Fix:** Added `distributed-rate-limiter.ts` middleware to co-pilot route, 10 req/min PRO, 30/min ENTERPRISE+

### Finding 5: Telegram /ask has no auth — will always 403 — **CRITICAL**
- **Applied:** Yes (Phase 4 Step 1 updated)
- **Fix:** Added `Authorization: Bearer` header using `TELEGRAM_COPILOT_API_KEY`. Updated .env.example.

### Finding 6: EmailService doesn't support campaigns — **HIGH**
- **Applied:** Yes (Phase 2 simplified)
- **Fix:** Changed from "campaign" to manual send: query DB, send one-by-one with rate limiting. 2-day estimate retained.

### Finding 7: 4 tests already failing — **HIGH**
- **Applied:** Yes (success criteria updated)
- **Fix:** Baseline set to 2,851+ (current passing count), not 2,855

### Finding 8: Dashboard App.tsx mounting pattern incompatible — **HIGH**
- **Applied:** Yes (Phase 3 Step 7 updated)
- **Fix:** CoPilotChat mounted after `</Routes>` inside `<ErrorBoundary>`, following existing pattern

### Finding 9: Telegram bot is class-based, not function-based — **HIGH**
- **Applied:** Yes (Phase 4 Step 2 updated)
- **Fix:** Changed registration to `this.bot.command('ask', ...)` inside TelegramBotService class

### Finding 10: No XSS sanitization for LLM markdown — **HIGH**
- **Applied:** Yes (Phase 3 Step 9 added)
- **Fix:** Added explicit sanitization requirement using DOMPurify

### Finding 11: No timeout wiring for parallel handlers — **HIGH**
- **Applied:** Yes (risk section updated)
- **Fix:** Added explicit timeout configuration: 5s per handler with AbortController, 25s total for Telegram

### Finding 12: Keyboard shortcut Ctrl+/ conflicts with browser — **MEDIUM**
- **Applied:** Yes (Phase 3 Step 8 added)
- **Fix:** Changed to Ctrl+Shift+/ or Ctrl+B

### Finding 13: Intent classifier ambiguity for real queries — **MEDIUM**
- **Applied:** Already covered by confidence threshold in original plan

### Finding 14: detectRegime() has two implementations — **MEDIUM**
- **Applied:** Yes (related files section clarified)
- **Fix:** Explicitly note to use `src/desk/strategies/dna/regime-detector.ts`

### Finding 15: STARTER tier targets users who can't use PRO features — **MEDIUM**
- **Applied:** Acknowledged but deferred — STARTER is a separate tier decision outside co-pilot scope

## Key Files

- Brainstorm: `plans/reports/brainstorm-260704-0023-ai-co-pilot-report.md`
- Backend: `src/platform/api/routes/co-pilot-routes.ts`
- Backend: `src/desk/intelligence/co-pilot/` (intent-classifier, handlers, formatter)  -- NOTE: NOT src/platform/intelligence/ (that path does not exist)
- Frontend: `dashboard/src/components/co-pilot/` (chat widget, FAB, message, actions)
- Telegram: `src/platform/telegram/ask-handler.ts`
- Docs: `docs/development-roadmap.md`
