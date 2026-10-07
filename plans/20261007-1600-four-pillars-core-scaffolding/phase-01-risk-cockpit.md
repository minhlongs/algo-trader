---
title: "Phase 01: Real-Time Risk Cockpit Engine & L0-L4 Killswitch Controller"
description: "Implementation of Cornish-Fisher VaR, CVaR, and L0-L4 cascading rollback controller."
status: pending
priority: P1
effort: 4h
---

## Overview
Implement the Risk Cockpit Dashboard and L0-L4 cascading killswitch system to improve resilience during market turmoil.

## Implementation Steps
1. Extend `src/desk/risk/value-at-risk.ts`: Add Cornish-Fisher expansion ($z_{CF}$) and semi-parametric VaR calculations.
2. Implement `src/desk/risk/expected-shortfall.ts`: Create CVaR calculator using standard normal approximation.
3. Update `src/rollback/tiered-rollback-controller.ts`: Wire L0-L4 circuit breaking logic to emit WebSocket events.
4. Integrate with `src/desk/risk/risk-gate-manager.ts` to enforce thresholds in live trading.

## Todo List
- [ ] Add `calculateCornishFisherVaR` to `value-at-risk.ts`.
- [ ] Implement `ExpectedShortfall` calculator.
- [ ] Update `TieredRollbackController` state machine.
- [ ] Write unit tests for all new modules (`<=200 LOC` per file).

## Success Criteria
- VaR engine correctly handles skewness and kurtosis.
- Killswitch properly transitions through L0-L4 states via unit tests.
