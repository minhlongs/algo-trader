---
phase: 1
title: "Go-to-Market"
status: pending
effort: M
---

# Phase 1: Go-to-Market

## Overview
Launch community channels and publish ready-to-post marketing content. 3 sub-tasks: Discord, Telegram bot, content/twitter.

## Related Files
- Read: `docs/marketing/discord-announce.md`
- Read: `docs/marketing/launch-posts-ready-to-post.md`
- Read: `docs/marketing/blog-arbitrage-engine.md`
- Read: `src/platform/telegram/bot.ts`
- Read: `docs/social-accounts.md`

## Sub-Tasks

### A1: Discord
1. Create Discord server (name: CashClaw Algo Trader)
2. Set up channels: #announcements, #signals, #strategies, #support, #general
3. Post ready-to-post announcement from docs/marketing/discord-announce.md
4. Add invite link to landing page

### A2: Telegram Bot
1. Get bot token from @BotFather (MANUAL — user must do this)
2. Set TELEGRAM_BOT_TOKEN in .env
3. Test /campaign, /status, /results commands respond correctly
4. Wire Slack/Telegram alerts for trading signals

### A3: Content + Twitter
1. Publish first blog post (docs/marketing/blog-arbitrage-engine.md) — convert to dashboard page
2. Create @CashClaw Twitter/X handle
3. Post launch thread from docs/marketing/launch-posts-ready-to-post.md
4. Register Polymarket profile and Discord

## Success Criteria
- [ ] Discord server live, announcement posted, invite link added
- [ ] Telegram bot responds to all commands
- [ ] Twitter handle created, first blog published
