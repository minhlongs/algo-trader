# Plan: Unified Trilogy Bootstrap (Backtest Engine, Autonomous GTM, Live StatArb Risk Cockpit)

**Status:** IN_PROGRESS
**Execution Mode:** Parallel 3-Lane Architecture
**Ratchet Gate 8 Invariants:** 100% test pass, 0 failures, 0 oversized files (>200 LOC in `src/`), 0 `:any`, 0 eslint disables.

---

## Phases & Ownership

### Phase 1: Backtest Engine Upgrade (Almgren-Chriss Slippage & DSR Bootstrapping)
- **Target Files:**
  - `src/alpha-lab/backtest/simulation-engine.ts`
  - `src/alpha-lab/backtest/slippage-model.ts`
  - `src/alpha-lab/backtest/__tests__/simulation-engine.test.ts`
  - `src/alpha-lab/backtest/__tests__/slippage-model.test.ts`
- **Deliverables:**
  - Non-linear Almgren-Chriss market impact modeling (permanent & temporary impact).
  - Chronological tick sorting with tie-breaking.
  - Return variance, annualized Sharpe ratio, and Deflated Sharpe Ratio (DSR) bootstrapping integration.
  - 100% unit test coverage for slippage and backtest simulation.

### Phase 2: Autonomous GTM & Marketing Engine (Lead Attribution & Tier Onboarding)
- **Target Files:**
  - `src/agentic/gtm/lead-attribution-types.ts`
  - `src/agentic/gtm/lead-attribution-service.ts`
  - `src/agentic/gtm/lead-scoring-engine.ts`
  - `tests/unit/agentic/gtm/lead-attribution-service.test.ts`
  - `tests/unit/agentic/gtm/lead-scoring-engine.test.ts`
- **Deliverables:**
  - Multi-network lead source attribution (TikTok, Shopee, Telegram, Web, Twitter).
  - Lead qualification and scoring engine (frequency, volume, tier propensity).
  - Tier onboarding verification (`BASIC`, `PREMIUM`, `ENTERPRISE`, `MASTER`).
  - Integration with campaign dispatching.

### Phase 3: Live StatArb & Risk Cockpit (Cornish-Fisher CVaR & Compensatory Unwind)
- **Target Files:**
  - `src/desk/risk/live-statarb-risk-types.ts`
  - `src/desk/risk/live-statarb-risk-cockpit.ts`
  - `src/desk/risk/live-statarb-risk-evaluator.ts`
  - `tests/unit/desk/risk/live-statarb-risk-cockpit.test.ts`
- **Deliverables:**
  - Real-time pre-trade Cornish-Fisher VaR & Expected Shortfall (CVaR) risk limits.
  - Dynamic tail risk evaluation and order execution approval/rejection.
  - Compensatory unwind trigger integration on asymmetric fills or risk breach.
  - Full branch coverage and test suite verification.
