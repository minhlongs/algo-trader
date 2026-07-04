---
phase: 2
title: "Paper-mode E2E integration test"
status: completed
priority: P1
dependencies: [1]
---

# Phase 2: Paper-mode E2E Integration Test

## Overview

Write a paper-mode E2E integration test that exercises the full trading pipeline: Gamma API market fetch → strategy signal detection → paper order placement → position tracking → journal persistence. Uses real Gamma REST API data + paper executor. No API keys, no real money, safe for CI.

## Requirements

- Functional: 12-15 tests covering the full pipeline. Test file at `src/desk/polymarket/__tests__/live-trading-integration.test.ts`.
- Non-functional: Tests must work without any real API keys. Gamma API fetch must have 10s timeout. Tests skip gracefully if Gamma API is unreachable. No flaky tests (network dependency handled via skip-on-failure pattern).

## Architecture

```
Gamma API (real) ──→ Strategy.scanEntries() ──→ signal generation
                                                      │
LiveTradingOrchestrator (paper mode) ←────────────────┘
        │
        ├──→ BuildPolymarketAdapter(paperTrading: true)  →  PaperAdapter (no keys)
        ├──→ LiveOrderManager.submitAndTrack()            →  Paper order ID
        ├──→ LivePositionTracker (VWAP tracking)          →  P&L calculation
        ├──→ LiveExecutionGuard (safety checks)           →  approved/blocked
        └──→ LiveTradingJournal (JSONL persistence)       →  ~/.cashclaw/live-*
```

**Test strategy:** Each test category has a "smoke" test (real Gamma API) and a "unit" fallback (mocked). If Gamma API is unreachable, smoke tests skip and unit fallbacks still validate the logic.
<!-- Validation Session 1 — confirmed: skip-on-failure for Gamma API, os.tmpdir() for journal files -->

## Related Code Files

- **Create:** `src/desk/polymarket/__tests__/live-trading-integration.test.ts` — NEW (12-15 tests)
- **Read-only:** `src/desk/polymarket/live-trading-orchestrator.ts` — orchestrator under test
- **Read-only:** `src/desk/execution/polymarket-execution-adapter.ts` — adapter builder
- **Read-only:** `src/desk/execution/live-order-manager.ts` — order lifecycle
- **Read-only:** `src/desk/execution/live-position-tracker.ts` — position tracking
- **Read-only:** `src/desk/execution/live-execution-guard.ts` — safety gates
- **Read-only:** `src/desk/execution/live-trading-journal.ts` — audit trail
- **Read-only:** `src/desk/polymarket/gamma-client.ts` — Gamma API client
- **Read-only:** `src/desk/polymarket/strategy-registry.ts` — strategy lookup
- **Read-only:** `src/desk/strategies/polymarket/base-polymarket-strategy.ts` — strategy base class

## Implementation Steps

1. Create test file with describe blocks for each test category
2. **Gamma API connectivity tests** (2 tests, skip-on-failure):
   - Fetch real markets from Gamma API (10s timeout) → verify response has markets array. Skip if API unreachable.
   - Verify market schema: conditionId, question, outcomes, yesPrice present. Skip if API unreachable.
3. **Strategy scan tests** (2 tests):
   - Feed real markets to a V2 strategy (e.g., resolution-frontrunner-v2) → verify scanEntries returns signals
   - Feed empty markets array → verify empty signal list
4. **Paper order placement tests** (2 tests):
   - Create orchestrator in paper mode → place order → verify order ID returned
   - Place order with invalid tokenId → verify error handling
5. **Position tracking tests** (2 tests):
   - Open position → verify VWAP entry price → close → verify realized P&L
   - Add to existing position → verify VWAP recalculation
6. **Execution guard tests** (2 tests):
   - Submit order within position cap → verify approved
   - Submit order exceeding 2% position cap → verify blocked with reason
7. **Journal persistence tests** (2 tests, os.tmpdir() journal):
   - Execute trade → verify trades JSONL written to temp journal dir (NOT ~/.cashclaw/)
   - Stop orchestrator → verify positions JSON state saved to temp dir
   - Cleanup: delete temp journal files in afterEach
8. **Orchestrator lifecycle tests** (2 tests):
   - start() → place orders → stop() → verify clean shutdown
   - start() → stop() → start() again → verify state restored
9. **Error handling tests** (1-2 tests):
   - Gamma API timeout → verify graceful degradation
   - Invalid market data → verify skip and continue

## Success Criteria

- [ ] 12-15 integration tests pass without real API keys
- [ ] Gamma API smoke tests skip gracefully if API unreachable
- [ ] All mocked fallback tests pass consistently (no network dependency)
- [ ] Test file follows existing patterns (Vitest, vi.mock for isolation)
- [ ] No real orders placed, no real money spent
- [ ] Cleanup: temp journal files deleted in afterEach (os.tmpdir() for isolation)

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Gamma API rate-limited in CI | Skip smoke tests if API returns 429/503; fallback to mocked tests |
| Test flaky due to network | 10s timeout per test. Skip on first network failure per suite |
| Gamma API schema changes | Validate only required fields (conditionId, question, yesPrice) |
| Journal file pollution between tests | Use `os.tmpdir()` for journal files per test run, clean up in afterEach. No pollution of `~/.cashclaw/`. |
