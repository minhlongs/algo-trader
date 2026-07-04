---
phase: 3
title: "C: Featured Marketplace Listings"
status: pending
priority: P1
dependencies: [phase-01-a-comprehensive-backtest]
---

# Phase 3: Featured Marketplace Listings

## Overview

Surface top 5 performing strategies in the marketplace. Update the strategy seeder with performance badges, risk tags, and default sort by Sharpe.

## Requirements

- Top 5 strategies by Sharpe ratio appear first in marketplace
- Performance badges: Sharpe > 2.0 = "Top Performer", Sharpe > 1.5 = "Solid", else no badge
- Risk tags: ≤10% drawdown = "Conservative", 10-25% = "Moderate", >25% = "Aggressive"
- Default sort: Sharpe descending
- Backwards compatibility: existing listings unchanged

## Architecture

- `desk-strategy-seeder.ts` reads backtest CSV and sets `featured: true` + `sortOrder` + `tags` on top performers
- Marketplace page renders featured badge + risk tag from strategy metadata

## Related Code Files

- **Modify:** `src/platform/marketplace/services/desk-strategy-seeder.ts` — add top 5 logic
- **Read:** `src/platform/marketplace/models/types.ts` — check strategy schema for tags/featured fields
- **Modify:** `dashboard/src/pages/marketplace-page.tsx` — render badge + tag
- **Read:** `reports/backtest-results.csv` — source data from Phase A

## Implementation Steps

1. Read CSV and identify top 5 by Sharpe (filter out strategies with <10 trades for statistical significance)
2. Update seeder: set `featured: true`, `sortOrder` (1-5), `riskProfile` tag, `performanceBadge` string
3. Update marketplace page rendering: show badge next to strategy name
4. Verify: restart app, check marketplace displays featured strategies first

## Success Criteria

- [ ] Marketplace shows 5 featured strategies at top
- [ ] Risk tags visible: "Conservative", "Moderate", "Aggressive"
- [ ] Performance badges visible for top performers
- [ ] Existing non-featured listings still present below
- [ ] 2,798 tests passing

## Risk Assessment

- Seeder may need DB migration for new fields → check schema; if fields exist, no migration needed
