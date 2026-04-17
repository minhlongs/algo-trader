---
title: Algo-Trader — Unshipped Audit Synthesis
date: 2026-04-17
sources:
  - plans/reports/scout-260417-0820-algo-trader-unshipped.md
  - plans/reports/researcher-260417-0820-algo-trader-claims-gap.md
branch: plan/raas-solo-platform-260416
last_pr: "#106 (OPEN, CI fixed d40201a)"
main_last_commit: e18e847
---

# Algo-Trader "Chưa Làm" Synthesis

## 🔴 Merge-blocking (PR #106)

1. **CI failure: signal-feed-routes + signal-subscription-routes** inferred Router types not portable — **FIXED commit `d40201a` (pushed)**. Next CI run should go green.
2. **Post-merge deferrals (H2/H3 from code review):**
   - Postgres persistence cho enterprise inquiry store (in-memory hiện tại)
   - Refactor `subscriber-executor.getRecentExecutions` dùng `tenantQuery()` helper

## 🟡 Revenue-blocking gaps

1. **Polymarket HMAC signature stub** (4 TODOs) — real-money orders BLOCKED. Paper trading OK, live trading impossible.
2. **a16z Phase 03 D1 live sync** — blocked by decision: $500 live capital threshold vs $5K minimum. Dashboard promises "live P&L" but still paper.
3. **Gap-Wiring plan (`260409-1630`)** — 5 phases PENDING, NEVER STARTED. NATS + AI validation pipeline planned but 0% shipped.
4. **Paper trading frozen 2026-04-16** — "150 trades, 14.6% edge" claim stale. Need fresh run or README scrub.

## 🟠 In-flight uncommitted (local working tree, user's hand)

9 untracked files never committed:
- `src/execution/dry-run-executor-performance.ts`, `dry-run-executor-types.ts`
- `src/interfaces/strategy-interface.ts`
- `src/strategies/gru-neural-strategy.{ts,test.ts}` (**224 lines, exceeds 200 LOC cap**)
- `src/strategies/polymarket/strategy-orderbook-helpers.ts`, `strategy-price-history.ts`, `strategy-trade-executor.ts`

Decision needed: commit to main hoặc feature branch, OR discard?

## 🟢 Claims vs shipped reality

| README claim | Shipped | Gap |
|---|---|---|
| "52+ strategies" | 33 Polymarket + 15 CEX/DEX/ML = 48 | -4 |
| "150 paper trades / 14.6% edge" | frozen 2026-04-16 | stale |
| "Dual-model inference" | README'd, wiring incomplete | partial |
| "A16Z dual-layer shipped" | Phases 01/02/04 merged | Phase 03 D1 still pending |
| "Better Auth + MFA" | Better Auth ✓, MFA no | MFA gap |
| "CashClaw 100/100 audit" | tests 789 pass, CI broken on PR #106 | main green |
| "Polar.sh + NowPayments" | NowPayments v1.1.1 done | Polar ok |
| "Cloudflare Pages prod" | quant.cashclaw.cc 200 OK | ✓ |
| "BYOK + Citadel attestation" | PR #106, simulation-mode only | unmerged + real TEE deferred |
| "Enterprise tier $49k-$499k" | PR #106 code exists | unmerged |

## 🔢 Tech debt

- **TODO/FIXME hot spots:**
  - Polymarket clob-client HMAC signing (4 TODOs) — **HIGH**
  - better-auth-client.ts email verify (2 TODOs)
  - d1-sync-worker (1 TODO: cron)
- **Lint violations:**
  - `gru-neural-strategy.ts` 224 lines > 200 cap
- **Stale plan headers:** `260410-2245-paper-trading` status says "pending" but commits show done.

## 📊 Plans landscape

| Plan | Status | Action |
|---|---|---|
| 260416-2312 RaaS Solo-Platform | ✓ DONE (7/7) | Merge PR #106 after CI green |
| 260416-1213 a16z dual-layer | 🟡 3/4 (Phase 03 pending) | Decide $500 vs $5K threshold |
| 260409-1523 DeepSeek arbitrage | ✓ DONE (6/6) | — |
| 260409-1630 Gap-Wiring NATS | 🔴 0/5 (NEVER STARTED) | Scope or archive |
| 260410-2245 Paper trading | ✓ DONE (plan stale) | Update plan.md header |
| 260324 algorithm-v2-master | ARCHIVED | — |
| 260321 algo-trade-raas | ARCHIVED | — |

## Top 10 "chưa làm" ranked

| # | Item | Effort | Unlocks |
|---|---|---|---|
| 1 | **CI fix** (signal routers) — done d40201a, wait for green | 0 | PR #106 merge |
| 2 | Merge PR #106 → main | 15 min | Solo-Platform deployed |
| 3 | Polymarket HMAC signature (4 TODOs) | 4h | Real-money order routing |
| 4 | a16z Phase 03 D1 threshold decision + cron | 1 day | Live P&L dashboard |
| 5 | Scrub stale "150 trades 14.6%" OR refresh paper trading | 2h | Narrative honesty |
| 6 | Decide uncommitted 9 files (commit/branch/discard) | 1h | Clean working tree |
| 7 | Fix gru-neural-strategy.ts >200 LOC (modularize) | 1h | Respect file-size rule |
| 8 | Sync paper-trading plan header to DONE | 5min | Plan hygiene |
| 9 | H2: Postgres persistence enterprise inquiry | 3h | Prod-ready enterprise |
| 10 | H3: `tenantQuery()` refactor in subscriber-executor | 1h | Consistency |

## Critical path → post-launch

```
[CI d40201a green] ──> [Merge PR #106] ──> [Smoke test prod]
                                             │
                                             ├──> [Polymarket HMAC]
                                             ├──> [a16z Phase 03 D1]
                                             └──> [Gap-Wiring: scope or archive]
```

## Open questions

1. **Threshold decision:** $500 live capital vs $5K — trigger for Phase 03 D1 sync?
2. **Gap-Wiring plan (260409-1630):** scope shrink, archive, hay schedule as next sprint?
3. **Uncommitted 9 files:** là WIP của feature branch (GruNeural refactor? strategy helpers?) hay discard?
4. **Paper-trading refresh:** chạy fresh 50-trade batch để update manifesto claim, hoặc scrub claim xuống "initial paper cohort"?
5. **Polymarket HMAC priority:** cần real-money live trước D-Day, hay defer sang v2.1?
6. **Enterprise inquiry Postgres migration (H2):** trước first prospect hay chấp nhận risk với in-memory tạm thời?
7. **PR #106 merge rhythm:** squash (92 commits) hay preserve history?

## References

- `plans/reports/scout-260417-0820-algo-trader-unshipped.md`
- `plans/reports/researcher-260417-0820-algo-trader-claims-gap.md`
- PR #106: https://github.com/longtho638-jpg/algo-trader/pull/106
