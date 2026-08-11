---
title: "Go Live Week 1 — Production Deploy, Launch Content, IPN Config, Live Trading"
description: "Transition from code-complete to revenue-generating: deploy latest code, post launch marketing, configure NOWPayments IPN, start live trading on minimal capital"
status: blocked (awaiting external credentials)
priority: P1
branch: "main"
tags: [go-live, deploy, launch, live-trading, ipn, marketing]
blockedBy: []
blocks: [260630-1930-platform-golive-phase2]
created: "2026-07-02T07:39:05.352Z"
createdBy: "ck:plan"
source: skill
sessionId: "sophia-p0-golive"
brainstorm: "../reports/brainstorm-260702-1411-next-steps-initial.md"
---

# Go Live Week 1 — Production Deploy, Launch Content, IPN Config, Live Trading

## Overview

All 6 pending tracks shipped (live execution, integration tests, marketplace E2E, V2 migration, route tests, backtesting). **Zero revenue activity is live.** This plan transitions from "code complete" to "revenue generating" in Week 1.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Deploy Production](./phase-01-deploy-production.md) | Pending |
| 2 | [Post Launch Content](./phase-02-post-launch-content.md) | Pending |
| 3 | [Configure IPN Webhook](./phase-03-configure-ipn-webhook.md) | Pending |
| 4 | [Setup Live Trading Graduated Rollout](./phase-04-setup-live-trading-graduated-rollout.md) | Pending |
| 5 | [End-to-End Smoke Test](./phase-05-end-to-end-smoke-test.md) | Pending |
| 6 | [Pre-Flight Check](./phase-06-pre-flight-check.md) | ✅ Complete — 2,798 tests pass, 0 TS errors |

## Dependencies

```
Phase 6 (Pre-Flight) ──→ Phase 1 (Deploy) ──→ Phase 2 (Launch) ──→ Phase 3 (IPN) ──→ Phase 4 (Live Trading)
                                                      ↓
                                               Phase 5 (E2E Smoke Test)
```

Phases 2, 3, 5 can run in parallel after Phase 1. Phase 4 starts after 1+3.

## Overlapping Plans

- `plans/260630-1930-platform-golive-phase2/` — Phase 04 (Launch Content Posting) was pending; this plan supersedes it
- `plans/260630-2150-cf-platform-finalize/` — Deploy tasks; superseded by Phase 1

## Key Decisions (from brainstorm)

- **Deploy:** Full deploy (`scripts/deploy-production.sh`) — quality gates first
- **Launch content:** Quick review then post immediately (don't overthink)
- **IPN:** Manual NOWPayments dashboard config (no API available)
- **Live trading:** Graduated rollout — paper 48h → 0.5% bankroll → 2% on winners
- **Risk gates:** Enforced by code (2% max bankroll, 5% daily loss, 10 concurrent, circuit breaker)

## Success Criteria

- [ ] Production deploy: SHA verified, HTTP 200, quality gates pass
- [ ] Launch content: posted on Twitter (X) + Polymarket Discord + Telegram
- [ ] IPN: NOWPAYMENTS_IPN_SECRET set in env, E2E payment flow verified
- [ ] Live trading: running on minimal capital with guard protection
- [ ] 0 regressions: all 2,798 tests still pass
- [ ] Risk gates functional: guard rejects oversized positions, daily loss stops trading
