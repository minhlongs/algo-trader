# Brainstorm Report: Wave 59 Hotspot Modularization (`171 LOC` & `170 LOC` -> `<= 169 LOC`)

## 1. Brainstorm Contract
- **Outcome:** Refactor all 30 remaining `171 LOC` (18 files) and `170 LOC` (12 files) TypeScript modules in `src/` down to `<= 169 LOC`, lowering the global `src/` file size ceiling from `171 LOC` to `169 LOC` (`Total files > 169 LOC: 0`).
- **Constraints:**
  - 100% backward compatibility on all exported classes, functions, types, and test assertions.
  - Zero `:any` types, zero `console.log` in production code, zero new `eslint-disable` comments.
  - Preserve all protected flows (Setup Wizard, Telegram Bot, NOWPayments + PayOS IPN webhook).
- **Non-goals:** Changing trading algorithms, risk thresholds, or database schemas.
- **Acceptance Criteria:**
  - `find src -name "*.ts" -exec wc -l {} + | awk '$1 > 169 && $2 != "total"'` returns 0 files.
  - `npm run typecheck` passes with 0 errors.
  - `npx vitest run` passes 100% of active suites covering all 30 refactored modules.

## 2. Target Files (30 Total)

### 18 Files at `171 LOC`
1. `src/risk/__tests__/kelly-position-sizer.test.ts`
2. `src/platform/referral/__tests__/cookie-attribution.test.ts`
3. `src/platform/marketing/content-distribution-daemon.ts`
4. `src/platform/billing/__tests__/enterprise-tam-notifier.test.ts`
5. `src/platform/audit/audit-log-service.ts`
6. `src/platform/api/routes/admin-marketplace-revenue-routes.ts`
7. `src/desk/wiring/qwen-signals-loop.ts`
8. `src/desk/wiring/paper-trading-persistence.ts`
9. `src/desk/telemetry/desk-metrics-registry.ts`
10. `src/desk/strategies/GruStrategy.test.ts`
11. `src/desk/strategies/examples/__tests__/02-sma-crossover-strategy.test.ts`
12. `src/desk/strategies/__tests__/ai-signal-adapter-validation.test.ts`
13. `src/desk/marl/microstructure/kyle-lambda-calculator.ts`
14. `src/desk/marl/hedging/hedge-compensatory-unwind.ts`
15. `src/desk/market-data/gap-detector.ts`
16. `src/desk/lsmc/lsmc-engine.ts`
17. `src/desk/daemon/engine-supervisor.ts`
18. `src/desk/arbitrage/__tests__/multi-leg-basket.test.ts`

### 12 Files at `170 LOC`
19. `src/durable-objects/__tests__/shard-manager-handlers.test.ts`
20. `src/desk/strategies/polymarket/multi-leg-hedge-entries.ts`
21. `src/desk/strategies/polymarket/base-polymarket-strategy.ts`
22. `src/desk/strategies/cross-platform-arb-detector.ts`
23. `src/desk/risk/__tests__/regime-aware-kelly-sizing-breaker.test.ts`
24. `src/desk/market-data/outlier-detection-algorithms.ts`
25. `src/desk/jobs/welcome-email-drip.ts`
26. `src/desk/gammaexotics/variance-swap-replicator.ts`
27. `src/desk/arbitrage/neg-risk-arb-scanner.ts`
28. `src/desk/arbitrage/connectors/hyperliquid-ws-connector.ts`
29. `src/alpha-lab/provenance/__tests__/research-ledger.test.ts`
30. `src/alpha-lab/orchestration/alpha-autonomy-runner.ts`

## 3. Unresolved Questions
- None.
