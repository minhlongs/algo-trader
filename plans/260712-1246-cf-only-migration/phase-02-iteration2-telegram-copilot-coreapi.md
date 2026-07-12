---
phase: 2
title: "Iteration2-Telegram-Copilot-CoreAPI"
status: pending
priority: P1
dependencies: [1]
---

# Phase 2: Iteration2-Telegram-Copilot-CoreAPI

## Overview
Wire Telegram bot handler, Co-pilot /ask endpoint, and Markets/Strategies API into the Worker. All dispatch to existing DigitalOcean backend shards (StrategyShard DOs) — no new infrastructure needed.

## Requirements
- Functional:
  - Telegram webhook: route /ask to co-pilot intent classifier
  - Co-pilot /ask: 5 intent handlers (Risk, Arb, Perf, Regime, Report)
  - Markets/Strategies API: query StrategyShard DOs directly
  - Admin routes: user management (extend existing auth-handlers)
- Non-functional:
  - Co-pilot handler <5s (paid tier: use waitUntil or queue for heavy work)
  - Rate limit: 10 req/min (PRO), 30/min (ENTERPRISE+)

## Architecture

```
User Query (Dashboard or Telegram)
│
▼
Intent Classifier (keyword + confidence threshold)
│
▼
Parallel Handlers (5 sec timeout each)
┌──────┬──────┬──────┬──────┬──────┐
│ Risk │ Arb │ Perf │ Regm │ Rpt │
└──────┴──────┴──────┴──────┴──────┘
│
▼
Response Formatter (markdown + actions)
│
▼
Dashboard Chat Widget / Telegram Reply
```

## Related Code Files
- Create: `src/api/telegram-bot.ts`, `src/api/copilot.ts`, `src/api/markets.ts`
- Modify: `edge-proxy.ts` (add new local routes)
- Modify: StrategyShard DO (add query interface)
- Modify: ShardManager DO (expose strategies via admin endpoint)

## Implementation Steps
1. Implement Telegram webhook handler `src/api/telegram-bot.ts`
   - Verify bot token, parse webhook payload
   - Route /ask → co-pilot pipeline
   - Route /status → user tier + subscription info
   - Route /results → recent scan results
2. Implement co-pilot `/ask` endpoint
   - Intent classifier (keyword patterns, confidence scoring)
   - 5 parallel handlers (Risk, Arb, Perf, Regime, Report)
   - 5s timeout per handler via Promise.race
   - Markdown response formatting
3. Implement Markets/Strategies API
   - Query StrategyShard DOs via ShardManager routing
   - Return strategy metadata, performance metrics
4. Extend admin routes
   - User management (already exists in auth-handlers)
   - Strategy registry listing

## Success Criteria
- [ ] Telegram webhook receives and responds to /ask
- [ ] Co-pilot returns structured response for all 5 intents
- [ ] Low-confidence fallback returns intent listing
- [ ] Markets API queries ShardManager + StrategyShard
- [ ] All CPU within 5s timeout budget
- [ ] `pnpm build` → 0 errors

## Risk Assessment
| Risk | Prob | Impact | Mitigation |
|------|------|--------|------------|
| CPU timeout on co-pilot | Medium | High | Promise.race 5s limit; queue heavy work |
| Telegram bot conflict | Low | Medium | New bot token, separate from Sophia_Bbot |
| StrategyShard not reachable | Medium | High | Fallback to cached data from KV |
