---
phase: 04
title: Decision aids panel
status: completed
priority: P1
---

# Phase 04 — Decision Aids Panel

## Context

Provide users with "what-if" scenario analysis and confidence scores for trade suggestions. Helps users understand potential outcomes before executing trades.

## Architecture

- What-if calculator: input position size → outputs potential profit/loss ranges
- Confidence scores: display for each signal/opportunity based on historical accuracy
- Integration with signals panel and neg-risk opportunities table
- Use simple probability math (Kelly, Sharpe-like metrics)

## Implementation Steps

1. **Create ConfidenceScore component** (`src/components/risk/ConfidenceScore.tsx`):
   - Props: `score` (0-100), `label` (optional), `size` (small/medium)
   - Visual: colored bar or badge with percentage
   - Color coding: green (>70%), yellow (40-70%), red (<40%)
   - Tooltip explaining what confidence means (based on backtest win rate, signal strength)
   - <80 lines

2. **Create WhatIfCalculator** (`src/components/risk/WhatIfCalculator.tsx`):
   - Inputs: position size (USD), leverage (if applicable), selected market/symbol
   - Displays: potential profit (optimistic), potential loss (pessimistic), risk/reward ratio
   - Use Kelly Criterion or simple % based on recent volatility
   - Pull data from trading store (recent P&L, volatility estimates)
   - Real-time recalculation as inputs change
   - <150 lines

3. **Create DecisionAidsPanel** (`src/components/risk/DecisionAidsPanel.tsx`):
   - Container combining both components
   - Contextual: shows aids relevant to current view (dashboard signals vs neg-risk opportunities)
   - Tabs or sections: "What-If Analysis", "Signal Confidence"
   - Subscribe to relevant stores
   - <120 lines

4. **Add confidence calculation logic**:
   - Option A: Simple based on recent signal accuracy (signals with historical outcomes)
   - Option B: Multi-factor (signal strength, market volatility, time of day)
   - Store in `trading-store` or separate `signal-metrics-store`
   - Update on new trade executions

5. **Integrate into existing pages**:
   - In `signals-panel.tsx`: add ConfidenceScore column or badge per signal
   - In `neg-risk-dashboard-page.tsx`: add confidence column to opportunities table
   - Add WhatIfCalculator to dashboard sidebar or modal

6. **Write tests**:
   - Test ConfidenceScore renders correct colors/ranges
   - Test WhatIfCalculator with sample inputs produces expected outputs
   - Test store logic for confidence calculation

## Files to Create

- `src/components/risk/WhatIfCalculator.tsx`
- `src/components/risk/ConfidenceScore.tsx`
- `src/components/risk/DecisionAidsPanel.tsx`
- `src/hooks/use-confidence-scores.ts` (optional, if logic is substantial)
- `src/components/risk/__tests__/decision-aids.test.tsx`

## Files to Modify

- `src/stores/trading-store.ts` (add historical performance data for confidence calc)
- `src/components/signals-panel.tsx` (embed confidence scores)
- `src/pages/neg-risk-dashboard-page.tsx` (show confidence in opportunities table)

## Success Criteria

- Confidence scores display correctly based on metrics
- What-if calculator provides useful range estimates
- Components integrate cleanly into existing signal/opportunity displays
- Calculations are performant and don't block UI
- Tests verify calculation logic

## Risk Assessment

- High: Misleading confidence scores → start with simple, transparent metrics; clearly label as "historical accuracy"
- Medium: Performance of real-time calculations → memoize results, throttle updates
- Low: User confusion about what-if vs guaranteed → clear disclaimers in UI
