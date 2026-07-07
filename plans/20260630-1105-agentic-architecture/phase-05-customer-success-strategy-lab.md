---
priority: P1
status: pending
title: "Phase 5: CustomerSuccess + StrategyLab"
estimated_days: 3
---

# Phase 5: CustomerSuccess + StrategyLab

## Overview

Two coordinated agents. CustomerSuccess handles trial walkthrough, upgrade nudges, churn prediction. StrategyLab handles backtest validation, performance aggregation, strategy publishing.

## Key Findings from Research

- Onboarding service: `src/platform/billing/onboarding-service.ts` (signup → verify → activate)
- Trial tracking: `trial-drip-service.ts` (day-based drip campaigns)
- Strategy runner: `src/engine/strategy-runner.ts`
- Paper trading: `src/paper-trading/paper-exchange.ts`
- Drip subs: `DripSubscriber` interface — can reuse for churn scoring input
- Revenue analytics: `src/platform/billing/revenue-analytics.ts`

## CustomerSuccess Flow

```
Trial start:
  → walkthrough DM (day 1, 3, 5 tips based on drip schedule)
  → check feature adoption (signals consumed, alert set?)

Day 7 (trial ends):
  → upgrade nudge (ICC: ROI calc)
    → if no upgrade: churn risk flag

Support ticket:
  → auto-respond (reuse existing `auto-support-handlers.ts`)
  → escalate to human if mentioned keywords: "refund", "cancel", "broken"

NPS survey (monthly):
  → collect score → update churn model
```

## StrategyLab Flow

```
New strategy submitted:
  → backtestRunner.run(last90dohlcv) → sharpe / maxDD / winRate
  → if sharpe > threshold → auto-approve
  → if below → quarantine flag for human review
  → publish to signal feed (reuse signal-publisher.ts)

Weekly cron:
  → re-run backtest on all strategies
  → re-rank by sharpe
  → update strategy-table in admin UI
```

## Files to Create

- `src/agentic/customer-success.ts`
- `src/agentic/strategy-lab.ts`
- `src/agentic/types/churn-model.ts`
- `src/agentic/types/strategy-lab-types.ts`

## Files to Modify

- `src/platform/billing/trial-drip-service.ts` — Add `addChurnScore()` extension method

## Implementation Steps

1. Define `ChurnScore` model: `{ userId, score (0-1), signals: string[] }`
2. Implement `CustomerSuccessAgent`:
   - `onTrialStart(licenseId)` — schedule walkthrough DMs
   - `detectChurn()` — scanner daily: usage drop + trial ending + NPS < 7
   - `triggerUpgradeNudge(licenseId)` — Telegram DM + email via EmailService
3. Implement `StrategyLabAgent`:
   - `validateStrategy(strategyId)` — run backtest, return `{ sharpe, maxDD, winRate }`
   - `reRankStrategies()` — weekly cron, update strategy ranking table
   - `publishStrategy(strategyId)` — call signal-publisher.ts fan-out
4. Wire StrategyLab to Phase 2 (provider approval workflow)
5. Tests: churn model on synthetic data, backtest with mock market data

## Acceptance Criteria

- [ ] New trial → walkthrough DM sequence (day 1, 3, 5)
- [ ] Churn score per user updated daily
- [ ] Upgrade nudge on day 7 if trial ending + no upgrade
- [ ] Backtest runs in <30s for 90d window
- [ ] Strategy re-rank weekly (cron configurable)
- [ ] Tests: churn model, backtest pipeline

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| False churn positives → user fatigue | Medium | Medium | Conservative thresholds (2+ signals + 7d silence) |
| Backtest data stale for new strategies | Medium | Medium | Reject if data < 30d; fetch from CCXT |

## Rollback

Agents are optionally-registered. Remove from cron + agent registry. Drip + backtest continue to work standalone.
