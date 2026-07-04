---
phase: 6
title: "F: Strategy Comparison Report"
status: pending
priority: P2
dependencies: [phase-01-a-comprehensive-backtest, phase-02-b-strategy-performance-dashboard]
---

# Phase 6: Strategy Comparison Report

## Overview

Create a markdown report at `docs/strategy-performance-report.md` summarizing all backtest results. Top 10 by Sharpe, top 5 by win rate and PnL, risk-adjusted rankings. Public-facing document for blog/newsletter.

## Requirements

- Top 10 strategies by Sharpe ratio (min 10 trades)
- Top 5 by win rate
- Top 5 by total PnL
- Risk-adjusted ranking: Sharpe × (1 - maxDrawdown)
- Each section includes: rank, strategy name, key metrics, risk profile tag
- Brief methodology note (30-day backtest, $5K capital, Gamma historical data)
- Format: markdown, bilingual (Vietnamese + English per platform doctrine)

## Related Code Files

- **Create:** `docs/strategy-performance-report.md`
- **Read:** `reports/backtest-results.csv`

## Implementation Steps

1. Read backtest CSV into structured data
2. Compute rankings:
   - Sort by Sharpe descending → top 10
   - Sort by win rate descending → top 5
   - Sort by total PnL descending → top 5
   - Composite score: Sharpe × (1 - maxDrawdown) → top 10
3. Write report sections with tables
4. Add methodology caveats: sample period, capital assumptions, Gamma data limitations
5. Link from dashboard (Phase B) and blog/newsletter
6. `pnpm test` to verify no regressions

## Success Criteria

- [ ] `docs/strategy-performance-report.md` written with all sections
- [ ] Tables render correctly in GitHub/browser markdown
- [ ] Bilingual (VN + EN) per platform doctrine
- [ ] Methodology section explains limitations transparently
- [ ] All `pnpm test` passing

## Risk Assessment

- Backtest results may show poor performance across most strategies → present honestly as "data-driven transparency" rather than "proven winners"
- Report must not promise future returns → add disclaimer
