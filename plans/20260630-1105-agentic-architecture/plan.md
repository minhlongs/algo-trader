---
title: "Agentic Architecture Expansion — 6-Phase Plan"
description: "MCP Server, SignalProviderOnboarding, LeadHunter, BillingAgent, CustomerSuccess+StrategyLab, ContentAgent"
status: pending
priority: P1
effort: 14d
branch: main
tags: [mcp, onboarding, telegram-bot, billing, agentic, marketplace]
created: 2026-06-30
---

# Alpha: Agentic Architecture Expansion for algo-trader

## Overview

Transform algo-trader from a trading-signal engine into an autonomous marketplace by adding 5 new operational agents (Customer Success, Strategy Lab, Content, Lead Hunter, Billing) that run atop the existing 19 trading agents.

## Phases

| # | Phase | Priority | Effort | Status |
|---|-------|----------|--------|--------|
| 1 | MCP Server | P0 | 2d | pending |
| 2 | SignalProviderOnboarding | P0 | 3d | pending |
| 3 | LeadHunter | P1 | 2d | pending |
| 4 | BillingAgent | P1 | 2d | pending |
| 5 | CustomerSuccess + StrategyLab | P1 | 3d | pending |
| 6 | ContentAgent | P2 | 0.5d | pending |

## Dependency Graph

```
Phase1(MCP) ──► anything that exposes operations to external tools
Phase2(Provider) ──► feeds Phase5(StrategyLab) strategies
Phase3(LeadHunter) ──► no inbound deps (parallel)
Phase4(Billing) ◄────── Phase3 (upgrade nudges from CS = billing events)
Phase5(CS+Lab) ───► feeds Phase6 content pipeline
Phase6(Content) ───► Phase5 signals (new strategy publish)
```

## Risk Assessment Summary

| Phase | Risk | Likelihood | Impact | Mitigation |
|-------|------|-----------|--------|------------|
| 1 (MCP) | Auth revocation mid-SSE | Medium | Medium | Request-scoped keys, short-lived tokens |
| 2 (Provider) | Bad backtest data in DB | Low | Medium | Schema validation + quarantine flags |
| 4 (Billing) | Double-charge on IPN retry | Medium | High | Idempotency key on invoice creation |
| All | BullMQ redis unavailable | Low | High | Fallback to direct sync, graceful queue skip |
| All | Token cost overrun | Low | Medium | Tier-based concurrency limits in agent-config.ts |

## File Ownership

Each phase owns distinct files — no overlap:
- **Phase1**: `src/workers/mcp-server.ts`, `src/api/routes/mcp-routes.ts`
- **Phase2**: `src/agents/signal-provider-onboarding.ts`, `src/api/routes/provider-onboarding-routes.ts`
- **Phase3**: `src/agents/lead-hunter.ts`, Telegram bot updates
- **Phase4**: `src/agents/billing-agent.ts`, `src/api/routes/billing-agent-routes.ts`
- **Phase5**: `src/agents/customer-success.ts`, `src/agents/strategy-lab.ts`
- **Phase6**: Wires into existing `src/platform/marketing/auto-marketing-daemon.ts`

## Test Matrix

| Layer | What | Tools |
|-------|-------|-------|
| Unit | Each agent class (mock LLM, mock queue) | vitest |
| Integration | Route + service end-to-end | vitest + supertest |
| E2E | Telegram bot DM flow, NOWPayments IPN, paper trading result | playwright or manual |

## Rollback Strategy

- **Phase1**: Feature-flag `ENABLE_MCP_SERVER` in wrangler.toml → disable route unmount
- **Phase2**: New tables `provider_applications` / `paper_trading_sessions` — no impact on existing tables; drop + re-migrate
- **Phase3**: Telegram-handler wrapped in try/catch; remove handlers = revert
- **Phase4**: BillingAgent wraps existing NOWPayments handler; remove agent, original webhook unchanged
- **Phase5**: Agent registers itself; deregister = no-op
- **Phase6**: Revert to cron-only (Phase 32 still working)

## Unresolved Questions

1. **LLM routing for new agents**: Research reuses DeepSeek R1 for content. Where do LeadHunter / BillingAgent / CustomerSuccess route their LLM calls? Current `agent-config.ts` maps to OpenClaw endpoints. Need env var or gate config for DeepSeek integration.
2. **Telegram user-ID ↔ license mapping**: Telegram bot handles bot commands via `UserSession` map (in-memory). For LeadHunter DMs, need persistent mapping between `telegramUserId` and `licenseId`. No DB table exists yet.
3. **Revenue share calculation**: Marketplace plan (260621) covers revenue sharing % but no implementation exists. BillingAgent reuses `revenue-analytics.ts` for MRR — need backtest data to seed provider earnings.
