# POLY-G5 Architecture ADR, Cloudflare Containers Evaluation, Cost Estimate & Failure Model

- **Status:** Accepted
- **Date:** 2026-11-15
- **Scope:** Release A (Cloudflare Public Beta — Paper Only) & Release B ($100 Live Pilot — Prepared, Disabled)

---

## 1. Context & Architectural Decision (ADR)

`algo-trader` (`b778f53a`) ships a comprehensive TypeScript + Rust hybrid Polymarket desk (`src/desk/polymarket/`, `sidecars/poly-book`, `sidecars/ghost-guard`), while existing Cloudflare production (`wrangler.toml`, `cashclaw.cc`, `api.cashclaw.cc/*`, `quant.cashclaw.cc`) serves CashClaw CEX/SaaS workloads.

### Decision
1. **Strict Infrastructure Isolation for Release A:**
   - **Frontend:** New Cloudflare Pages project `poly-beta-dashboard` (`poly-beta-dashboard.pages.dev`) built with `VITE_APP_MODE=poly-beta`. Zero changes to `cashclaw.cc` or `quant.cashclaw.cc`.
   - **API:** New Cloudflare Worker `poly-beta-api` configured via `wrangler.poly-beta.toml` with `routes = []` and `LIVE_TRADING_ENABLED = "false"`. Zero changes to `api.cashclaw.cc/*` or `algo-trader` Worker.
   - **Authoritative Ledger:** Dedicated Cloudflare D1 database `poly-beta-db` (`migrations/poly-beta-d1/0001-poly-beta-ledger.sql`) storing integer micro-USD (`10^-6`) balances, orders, fills, and sequenced ledger entries partitioned by `tenant_id`.
   - **Serialized State Engine:** Dedicated SQLite-backed Durable Object `TenantPaperEngine` (`idFromName(tenantId)`), using active-only `storage.setAlarm(10_000)` ticks bounded to active `RUNNING` sessions rather than a 5-minute Worker cron.
2. **Rust Sidecars (`poly-book`, `ghostguard`) Placement:**
   - Standard Cloudflare Workers run on V8 isolates and **cannot** execute compiled ELF/Mach-O Rust binaries via `child_process.spawn`.
   - For **Release A ($0 real funds)**, `poly-book` and `ghostguard` remain in the offline/CI verification harness (`npm run poly:sidecars -- drill-ghost`, `capture-sample`) and are not deployed as always-on cloud containers.

---

## 2. Cloudflare Containers vs External VPS Evaluation (Quant Engine)

| Dimension | Option 1: Worker + DO Only (Chosen for Release A) | Option 2: Cloudflare Containers (`poly-book` + `ghostguard`) | Option 3: Dedicated Bare-Metal / Low-Latency VPS |
|---|---|---|---|
| **Native Rust Binary Execution** | Not supported inside V8 isolate | Supported (Linux OCI container attached to DO) | Native Linux execution with pinned CPU cores |
| **Cold Start & Restart Latency** | `< 5ms` V8 isolate; `< 50ms` DO wake | `2s–8s` container cold start; requires warm-instance floor | `0ms` cold start under `systemd` supervisor |
| **Ephemeral Disk & WAL Durability** | Durable SQLite inside DO + D1 | **Ephemeral container disk:** `segment_*.wal` lost on container recycle unless continuously flushed to R2 | Persistent NVMe disk + periodic R2 Zstd Parquet upload |
| **WebSocket Reliability** | Short-poll Gamma/CLOB REST every 10s while active | Long-lived WS supported, but container eviction drops book state requiring snapshot resync | Continuous WS with sub-millisecond Castagnoli CRC32C WAL append |
| **Monthly Fixed Cost (1 User)** | **$0.00 – $5.00 / mo** | **~$18.00 – $35.00 / mo** (24/7 warm container CPU/RAM) | **~$12.00 – $24.00 / mo** (single Polygon-proximate VPS) |
| **Fit Verdict** | **Optimal for Release A** (Paper Beta, $0 customer funds) | Viable for stateless `ghostguard` tx verification bursts in Release B; poor fit for 30-day continuous `poly-book` WAL without R2 streaming | **Recommended for continuous 30-day L2 `poly-book` recording** prior to G11 sign-off |

---

## 3. Verified Monthly Cost Estimate (Single Beta Tester — Release A)

| Cloudflare Service | Plan / Tier | Expected 1-User Beta Usage | Included Allowance | Estimated Monthly Cost |
|---|---|---|---|---|
| **Cloudflare Pages** (`poly-beta-dashboard`) | Free / Existing Account | ~5 builds, `< 5,000` static requests | Unlimited static requests, 500 builds/mo | **$0.00** |
| **Cloudflare Workers** (`poly-beta-api`) | Free / Workers Paid ($5 base already on account) | `< 50,000` API requests/mo | 100k/day (Free) or 10M/mo (Paid) | **$0.00 incremental** ($0–$5 total) |
| **Durable Objects** (`TenantPaperEngine`) | Workers Paid (SQLite DO) | Active-only 10s `alarm()` bounded to max 180 ticks/run; `0` idle alarms when `PAUSED`/`STOPPED` | 1M requests + 400,000 GB-s included | **$0.00 incremental** |
| **Cloudflare D1** (`poly-beta-db`) | Free / Paid | `< 200,000` rows read/written | 5M reads/day, 100k writes/day | **$0.00** |
| **Cloudflare KV** (`POLY_BETA_KV`) | Free / Paid | Rate-limit counters + 10s market cache | 100k reads/day, 1k writes/day | **$0.00** |
| **Cloudflare R2** | Optional (Not bound in Release A) | `0 GB` in Release A | 10 GB/mo free | **$0.00** |
| **Total Incremental Spend** | | | | **$0.00 / month** (within $0–$5 ceiling) |

---

## 4. Operational Failure Model & Fail-Closed Guarantees

| Failure Scenario | Detection Mechanism | System Behavior (Fail-Closed) | Recovery Path |
|---|---|---|---|
| **Polymarket Gamma/CLOB API unreachable or HTTP 5xx** | `fetchSupportedBetaMarkets` HTTP status / catch | Returns `feedHealthy: false`; `TenantPaperEngine` transitions portfolio to `HALTED`, cancels DO `alarm()`, rejects new orders with `503 MARKET_UNAVAILABLE_FAIL_CLOSED` | User clicks `START` once upstream feed recovers |
| **Stale Market Data (`> 30,000ms` source age)** | `isMarketSnapshotFresh(market, nowMs)` | Rejects order with `STALE_MARKET_DATA`, sets `engine_state = 'HALTED'`, writes `HALT` audit log | Fresh market snapshot required before resume |
| **Portfolio Drawdown `>= 5.00%` (`$5.00` on `$100`)** | `refreshMarksAndDrawdown` (`currentDrawdownBps >= 500`) | Automatically latches `engine_state = 'HALTED'` (`DRAWDOWN_LIMIT_BREACH`) and cancels DO `alarm()` | Explicit review / reset |
| **Duplicate Order / Network Retry** | `UNIQUE (tenant_id, idempotency_key)` + pre-check | Returns existing `orderId` with `idempotentReplay: true`; zero double debit | Automatic idempotent response |
| **Durable Object Eviction / Cold Restart** | Durable SQLite storage + D1 ledger persistence | `alarm()` wakes DO, reads `tenantId` & `ticksRemaining` from durable storage, reconciles against D1 `beta_portfolios` | Seamless continuation; bounded at 180 ticks |
| **Misconfigured `LIVE_TRADING_ENABLED=true` on Beta Worker** | Top-level Worker guard in `poly-beta-worker.ts` | Entire Worker halts with `503 LIVE_TRADING_FORBIDDEN_IN_BETA` before routing any request | Revert env var or `wrangler rollback --config wrangler.poly-beta.toml` |
| **Ghost Fill (`status = 0` `TRANSFER_FROM_FAILED` in Release B)** | `GhostGuard` receipt + `eth_call` revert decoder | Latches `PolyKillSwitch` in `74.35ms` (`< 100ms` SLA) and issues `DELETE /cancel-all` | Manual incident post-mortem required |

## Unresolved Questions
- Whether continuous 30-day L2 `poly-book` capture for `G11` will be hosted on an external low-cost VPS with R2 upload or a local always-on Mac node (deferred until owner schedules Release B data collection).
