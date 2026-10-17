# Wave 50 Hotspot Modularization Brainstorm (`--deep`)

- **Date:** 2026-10-17
- **Mode:** `/ak-bootstrap` -> `/ak-brainstorm --deep`
- **Target:** All 11 files sitting at the 188-LOC ceiling in `src/`, ratcheting the global `src/` maximum to `<= 187 LOC`.

## 1. Brainstorm Contract

- **Outcome:** Decompose all 11 188-LOC files in `src/` into single-responsibility modules strictly `< 155 LOC`, lowering the global `src/` ceiling from 188 LOC to 187 LOC with 100% backward-compatible exports.
- **Constraints:**
  - Strictly `< 200 LOC` per file (target `< 155 LOC` for every touched file).
  - Zero `:any` types, zero `console.log` in production code, zero new `eslint-disable` comments.
  - Protected Flows intact: Setup Wizard, `@Sophia_Bbot` Telegram commands (`/campaign`, `/status`, `/results`, `/balance`, `/positions`, `/pnl`), and NOWPayments/PayOS IPN webhooks.
- **Non-goals:** No behavior changes, no route contract changes, no schema migrations.
- **Acceptance Criteria:**
  - `find src -name "*.ts" -exec wc -l {} + | sort -rn | head -n 5` shows max LOC `<= 187`.
  - `npm run typecheck` passes with 0 errors.
  - All unit tests covering the 11 refactored modules pass 100%.

## 2. Target Inventory & Decomposition Strategy (11 Files at 188 LOC)

| # | File (188 LOC) | Extracted Helper / Submodule | Target LOC |
|---|----------------|------------------------------|------------|
| 1 | `src/shared/utils/compression-stream.ts` | Move `createJsonArrayReadableStream` to `compression-stream-helpers.ts` | ~140 / ~130 |
| 2 | `src/platform/telegram/handlers/data-handlers.ts` | Extract `aggregateLicenseKeysPnl` to `data-handlers-helpers.ts` (eliminates duplicate loop across `/pnl` & `/results`) | ~125 / ~60 |
| 3 | `src/platform/notifications/sms-service.ts` | Extract Redis rate-limit & daily-counter helpers to `sms-redis-limiter.ts` | ~130 / ~65 |
| 4 | `src/platform/api/routes/compliance-routes.ts` | Extract rules registry, audit ring buffer, and Zod schema to `compliance-routes-state.ts` | ~115 / ~85 |
| 5 | `src/desk/strategies/polymarket/order-flow-toxicity.ts` | Extract `estimateTradeImbalance`, `calcVPIN`, `calcToxicityZScore` to `order-flow-toxicity-math.ts` + re-export | ~125 / ~75 |
| 6 | `src/desk/risk/portfolio-correlation.ts` | Extract `pearsonCorrelation`, `classifyStrength`, `mean` to `portfolio-correlation-math.ts` + re-export | ~130 / ~65 |
| 7 | `src/desk/polymarket/__tests__/strategy-runner-event-handlers.test.ts` | Extract `makeCtx` and `makePayload` test builders to `strategy-runner-event-handlers-fixtures.ts` | ~145 / ~45 |
| 8 | `src/desk/marl/hedging/delta-neutral-coordinator.ts` | Extract schemas, types, and `ToleranceBandRebalanceTrigger` to `delta-neutral-coordinator-types.ts` + re-export | ~125 / ~75 |
| 9 | `src/api/v1/risk/caculation/__tests__/repository.test.ts` | Compact verbose test formatting and extract `RESULT` + `makeRepo` fixture helper | ~140 |
| 10 | `src/api/routes/provider-onboarding-routes.ts` | Extract `applySchema`, `idParamSchema`, and `serializeProviderApplication` to `provider-onboarding-helpers.ts` | ~140 / ~50 |
| 11 | `src/alpha-lab/experiments/splitter.ts` | Extract `assertValidRatios` and `resolveWindows` to `splitter-windows.ts` | ~115 / ~75 |

## 3. Unresolved Questions

- None. All 11 files have clear, deterministic module boundaries with zero public API changes.
