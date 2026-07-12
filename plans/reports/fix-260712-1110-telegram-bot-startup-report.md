# Phase 3 Fix: Telegram Bot Startup
Date: 2026-07-12

## Root Cause
Two bugs prevented the Telegram bot from running in production:

### Bug 1: `bot.ts` — initialize() never set the flag
`TelegramBotService.initialize()` created the `Bot` instance and registered handlers but forgot `this.initialized = true`. Then `start()` checked `if (!this.bot || !this.initialized)` which always evaluated to `true`, causing an immediate throw.

### Bug 2: `app.ts` — never called thresholdAlerts.initialize()
`ThresholdAlerts.initialize()` is the gateway that wires `emailService + smsService + telegramBotService`. Production bootstrap (`app.ts:startApp`) never imported or invoked it.

## Changes Made

| File | Change | Lines |
|------|--------|-------|
| `src/platform/telegram/bot.ts` | Added `this.initialized = true` before `return true` in initialize() | L78 |
| `src/platform/telegram/bot.ts` | Simplified start() guard: `!this.bot \|\| !this.initialized` → `!this.bot` | L91 |
| `src/app.ts` | Added import for `thresholdAlerts` | L14 |
| `src/app.ts` | Added `thresholdAlerts.initialize()` in startApp() after augmented pipeline | L44-46 |

## Startup Chain (after fix)
```
app.ts startApp()
  → thresholdAlerts.initialize()  [sync, void]
    → telegramBotService.initialize()
      → new Bot(token)
      → setupCommands()  (registers /campaign, /status, /results, /link, etc.)
      → setupMiddleware()
      → this.initialized = true   ✓
    → thresholdAlerts calls telegramBotService.start() [async]
      → userSessionRepo.ensureTable()  (D1 table auto-create)
      → bot.start()  (grammy polling loop)
```

## Circular Dependency Check
`threshold-alerts.ts` → imports from: `@/seed`, `@/tree`, `@/land` (email/sms/telegram/alert-formatter). None of these import from `src/app.ts` (the entry point). Zero cycle.

## Verification
- tsc `--noEmit`: 0 new errors in `app.ts`, `threshold-alerts.ts`, `bot.ts`
- Pre-existing 280 errors in `src/desk/backtesting/` and `src/desk/execution/` (unrelated)
