---
title: "Phase 04: Alpha Lab Strategy Optimizer & Walk-Forward Optimizer"
description: "Implementation of Purged & Embargoed Cross-Validation (CPCV) and Bayesian Optimizer (TPE)."
status: completed
priority: P1
effort: 4h
---

## Overview
Implement rigorous walk-forward optimization frameworks and TPE-based hyperparameter tuning to eliminate backtest overfitting.

## Implementation Steps
1. Extend `src/alpha-lab/walkforward/`: Enforce Purged & Embargoed CV logic within WFV. (DONE)
2. Build `src/alpha-lab/alpha-discovery/tpe-optimizer.ts`: TPE Bayesian hyperparameter tuning. (DONE)
3. Integrate MinBTL (Minimum Backtest Length) gating into alpha strategy discovery. (DONE)

## Todo List
- [x] Implement CPCV purging/embargo logic.
- [x] Build TPE Bayesian optimization runner.
- [x] Integrate MinBTL logic into Strategy Discovery pipeline.
- [x] Write rigorous validation tests.

## Success Criteria
- CPCV correctly eliminates lookahead leakage.
- TPE optimizer shows faster convergence towards hyperparameter optima compared to brute-force sweep.
