# Brainstorm: Polymarket Live Execution (Phase 39)

**Date:** 2026-07-01 | **Mode:** --deep --parallel | **Status:** ✅ Approved

## Problem Statement

All 38 infrastructure phases are complete (2,591 tests, 487 source files, 49 Polymarket strategies). But the platform has **zero live trading capability** — the Polymarket CLOB adapter has HMAC signatures stubbed out at `polymarket-adapter.ts:181`. Every strategy executes through `paper-executor.ts`. Target is $1M ARR via Polymarket (80%); current revenue is $0.

**Root cause:** Architecture built inside-out — all infrastructure (marketplace, backtesting, risk, KYC, content marketing) completed before the core value loop (strategy → order → fill → P&L) was connected to real money.

## Scout Findings Summary

| Finding | Detail |
|---------|--------|
| Polymarket strategies | 49 (all V2 via BasePolymarketStrategy) |
| CEX/DEX strategies | 0 |
| Live execution | **None** — CLOB adapter has TODO stub |
| Paper executor | Fully functional, used by all strategies |
| Risk management | Complete: VaR, CVaR, Kelly, circuit breaker, drawdown monitor |
| HMAC signing | `polymarket-signer.ts` has EIP-712; REST HMAC is missing |
| CLI | `algo scan`, `algo status`, `algo risk` — no trade commands |

## Evaluated Options

| Option | Verdict |
|--------|---------|
| **A: Live Execution** ✅ | Chosen — unblocks $1M ARR path immediately |
| B: Paper-to-Live Bridge | Safer but slower — adds manual step between signal and execution |
| C: CEX/DEX Expansion | Polymarket is 80% of target; CEX without live Polymarket makes no sense |
| D: Dashboard Polish | Zero revenue impact without live trading to monetize |
| E: Code Quality | Zero revenue impact |

## Approved Design

### Architecture

```
Strategy (BasePolymarketStrategy)
  → Trading Pipeline (mode: PAPER | LIVE)
    → [PAPER] PaperExecutor (existing, unchanged)
    → [LIVE]  PolymarketAdapter (HMAC-signed CLOB orders)
      → POST /order, GET /orders, DELETE /order
      → LivePositionTracker (open positions, P&L)
      → LiveOrderManager (place → monitor fill → confirm)
```

### Files (6 files, ~400 new lines)

| File | Action | Purpose |
|------|--------|---------|
| `polymarket-adapter.ts` | MODIFY | Implement HMAC signing + order CRUD |
| `live-position-tracker.ts` | NEW | Real-time positions, realized/unrealized P&L |
| `live-order-manager.ts` | NEW | Order lifecycle: submit → poll fill → confirm |
| `trading-pipeline.ts` | MODIFY | Add PAPER/LIVE mode switch |
| `live-trade-commands.ts` | NEW | CLI: `algo trade start/stop/status` |
| `live-execution-guard.ts` | NEW | Risk gates: max position, daily loss, circuit breaker |

### Risk Gates

- Max position: 2% bankroll (half-Kelly)
- Daily loss limit: 5% → stop all live
- Max concurrent: 10 positions
- Circuit breaker: 3 consecutive losses → revert to paper
- Default mode: PAPER (existing behavior preserved)
- All API keys from env vars only

### Acceptance Criteria

1. `POST /order` on CLOB returns real order ID with valid HMAC signature
2. `algo trade start --strategy=endgame-v2 --mode=live` places real orders
3. Daily loss limit triggers → all live trading stops
4. 49 existing paper strategies unchanged (PAPER is default mode)
5. 0 regressions: 2,591 tests still pass
6. Zero hardcoded secrets

### Out of Scope

- CEX/DEX adapters
- Automated strategy selection for live
- Leverage/margin trading
- Multi-account Polymarket

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Real money loss | Risk gates (2% position, 5% daily, circuit breaker) |
| API key exposure | Env vars only, `.env.example` template, `.gitignore` enforced |
| CLOB API changes | Polymarket API is stable; adapter uses documented endpoints |
| Strategy bugs in live | PAPER default — operator explicitly opts into LIVE per strategy |
| Operator error | CLI confirmation required for first live trade |

## Unresolved Questions

- None. Design is concrete and scoped.

## Next Step

Hand off to `/ck:plan` for implementation planning.
