---
name: unified-trilogy-bootstrap-contract
description: Opening brainstorm contract for the 3-capability bootstrap (Backtest Engine Upgrade, Autonomous GTM Engine, Live StatArb Risk Cockpit)
metadata:
  type: project
---

# Unified Trilogy Bootstrap Contract

## 1. Outcome
Deliver end-to-end production wiring across all 3 key pillars of Algo-Trader:
1. **Backtest Engine Upgrade**: Integrate `AlmgrenChrissModel` market impact modeling, vectorized chronological tick sorting, returns variance metrics, and Deflated Sharpe Ratio (DSR) bootstrapping directly into `BacktestEngine`.
2. **Autonomous GTM & Marketing Engine**: Wire automated lead attribution, multi-network campaign scaling, and paying subscriber onboarding tier verification.
3. **Live StatArb & Risk Cockpit**: Wire Cornish-Fisher Value-at-Risk (VaR), Expected Shortfall (CVaR) tail risk metrics, and compensatory unwind execution directly into real-time order routing.

## 2. Constraints
- **Quality Ratchet Gate 8**: 100% test pass rate, 0 known failures, >= 86.00% branch coverage, >= 95.00% line coverage, 0 oversized files (>200 lines in `src/`), 0 banned imports, 0 eslint disables.
- **TypeScript**: `tsc --noEmit` must pass with 0 errors.
- **Architectural Rules**: YAGNI, KISS, DRY. All modules strictly modularized (<= 200 LOC per file).
- **Environment & Security**: No committed secrets, API keys, or plaintext credentials.

## 3. Non-Goals
- Real money live execution on mainnet without paper-gate maturation (stays gated behind 10-gate paper verification).
- Adding unneeded external heavyweight dependencies (e.g., third-party C2 or unnecessary bulky packages).
- Rewriting working database schemas or migrations unless required for new fields.

## 4. Acceptance Criteria
- `BacktestEngine.run()` accounts for Almgren-Chriss non-linear slippage and outputs valid Sharpe and DSR scores.
- GTM campaign attribution routes correctly track lead sources and trigger tier onboarding events.
- Live StatArb risk checks abort or trigger compensatory unwinds when Cornish-Fisher CVaR exceeds risk thresholds.
- Full test suite passes with 0 failures, zero oversized files, and 12/12 Gate 8 Quality Ratchet checks PASS.
