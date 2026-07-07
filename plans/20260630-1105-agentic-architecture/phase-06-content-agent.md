---
priority: P2
status: pending
title: "Phase 6: ContentAgent"
estimated_days: 0.5
---

# Phase 6: ContentAgent

## Overview

Thin orchestrator over existing AutoMarketingDaemon (DeepSeek R1, Phase 32 completed). Routes new-strategy-publish and weekly-cron events to the existing content pipeline.

## Key Findings from Research

- AutoMarketingDaemon: `src/platform/marketing/auto-marketing-daemon.ts` exists and runs
- Phase 32 delivered: blog router, welcome-email drip, Twitter auto-poster
- DeepSeek R1 already integrated for content generation

## Effort Justification

0.5 days because content pipeline already works. This phase:
1. Wires strategy-publish events → content pipeline (blog + twitter)
2. Adds churn-model data input to drip personalization
3. Tests end-to-end flow

## Files to Create

- `src/agentic/content-agent.ts` — 100 LOC orchestration

## Files to Modify

- `src/platform/marketing/auto-marketing-daemon.ts` — Add `onStrategyPublish()`, `onWeeklyReport()` hooks

## Implementation Steps

1. Add `events` parameter to AutoMarketingDaemon constructor: `new AutoMarketingDaemon({ onPublish: handler, onWeekly: handler, ... })`
2. Implement `ContentAgent`:
   - `onStrategyPublished(strategyId)` → blog post + Twitter thread
   - `onWeeklyReport()` → performance digest (reuse revenue-analytics)
3. Wire from StrategyLab publish → ContentAgent.onStrategyPublished
4. Tests: mock Daemon, verify both events trigger correctly

## Acceptance Criteria

- [ ] Strategy publish → blog post generated
- [ ] Twitter thread auto-posted
- [ ] Weekly cron generates performance digest
- [ ] Tests: 3 cases (publish, weekly, error)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| DeepSeek R1 unavailable | Low | Low | Falls back to template (existing) |

## Rollback

Remove ContentAgent hooks. Existing cron continues to run.
