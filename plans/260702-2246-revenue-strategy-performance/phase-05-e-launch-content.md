---
phase: 5
title: "E: Launch Content"
status: pending
priority: P1
dependencies: [phase-01-a-comprehensive-backtest]
---

# Phase 5: Launch Content

## Overview

Drafts exist at `docs/marketing/launch-posts-ready-to-post.md`. Replace `[INSERT]` placeholders with real strategy names and metrics from Phase A, then post to channels.

## Requirements

- Fill all `[INSERT]` placeholders with actual data (strategy names, Sharpe ratios, PnL figures)
- Channels: X (7-tweet thread), Polymarket Discord, Reddit r/algotrading
- Schedule: X thread first → Discord drop → Reddit deep-dive (4h apart)
- Follow-ups at T+24h and T+48h with real launch metrics

## Related Code Files

- **Modify:** `docs/marketing/launch-posts-ready-to-post.md` — fill placeholders
- **Read:** `reports/backtest-results.csv` — source data

## Implementation Steps

1. Open the launch posts draft
2. Replace all `[INSERT]` with actual values from backtest results:
   - Best Sharpe strategy name + ratio
   - Top win rate strategy name + percentage
   - Best PnL strategy name + value
   - Total strategies tested
   - Total backtest trades analyzed
3. Verify links work, accounts are configured
4. Post X thread → wait 4h → post Discord → wait 4h → post Reddit
5. Schedule T+24h metrics follow-up post

## Success Criteria

- [ ] All placeholders filled with real data
- [ ] Posted on ≥2 channels
- [ ] Links in posts resolve correctly
- [ ] No PII or secrets in public posts

## Risk Assessment

- X/Twitter API may need auth → verify before scheduling
- Discord post may need access to Polymarket community → user action needed
