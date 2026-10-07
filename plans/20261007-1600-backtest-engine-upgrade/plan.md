---
name: plan-backtest-engine-update
description: Plan for upgrading BacktestEngine with Almgren-Chriss slippage and DSR validation.
metadata:
  type: project
---

# Backtest Engine Upgrade Plan

**Objective:**
- Integrate `AlmgrenChrissModel` into `BacktestEngine`.
- Enable full DSR calculation with Sharpe bootstrap.
- Ensure tick sorting by timestamp.

**Phases:**
1. **Refactor BacktestEngine**: Update `run` to accept `dailyVolume` and slippage config, sort ticks by timestamp.
2. **Implement Metrics Logic**: Calculate Sharpe and DSR during simulation.
3. **Write Tests**: Verify slippage, sorting, and PnL/DSR calculation accuracy.

**Todo List:**
- [ ] Sort input ticks in constructor.
- [ ] Add `AlmgrenChrissModel` into `BacktestEngine`.
- [ ] Compute actual Sharpe ratio (returns series).
- [ ] Integrate `calculateDSR` with dummy nTrials/nBacktests.
- [ ] Add tests for slippage impact.
