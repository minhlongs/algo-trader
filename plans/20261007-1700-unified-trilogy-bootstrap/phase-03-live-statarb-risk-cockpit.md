# Phase 3: Live StatArb & Risk Cockpit

## Context
Integrates Cornish-Fisher Value-at-Risk (VaR), Expected Shortfall (CVaR) tail risk metrics, and automated compensatory unwind triggers into real-time statistical arbitrage order routing.

## Key Insights
- Pre-trade risk evaluation checks portfolio Cornish-Fisher VaR & CVaR against configured risk limits.
- Tail risk breaches automatically reject orders with actionable diagnostics.
- Post-trade execution failures or asymmetric fills trigger compensatory unwinds via `CompensatoryUnwindHandler`.

## Related Code Files
- `src/desk/risk/live-statarb-risk-types.ts`
- `src/desk/risk/live-statarb-risk-cockpit.ts`
- `src/desk/risk/live-statarb-risk-evaluator.ts`
- `tests/unit/desk/risk/live-statarb-risk-cockpit.test.ts`

## Success Criteria
- Strict modularization (<= 200 LOC per file).
- 0 TypeScript errors.
- 100% test coverage on VaR/CVaR risk evaluation, rejection logic, and compensatory unwind routing.
