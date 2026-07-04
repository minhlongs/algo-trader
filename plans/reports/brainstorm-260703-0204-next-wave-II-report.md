# Next Wave II — Brainstorm Report

**Date:** 2026-07-03
**Context:** Following Next Wave I (Revenue + Trading + Infra + Platform), the platform is deployed with 2,798 tests green. This round focuses on activation: live trading, customer onboarding, real strategy logic, and dashboard UI.

**Mode:** --parallel (all 4 tracks in parallel implementation)

---

## Track A: Live Trading Activation

### Problem
23 strategy stubs exist in `src/desk/strategies/polymarket/` but ALL are no-ops:
```ts
export function createAdverseSelectionFilterTick(deps: StrategyDeps) {
  logger.warn('[AdverseSelectionFilter] Stub — no-op tick');
  return async () => {};
}
```
PAPER_MODE env var exists. Risk gates exist (2% bankroll, 5% daily loss, circuit breaker). Paper-mode E2E validated (26 tests). But no strategy actually trades.

### Approach: Progressive Live Rollout
1. Replace each stub with real `createXxxTick()` using CLOB v2 execution
2. Wrap every tick in risk gate checks (position size, bankroll, daily loss, circuit breaker)
3. Add paper→live verification period: stub must complete N paper trades with positive Sharpe before live is allowed
4. Dashboard shows paper/live status per strategy

### Files to modify (34 stubs + wiring)
- `src/desk/strategies/polymarket/{23 stub files}`
- `src/desk/polymarket/live-trading-orchestrator.ts` — paper/live switching
- `src/desk/wiring/strategy-wiring.ts` — verify wiring
- `src/desk/risk/` — verify risk gate integration

### Risk: HIGH — real money. Mitigation: paper verification period, risk gate wrapping, gradual rollout (enable 1-2 strategies first).

---

## Track B: Customer Onboarding Flow

### Problem
Pricing page exists (`src/platform/landing/public/pricing.html`). Trial-drip service exists (`trial-drip-service.ts`, 5-email sequence). NOWPayments IPN wired. But the signup→checkout→activation→first-run path has gaps.

### Approach: Close the Revenue Loop
1. **Pricing → Checkout**: Link pricing page CTA to NOWPayments invoice generation
2. **Payment → Activation**: Verify IPN callback triggers tier activation on payment confirm
3. **Welcome Flow**: Enable trial-drip email sequence on signup
4. **First-Run Experience**: Check for active subscription on dashboard load, redirect to pricing if none
5. **Dunning**: Already implemented — verify alert fires on payment failure

### Files to touch
- `src/platform/landing/public/pricing.html` — checkout CTA
- `src/platform/billing/trial-drip-service.ts` — enable email dispatch
- `src/platform/billing/dunning-service.ts` — verify webhook integration
- `src/platform/billing/nowpayments-service.ts` — verify IPN→activation
- `src/platform/api/routes/trial-drip-routes.ts` — verify endpoint

### Risk: LOW. All components exist, just wiring. No money at risk.

---

## Track C: Strategy Implementation

### Problem
23 named strategy stubs are empty. Each represents a real trading strategy type but has zero logic.

### Approach: Batch Implementation by Category
Group stubs into waves by complexity:

**Wave 1 (Simple — momentum/mean-reversion):**
- `momentum-exhaustion`, `mean-reversion`, `sentiment-momentum`, `session-vol-sniper`
- Each: 50-100 lines, uses standard market data signals
- Backtest with existing Gamma data

**Wave 2 (Medium — microstructure/arb):**
- `microstructure-alpha`, `order-flow-toxicity`, `book-imbalance-reversal`
- `pairs-stat-arb`, `cross-market-arb`, `cross-platform-basis`
- `funding-rate-arb`, `gamma-scalping`
- Each: 100-200 lines, needs order book + execution data

**Wave 3 (Complex — advanced):**
- `adverse-selection-filter`, `correlation-breakdown`, `entropy-scorer`
- `expiry-theta-decay`, `kalman-filter-tracker`, `liquidation-cascade`
- `liquidity-vacuum`, `market-maker`, `news-catalyst-fade`
- `smart-money-divergence`, `twap-accumulator`, `volatility-surface-arb`

### Files to create
- Fill in each stub file under `src/desk/strategies/polymarket/`
- Each needs: signal source, threshold logic, position sizing, exit criteria
- Add unit tests per strategy

### Risk: MEDIUM. Algorithmic complexity. Mitigation: backtest before live, paper-trade before enabling.

---

## Track E: Dashboard Frontend

### Problem
New API routes exist (analytics, API keys, badges, trial-drip, pricing) but the React dashboard at `dashboard/` doesn't surface them.

### Approach: Feature Pages
1. **Pricing/Plans Page**: Tier comparison table → CTA to checkout
2. **Subscription Analytics**: MRR chart, churn, LTV (consumes GET /api/analytics/subscription/*)
3. **API Key Management**: Create/revoke/rotate UI (consumes GET/POST/DELETE /api/v1/api-keys)
4. **Marketplace Badges**: Show badge status on listing cards
5. **Trial Status**: Show trial progress, email preferences

### Files to modify/create
- `dashboard/src/pages/pricing.tsx` — new
- `dashboard/src/pages/subscription-analytics.tsx` — new
- `dashboard/src/pages/api-keys.tsx` — new
- `dashboard/src/components/marketplace-badge.tsx` — new
- `dashboard/src/App.tsx` — add routes

### Risk: LOW. Pure frontend. API contracts already defined and tested.

---

## Dependencies

```
B (Onboarding) ── improves ──→ E (Dashboard)
                                    │
A (Live Trading) ── feeds ──→ C (Strategies)
                                    │
C (Strategies) ── needs ──→ A (for live execution verification)
```

All 4 tracks can run in parallel with isolated file ownership:
- A: `src/desk/strategies/polymarket/*`, `src/desk/polymarket/*`, `src/desk/risk/*`
- B: `src/platform/billing/*`, `src/platform/landing/*`, `src/platform/api/*`
- C: `src/desk/strategies/polymarket/*` (same files as A but adding logic to stubs)
- E: `dashboard/src/*`

**NOTE:** Tracks A and C both modify `src/desk/strategies/polymarket/*` — A wires execution into stubs, C adds logic. They can still run in parallel if each works on different stubs. Coordinate stub assignment to avoid conflicts.

---

## Success Criteria

- [ ] 3+ strategies execute real CLOB v2 orders in paper mode with positive Sharpe
- [ ] Signup → pricing → checkout → activation path works end-to-end
- [ ] 12+ stubs replaced with real strategy logic, backtested
- [ ] Dashboard shows: pricing plans, subscription analytics, API key management, marketplace badges
- [ ] 2,798+ tests pass (no regressions)
- [ ] 0 TypeScript errors

## Next Steps

Hand off to `/ck:plan --deep --parallel` with this report as context.
