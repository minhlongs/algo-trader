---
phase: 3
title: "Telegram Commands and Blog"
status: pending
priority: P2
effort: "~3h"
dependencies: []
---

# Phase 3: Telegram Commands and Blog

## Overview

Add marketplace commands to Telegram bot (/campaign, /results) and create first blog content.

## Telegram Commands (A3)

Current bot commands: /start, /help, /status, /link, /unlink, /notifications, /limits
Missing: /campaign (list marketplace strategies), /results (P&L for subscribed strategies)

### New Commands
- `/campaign` → List marketplace strategies with prices, brief description, link
- `/campaign <id>` → Detail: name, price, description, backtest results
- `/results` → Current P&L across active subscriptions
- `/subscribe <id>` → Quick subscribe via Telegram (redirect to checkout)

### Related Files
- Modify: `src/platform/telegram/bot-command-handlers.ts`
- Read: `src/platform/telegram/bot.ts` — command registration
- Read: `src/platform/api/routes/marketplace-subscription-routes.ts` — data source

### Implementation
1. Add `/campaign` handler — fetch from `/api/v1/marketplace/strategies`
2. Add `/results` handler — fetch subscriber P&L
3. Register commands in bot setup
4. Format: markdown with inline keyboard buttons

## Blog Go-Live (A4)

Blog routes built (blog-engagement-routes.ts, post-similarity-engine.ts, comment-moderation-service.ts). Just need first content.

### Steps
1. Check blog routes are wired in server.ts
2. Draft first 3 posts (AI-assisted via auto-marketing daemon?)
3. Verify newsletter subscribe flow works

## Success Criteria

- [ ] `/campaign` returns marketplace strategy list
- [ ] `/results` returns current P&L for active subscriptions
- [ ] Commands are registered in bot setup
- [ ] Blog routes return HTTP 200
- [ ] Newsletter subscribe saves preferences
- [ ] `pnpm typecheck` — 0 errors
