---
title: "Phase 02: Alpha Lab High-Throughput Backtesting Engine"
description: "Implementation of ultra-fast tick-replay engine for backtesting."
status: pending
priority: P1
effort: 4h
---

## Overview
Reimplement the Backtesting engine using high-throughput TypeScript vectors to support 1M+ ticks/sec.

## Implementation Steps
1. Create `src/alpha-lab/backtest/simulation-engine.ts`: Implement efficient tick replay loop.
2. Implement `src/alpha-lab/backtest/slippage-model.ts`: Use Almgren-Chriss (2000) for micro-impact.
3. Update `src/alpha-lab/validation/bootstrap-sharpe.ts`: Refactor to Deflated Sharpe Ratio (DSR) logic.
4. Modularize backtest data providers (Level 2/3 ticks).

## Todo List
- [ ] Implement simulation loop (`<200 LOC` constraint).
- [ ] Build Almgren-Chriss impact model.
- [ ] Migrate Sharpe Ratio calculation to DSR.
- [ ] Achieve >= 1M ticks/sec perf benchmarks.

## Success Criteria
- Backtest engine benchmarks test at >1M ticks/sec.
- DSR correctly penalizes strategy selection bias.
