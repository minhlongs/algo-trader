# Wave 54 Deep Brainstorm Report — Hotspot Modularization (`179 LOC` Boundary -> `<= 178 LOC`)

**Date:** 2026-10-17  
**Mode:** `/ak-bootstrap` -> `/ak-brainstorm --deep`  
**Scope:** All 18 remaining `179 LOC` files in `src/`

---

## 1. Opening Brainstorm Contract

- **Outcome:** Modularize and streamline all 18 files at `179 LOC` in `src/` so that **0 files in `src/` exceed `178 LOC`**, preserving 100% of public exports, strategy math, daemon/streamer protocols, and test coverage.
- **Constraints:**
  - Every file in `src/` strictly `<= 178 LOC`.
  - Zero `:any` types (and remove existing `as any` casts in `referral-routes.test.ts`), zero `console.log` in production code, zero new `eslint-disable` comments.
  - Protected flows untouched: Setup Wizard, Telegram Bot (`@Sophia_Bbot` — note `ThresholdAlerts` uses `telegramBotService` which remains 100% intact), NOWPayments/PayOS IPN webhooks.
- **Non-goals:** Changing strategy thresholds, altering DB schemas, or modifying API route signatures.
- **Acceptance Criteria:**
  1. `0` files in `src/` exceed `178 LOC`.
  2. `npm run typecheck` passes with `0` errors.
  3. All Vitest suites for modified modules pass 100%.

---

## 2. 5-Turn Socratic Cross-Examination (`--deep`)

1. **Boundary Audit:** What is the exact maximum file length in `src/` after Wave 53?
   - Empirical scan confirms `179 LOC` is the maximum across all `.ts`/`.tsx` files in `src/`, held by 18 files across `src/shared/`, `src/platform/`, `src/desk/`, and `src/alpha-lab/`.
2. **Protected Flow Verification (`threshold-alerts.ts`):** Does streamlining `src/platform/middleware/threshold-alerts.ts` affect Telegram Bot (`@Sophia_Bbot`)?
   - No. `ThresholdAlerts.initialize()` and `dispatchAlert()` preserve `telegramBotService.initialize()` and `telegramBotService.start()` identically.
3. **Polymarket Strategy Triad (`stale-quote-sniper-v2.ts`, `spread-mean-reversion-v2.ts`, `decay-rate-momentum-v2.ts`):** How do we reduce each below 178 LOC without altering tick behavior?
   - Keep all exported pure helpers (`calcVelocity`, `calcSpread`, `calcMomentumAtWindow`, etc.), `DEFAULT_CONFIG`, strategy classes, and legacy `create*Tick` factories intact while tightening comments and loop formatting to ~145–155 LOC each.
4. **Type Safety Upgrade (`referral-routes.test.ts`):** Can we eliminate the two `as any` casts in `src/platform/api/routes/__tests__/referral-routes.test.ts` while reducing its line count?
   - Yes, replacing `as any` with typed `ReferralCode` objects and compacting test assertions brings it to ~145 LOC with zero `any`.
5. **Verification Gate:** How is completion proven?
   - Python line-count scan verifying `Total files > 178 LOC: 0`, `npm run typecheck` with 0 errors, and `npx vitest run` across all 18 affected test/module suites.

---

## 3. Target Matrix (18 Files at `179 LOC` -> `<= 160 LOC`)

| # | File | Before | Target |
|---|------|--------|--------|
| 1 | `src/shared/db/__tests__/postgres-client.test.ts` | 179 LOC | ~148 LOC |
| 2 | `src/platform/middleware/threshold-alerts.ts` | 179 LOC | ~142 LOC |
| 3 | `src/platform/api/routes/__tests__/referral-routes.test.ts` | 179 LOC | ~145 LOC |
| 4 | `src/desk/strategies/polymarket/stale-quote-sniper-v2.ts` | 179 LOC | ~150 LOC |
| 5 | `src/desk/strategies/polymarket/spread-mean-reversion-v2.ts` | 179 LOC | ~148 LOC |
| 6 | `src/desk/strategies/polymarket/decay-rate-momentum-v2.ts` | 179 LOC | ~148 LOC |
| 7 | `src/desk/polymarket/__tests__/strategy-runner-types.test.ts` | 179 LOC | ~152 LOC |
| 8 | `src/desk/ml/model-registry.ts` | 179 LOC | ~148 LOC |
| 9 | `src/desk/feeds/whale-activity-feed.ts` | 179 LOC | ~145 LOC |
| 10 | `src/desk/execution/split-clob-entry.ts` | 179 LOC | ~140 LOC |
| 11 | `src/desk/execution/http2-connection-pool.ts` | 179 LOC | ~138 LOC |
| 12 | `src/desk/data/multi-venue-market-streamer.ts` | 179 LOC | ~155 LOC |
| 13 | `src/desk/daemon/desk-daemon.ts` | 179 LOC | ~158 LOC |
| 14 | `src/desk/backtesting/gamma-historical-provider.ts` | 179 LOC | ~142 LOC |
| 15 | `src/desk/arbitrage/profitability/profitability-types.ts` | 179 LOC | ~150 LOC |
| 16 | `src/desk/arbitrage/phase10_cosmic/daoGovernance/governance-proposer.ts` | 179 LOC | ~145 LOC |
| 17 | `src/alpha-lab/reports/__tests__/hypothesis-rules-regime.test.ts` | 179 LOC | ~152 LOC |
| 18 | `src/alpha-lab/attribution/__tests__/alpha-survival-gate.test.ts` | 179 LOC | ~152 LOC |

---

## Unresolved Questions
- None.
