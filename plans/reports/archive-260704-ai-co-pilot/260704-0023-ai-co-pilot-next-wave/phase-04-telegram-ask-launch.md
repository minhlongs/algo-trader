---
phase: 4
title: "Telegram Ask + Launch"
status: pending
effort: "S (2 days)"
---

# Phase 4: Telegram Ask + Launch

## Overview

Add `/ask` command to Telegram bot (uses same backend endpoint as dashboard chat) + publish launch content on multiple channels.

## Files

```
Create:
├── src/platform/telegram/ask-handler.ts              — /ask command handler
├── docs/marketing/
│   ├── launch-reddit-post.md                         — Reddit r/algotrading post
│   ├── launch-twitter-thread.md                      — X/Twitter thread
│   ├── launch-discord-announcement.md                — Polymarket Discord
│   └── launch-blog-post.md                           — Blog post
└── src/platform/telegram/__tests__/
    └── ask-handler.test.ts                           — Test /ask command

Modify:
└── src/platform/telegram/bot.ts                      — Register /ask command
```

## Implementation Steps

### Step 1: Telegram /ask Handler
Create `src/platform/telegram/ask-handler.ts`:

**IMPORTANT — Auth requirement:** The co-pilot API endpoint is gated by `requireTier('PRO')`. The Telegram bot must authenticate each request. Use the bot's own API token as the Bearer token (the API recognizes bot tokens from the x-api-key header pattern).

```typescript
export async function handleAsk(ctx: Context, query: string): Promise<void> {
  // Show typing indicator
  await ctx.replyWithChatAction('typing')
  
  // Auth: Bot authenticates via API key assigned to the bot
  const API_KEY = process.env.TELEGRAM_COPILOT_API_KEY || ''
  
  // Call same backend endpoint as dashboard chat
  const response = await fetch(`${API_URL}/api/v1/co-pilot/ask`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify({ query, context: { source: 'telegram' } }),
  })
  
  if (!response.ok) {
    await ctx.reply('Sorry, I could not process your request. Please try again later.')
    return
  }
  
  const data = await response.json()
  
  // Format for Telegram (markdown)
  const formatted = formatTelegramResponse(data)
  await ctx.reply(formatted, { parse_mode: 'Markdown' })
}
```

Add `TELEGRAM_COPILOT_API_KEY` to .env.example — this is a user-generated API key from the dashboard's self-service API key system.

### Step 2: Register Command
In `src/platform/telegram/bot.ts`:

NOTE: The bot is class-based (`TelegramBotService` class with `this.bot: Bot`). Commands are registered in the constructor using `this.bot.command()`:

```typescript
// In TelegramBotService class constructor or init method:
import { handleAsk } from './ask-handler'

// Command registration:
this.bot.command('ask', async (ctx) => {
  const query = ctx.message.text.replace('/ask', '').trim()
  if (!query) {
    await ctx.reply('Please provide a question. Example:\n/ask What is my risk exposure?')
    return
  }
  await handleAsk(ctx, query)
})
```

Also add quick command help:
```
/ask — Ask AI Co-pilot a question
/ask what is my risk exposure?
/ask find arbitrage opportunities
/ask how are my strategies performing?
```

### Step 3: Launch Content — Reddit
Create `docs/marketing/launch-reddit-post.md`:

Title: "I built a solo quant desk with an AI Co-pilot — 2,855 tests, 52 strategies, $0 employees"
Body:
- Build-in-public narrative (refer to manifesto)
- AI Co-pilot feature highlight
- STARTER tier at $19/mo
- Link: quant.cashclaw.cc

### Step 4: Launch Content — Twitter/X
Create `docs/marketing/launch-twitter-thread.md`:

7-tweet thread:
1. The thesis — one human vs the markets
2. What I built — trading engine, AI, marketplace
3. AI Co-pilot — natural language trading assistant
4. Results — 2,855 tests, regime-adaptive fusion
5. Pricing — FREE to MASTER ($999/mo), STARTER from $19
6. Solo quant manifesto
7. CTA — try it at quant.cashclaw.cc

### Step 5: Launch Content — Polymarket Discord
Create `docs/marketing/launch-discord-announcement.md`:

- Focus on Polymarket strategies
- Offer FREE PRO tier to first 10 beta testers
- Link to Co-pilot demo

### Step 6: Launch Content — Blog Post
Create `docs/marketing/launch-blog-post.md`:

Title: "Introducing AI Co-pilot — Your Natural Language Trading Assistant"
- What is it?
- How it works (intent classification → live data → response)
- 5 things you can ask
- Future roadmap
- CTA: sign up

### Step 7: Tests
Create `src/platform/telegram/__tests__/ask-handler.test.ts`:

- /ask with no query returns help message
- /ask "what's my risk?" calls co-pilot API
- API error returns friendly error message
- Response formatted as Telegram markdown

## Related Files
- `src/platform/telegram/ask-handler.ts`
- `src/platform/telegram/bot.ts`
- `docs/marketing/launch-reddit-post.md`
- `docs/marketing/launch-twitter-thread.md`
- `docs/marketing/launch-discord-announcement.md`
- `docs/marketing/launch-blog-post.md`

## Success Criteria
- [ ] /ask command registered in bot
- [ ] /ask "what's my risk?" returns risk assessment
- [ ] /ask with no query returns help text
- [ ] API errors handled gracefully
- [ ] Reddit post published (manual — content ready)
- [ ] Twitter thread published (manual — content ready)
- [ ] Discord announcement posted (manual — content ready)
- [ ] Blog post published via AutoMarketingDaemon
- [ ] All Telegram tests pass

## Risk Assessment
- **Telegram webhook URL changes after deploy** — May need re-registration. Add to deploy checklist.
- **API URL for Telegram** — Bot in production needs production API URL. Use env var `API_BASE_URL`.
- **Launch content publishing** — Manual steps (Reddit, Twitter accounts). User must create/publish.
- **API response latency** — Telegram has 30s timeout. Mitigation: timeout after 25s, return error message if no response.
