# Deep Brainstorm Report: Wave 49 Hotspot Modularization (`--deep`)

- **Date:** 2026-10-17
- **Repository:** `/Users/macbook/algo-trader` (`@mekong/algo-trader` / `cashclaw`)
- **Target Scope:** 4 `src/` test files (195–199 LOC) + 8 `src/` production source files (189 LOC)

---

## 1. Bounded Brainstorm Contract (`/ak-brainstorm --deep`)

| Field | Specification |
|:---|:---|
| **Outcome** | Decompose the 12 highest-LOC files in `src/` (4 test suites at 195–199 LOC and 8 production modules at 189 LOC) into single-responsibility submodules strictly `< 150 LOC` with 100% backward-compatible re-exports. |
| **Constraints** | 1. Strict `< 200 LOC` per file (ratcheted down to `< 150 LOC` for all touched files).<br>2. Zero `:any` types and zero new `eslint-disable` comments.<br>3. 100% backward compatibility on all public exports.<br>4. Protected Flows preserved (Setup Wizard, `@Sophia_Bbot`, NOWPayments + PayOS IPN). |
| **Non-goals** | No behavioral changes to LMSR pricing math, Raft consensus protocol, DB migration ordering, or strategy signal generation. |
| **Acceptance Criteria** | 1. All 12 target files reduced to `< 150 LOC`.<br>2. All extracted helper/fixture files `< 150 LOC`.<br>3. `npx vitest run` on all affected suites passes 100%.<br>4. `npm run typecheck` passes with `0` errors. |

---

## 2. Option Exploration & Architectural Decision

| Approach | Summary | Trade-off | Verdict |
|:---|:---|:---|:---|
| **A. Co-located Pure Helpers & Re-export Facades** | Extract pure math/helpers/types/fixtures into co-located `-helpers.ts`, `-registry.ts`, or `-fixtures.ts` modules and re-export from original entrypoints. | Adds 1 small co-located module per hotspot. | **RECOMMENDED & IMPLEMENTED** (KISS, DRY, zero breaking changes). |
| **B. Line-Formatting Compression Only** | Compress whitespace without extracting logical concerns. | Hurts readability and doesn't separate concerns. | Rejected. |
| **C. Breaking Import Paths Across Callers** | Move exports to new files and rewrite all imports across repo. | High blast radius and breaks external consumers. | Rejected. |

---

## 3. Wave 49 Refactoring Manifest

### Cluster A: `src/` Test Suites (195–199 LOC → `< 130 LOC`)
1. `src/alpha-lab/__tests__/run-experiment.test.ts` (199 LOC) → Extract hoisted fixtures (`run-experiment-test-fixtures.ts`).
2. `src/durable-objects/__tests__/shard-manager-handlers.test.ts` (198 LOC) → Extract builders (`shard-manager-test-helpers.ts`).
3. `src/desk/strategies/polymarket/__tests__/price-impact-estimator-config.test.ts` (195 LOC) → Split config/simulation vs asymmetry/EMA/book tests.
4. `src/desk/data/__tests__/funding-store.test.ts` (195 LOC) → Extract rate fixture helper & compact assertions.

### Cluster B: `src/` Production Source Files (189 LOC → `< 145 LOC`)
5. `src/platform/billing/license-service.ts` (189 LOC) → Compact methods and delegate ID/lookup helpers.
6. `src/desk/arbitrage/signal-scorer.ts` (189 LOC) → Extract pure scoring math & types (`signal-scorer-helpers.ts`).
7. `src/desk/amm/pricing/lmsr-pricing.ts` (189 LOC) → Extract Log-Sum-Exp vector math (`lmsr-pricing-math.ts`).
8. `src/desk/daemon/desk-status-server.ts` (189 LOC) → Extract default status/allocation builders (`desk-status-defaults.ts`).
9. `src/edge/consensus/edge-raft-lite-engine.ts` (189 LOC) → Compact lease and message construction.
10. `src/desk/strategies/probability-calibrator.ts` (189 LOC) → Extract types, `Semaphore`, and JSON parsers (`probability-calibrator-helpers.ts`).
11. `src/desk/strategies/polymarket/pivot-point-bounce-v2.ts` (189 LOC) → Extract pure pivot/bounce math (`pivot-point-bounce-helpers.ts`).
12. `src/db/migration-runner.ts` (189 LOC) → Extract `MIGRATIONS` list and `createSqlMigration` (`migration-registry.ts`).

---

## 4. Unresolved Questions
- None.
