---
title: "Phase 1 — Share-Deduction Merge Parity Guard & Negative-Risk Exit V2 Fees"
phase: 1
status: completed
tdd: true
---

# Phase 1: Share-Deduction Merge Parity Guard & Negative-Risk Exit V2 Fees

## 1. Files Owned

- `src/desk/arbitrage/executors/split-merge-executor-helpers.ts` (`<= 200` LOC)
- `src/desk/arbitrage/executors/split-merge-executor.ts` (`<= 200` LOC)
- `src/desk/strategies/polymarket/negative-risk-types.ts` (`<= 200` LOC)
- `src/desk/strategies/polymarket/negative-risk-entry.ts` (`<= 200` LOC)
- `src/desk/strategies/polymarket/negative-risk-exit.ts` (`<= 200` LOC)
- `tests/unit/desk/arbitrage/executors/split-merge-executor.test.ts` (`<= 200` LOC)
- `src/desk/strategies/polymarket/__tests__/negative-risk-entry.test.ts` (`<= 200` LOC)
- `src/desk/strategies/polymarket/__tests__/negative-risk-exit.test.ts` (`<= 200` LOC)

## 2. Step-by-Step Tasks (TDD)

1. **Red:** Add tests in `tests/unit/desk/arbitrage/executors/split-merge-executor.test.ts`, `src/desk/strategies/polymarket/__tests__/negative-risk-entry.test.ts`, and `src/desk/strategies/polymarket/__tests__/negative-risk-exit.test.ts` asserting:
   - `evaluateTakerBuyMergeParity(100, 100, 100, 0.45, 0.45, 'crypto')` refuses full 100-pair merge (`allowed: false`, `reason: 'SHARE_DEDUCTION_SHORTFALL'`, `mergeablePairs < 100`, `shortfallPairs > 0`).
   - `evaluateTakerBuyMergeParity(100, parity.grossUpYesShares, parity.grossUpNoShares, 0.45, 0.45, 'crypto')` allows full 100-pair merge (`allowed: true`, `mergeablePairs >= 100`).
   - `SplitMergeArbitrageExecutor({ enforceClobV2MergeParity: true, category: 'crypto' })` rejects an opportunity whose 100 YES + 100 NO legs suffer share-deduction shortfall, and accepts when leg amounts are grossed up (`grossUpYesShares`, `grossUpNoShares`).
   - `scanEntries` skips when `requireFullRequestedPairMerge: true` and `grossUpForShareDeduction` is not enabled on a fee-bearing market, or gross-ups leg token counts when `grossUpForShareDeduction: true`.
   - `evaluateExits` emits real CLOB V2 taker sell fees on `trade.executed` events instead of `'0'`.
2. **Green:** Implement `evaluateTakerBuyMergeParity`, `computeSplitMergePayoutV2`, `SplitMergeArbitrageExecutor` parity enforcement, `negative-risk-entry` parity guard / gross-up option, and `negative-risk-exit` V2 fee calculation.
3. **Verify:** Run `npx vitest run`, `node scripts/oversized-file-check.mjs`, `npm run check:leaderboard`, and `npm run typecheck`.
