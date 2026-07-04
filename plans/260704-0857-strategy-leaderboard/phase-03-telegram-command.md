---
phase: 3
title: "Telegram Command"
status: pending
effort: "S (0.5 day)"
---

# Phase 3: Telegram Command

## Overview

Thêm /leaderboard command cho Telegram bot. Returns top 5 strategies.

## Files

```
Create:
├── src/platform/telegram/leaderboard-handler.ts
└── src/platform/telegram/__tests__/
    └── leaderboard-handler.test.ts

Modify:
└── src/platform/telegram/bot.ts     — Register /leaderboard command
```

## Implementation Steps

### Step 1: Leaderboard Handler
`leaderboard-handler.ts`:
```typescript
export async function handleLeaderboard(ctx: Context): Promise<void> {
  const response = await fetch(`${API_URL}/api/v1/leaderboard?sort=winRate&limit=5`, {
    headers: { 'Authorization': `Bearer ${TELEGRAM_COPILOT_API_KEY}` }
  })
  const data = await response.json()
  
  const formatted = data.strategies.map((s, i) => 
    `${i+1}. ${s.name} — ${(s.winRate * 100).toFixed(0)}% win rate | Sharpe ${s.sharpe.toFixed(2)}`
  ).join('\n')
  
  await ctx.reply(`🏆 *Top Strategies*\n\n${formatted}`, { parse_mode: 'Markdown' })
}
```

### Step 2: Register Command
In bot.ts: `this.bot.command('leaderboard', handleLeaderboard)`

### Step 3: Tests
Test: returns formatted response with top 5, error handling.

## Success Criteria
- [ ] /leaderboard returns top 5 strategies
- [ ] Formatted as markdown with metrics
- [ ] Error handling for API failures
- [ ] Tests pass
