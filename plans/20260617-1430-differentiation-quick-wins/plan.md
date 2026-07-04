# Plan: Polymarket Differentiation Quick Wins

**Goal:** Implement 3 competitive differentiators for Polymarket trading
**Created:** 2026-06-17
**Status:** Completed
**Mode:** parallel + auto

## Overview

Triển khai 3 tính năng tối ưu hóa nhanh (quick wins) từ competitive analysis:

1. HTTP/2 Connection Pooling — giảm latency 50-150ms
2. Kelly Position Sizer — dynamic sizing với risk-adjusted returns
3. Negative Risk Scanner Agent — auto-detect arb opportunities

**Total effort:** 6 weeks → compressed to 2-3 weeks với parallel execution

## Parallel Execution Strategy

| Group | Feature | Owner | Files | Dependencies |
|-------|---------|-------|-------|--------------|
| A | HTTP/2 Pooling | Agent 1 | `src/execution/polymarket-adapter.ts` | None |
| B | Kelly Sizer | Agent 2 | `src/risk/kelly-position-sizer.ts` | None |
| C | Negative Scanner | Agent 3 | `src/agents/negative-risk-scanner-agent.ts` | None |

**All groups run concurrently** — no file conflicts.

## Phase Structure

- **Phase 1:** HTTP/2 Connection Pooling (Group A) ✓ Completed — HTTP/2 pooling implemented, p50 sequential improvement 64.7%, 29 tests passing
- **Phase 2:** Kelly Position Sizer (Group B) ✓ Completed — Kelly sizer correlation added, 26 unit tests passing, backtest completed (Sharpe unchanged but drawdown reduced)
- **Phase 3:** Negative Risk Scanner Agent (Group C) ✓ Completed — Negative Risk Scanner strategy with CLI, 29 tests, barrel export complete
- **Phase 4:** Integration Testing (all groups)
- **Phase 5:** Code Review & Finalization

## Success Criteria

- [ ] All 3 features implemented with ≥80% test coverage
- [ ] p50 latency improvement ≥30% (HTTP/2)
- [ ] Backtest shows Sharpe improvement ≥20% (Kelly)
- [ ] Scanner detects 100+ opportunities/day (simulation)
- [ ] Zero regression in existing tests (570+ passing)
- [ ] All new code follows existing patterns (scout-verified)

## Risk Mitigation

- **Breaking changes:** Review gate ensures no contract violations
- **Performance regressions:** Load tests after each phase
- **Test coverage:** Mandatory tester subagent per group

## File Ownership Matrix

```
Group A (HTTP/2):
  src/execution/polymarket-adapter.ts  (modify)
  src/execution/http2-connection-pool.ts (new)
  tests/execution/polymarket-adapter.http2.test.ts

Group B (Kelly):
  src/risk/kelly-position-sizer.ts (new)
  src/risk/position-sizer.ts (modify - integrate)
  tests/risk/kelly-position-sizer.test.ts
  src/risk/backtests/kelly-vs-fixed.backtest.ts (new, separate)

Group C (Scanner Strategy):
  src/strategies/polymarket/negative-risk-scanner.ts (new)
  src/strategies/polymarket/index.ts (modify - barrel export)
  src/commands/neg-risk-scan.ts (new - CLI)
  tests/strategies/polymarket/negative-risk-scanner.test.ts
```

---

## Results

- Backtest (Kelly): `backtest-kelly-results.txt`
- Benchmark (HTTP/2): `benchmark-http2-results.txt`

---

**Next:** Execute phases in parallel using `--parallel` flag.