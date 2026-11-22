# POLY-G9.0 — Seven-Day Pilot Scorecard & OPC Unit Economics

**Date:** 2026-11-23  
**Pilot Status:** `USER_001_7_DAY_PILOT = NOT_STARTED`  
**Evaluation Basis:** Product usefulness, operational reliability, and safety invariants — **NOT** paper-trading profits.  
**Rule:** No pilot success may be claimed before genuine, authorized `USER_001` activity exists within a fixed 7-day UTC window.

---

## 1. Seven-Day Pilot Scorecard (11 Minimum Acceptance Criteria — Issue #275 / G9.0)

All aggregate metrics are computed by `scripts/poly-beta-pilot-metrics.mjs` over a fixed 7-day UTC window (`[windowStartUtc, windowEndUtc)`). Any metric whose denominator is `0` or whose source table is empty MUST emit `UNKNOWN` — never fabricated `100%` or `0%`.

| # | Acceptance Criterion | Metric Field (`poly-beta-pilot-metrics.mjs`) | Explicit Denominator / Window | Target / Gate |
|---|---|---|---|---|
| 1 | Authorized `USER_001` signup & single-use invite redemption | `inviteRedemptions` / `allowedSignups` | Distinct redeemed invites in 7d UTC window (`denom = 1`) | `1 / 1` redeemed, `0` replays |
| 2 | Zero unauthorized signups or cross-tenant reads | `unauthorizedAttemptsBlocked`, `crossTenantLeaks` | All auth/signup requests in 7d UTC window | `crossTenantLeaks = 0` |
| 3 | Paper-only lock invariant preserved (`LIVE_TRADING_ENABLED=false`) | `liveTradingEnabledObserved` | All health & session checks in 7d UTC window | `false` on `100%` of checks |
| 4 | Active pilot engagement across 7-day window | `activeDaysCount` | Distinct UTC days with authenticated activity (`denom = 7`) | `>= 3 / 7` active days |
| 5 | Market feed freshness & fail-closed behavior | `feedFreshRatio`, `staleFailClosedCount` | Total market feed fetches in 7d UTC window | Stale feeds (`>30s`) fail closed `100%` |
| 6 | Paper order execution & ledger integrity | `ledgerReconciliationErrors`, `orderCount` | All `beta_orders` + `beta_ledger_entries` for `USER_001` | `ledgerReconciliationErrors = 0` |
| 7 | Bounded DO alarm execution (no runaway alarms) | `maxSessionTicks`, `alarmOvershootCount` | All `TenantPaperEngine` sessions in 7d UTC window | `maxSessionTicks <= 180` (30 min cap) |
| 8 | API reliability (5xx error rate) | `serverErrorRate` | `http5xxCount / totalApiRequests` in 7d UTC window | `< 1%` (`UNKNOWN` if `0` requests) |
| 9 | Qualitative usefulness feedback captured | `feedbackSubmissions` | Count of `beta_feedback` rows from `USER_001` | `>= 1` structured submission |
| 10 | Disable / rollback drill verified without `algo-trader` impact | `disableDrillPassed`, `prodIsolationVerified` | Executed pre-pilot or post-pilot drill audit log | `true` / `0` prod touches |
| 11 | Self-service account deletion (`DELETE /api/beta/account`) verified | `accountPurgeVerified` | End-to-end purge check (D1 + DO) on test/closing tenant | `0` residual tenant rows |

---

## 2. OPC Unit-Economics View (Paper Beta Infrastructure Only)

> **Strict Separation:** This table models **One-Person Company (OPC) SaaS infrastructure cost** for the isolated Paper Beta harness. It is completely separate from Maker Alpha trading economics. The `$100` virtual paper balance represents **`$0` revenue** and **`$0` real AUM**.

### Resource Profile (1 Pilot Tester, 7 Days)
Assumptions: 1 active tester, up to 2 sessions/day, 30 min max per session (10s DO alarm bounded to `180` ticks/session = `360` alarm ticks/day = `2,520` alarm ticks/7d), ~500 dashboard/API requests/day.

| Cloudflare Resource | 7-Day Usage (1 Tester) | Monthly Extrapolation (1 Tester) | Free / $5 Paid Plan Included Allowance | Incremental Variable Cost |
|---|---|---|---|---|
| **Workers Requests** | ~3,500 req | ~15,000 req | 100k/day (Free) / 10M/mo ($5 Paid) | `$0.00` |
| **D1 Reads** | ~15,000 rows | ~65,000 rows | 5M/day (Free) / 25B/mo ($5 Paid) | `$0.00` |
| **D1 Writes** | ~5,000 rows | ~22,000 rows | 100k/day (Free) / 50M/mo ($5 Paid) | `$0.00` |
| **D1 Storage** | < 1 MB | < 2 MB | 500 MB (Free) / 5 GB ($5 Paid) | `$0.00` |
| **Durable Objects (Requests + Alarms)** | ~3,000 req + 2,520 alarms | ~24,000 total | 1M req/mo ($5 Paid) | `$0.00` |
| **Durable Objects (Duration)** | ~50 GB-s (bounded 180 ticks/session) | ~215 GB-s | 400,000 GB-s/mo ($5 Paid) | `$0.00` |
| **KV Reads / Writes** | ~3,500 reads / ~500 writes (60s cache) | ~15k reads / ~2k writes | 10M reads / 1M writes ($5 Paid) | `$0.00` |
| **Model / LLM / External API Costs** | `0` LLM calls; public read-only Gamma/CLOB | `0` LLM calls | N/A (signal-free paper execution harness) | `$0.00` |

### Summary Economics
- **Variable cost per tester (7-day pilot):** `~$0.00` (fits comfortably within Cloudflare Workers Free / `$5/mo` Paid base).
- **7-day total operating cost (1 tester):** `$0.00` incremental (covered by existing `$5/mo` Cloudflare Workers Paid plan, or `$0` on Free tier excluding DO Paid requirement).
- **Estimated marginal cost per additional active user (beyond included Paid allowances):** `< $0.02 / user / month` at 2 bounded 30-minute sessions/day, assuming zero LLM inference and shared 60s KV market cache.
- **Commercial caveat:** Infrastructure marginal cost excludes any future Polymarket / ICE Data Services commercial data-licensing fees (`DATA_LICENSE = HOLD`).
