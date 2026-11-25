# POLY-G10.3 — IC Day 0 Entry Contract

> **HISTORICAL AUDIT RECORD — STRATEGICALLY REBASELINED BY `#POLY-G10.5` (`2026-11-24`):** Preserved intact without erasure. `IC_DAY_0 = null`, `W_SKILL = 0`, `LIVE_TRADING_ENABLED = false`, `REAL_MONEY_TRADING = DISABLED`, and all 30d L2 / 500-fill / 150-OOS scientific floors remain 100% locked; Prerequisite #4 (`Written Vietnamese Legal Opinion`) is superseded by jurisdiction-aware `OPERATOR_JURISDICTION_ELIGIBILITY` + `RESEARCH_DATA_RIGHTS` in [`docs/poly-g10/13-GLOBAL-FIRST-STRATEGIC-REBASELINE.md`](./13-GLOBAL-FIRST-STRATEGIC-REBASELINE.md).

**Date:** 2026-11-24  
**Baseline:** `main` @ `68469cfeff09c82416778b1c09816d7005673c6c` (`G10_ENGINEERING_BASELINE = FROZEN`)  
**Builds On:** [`docs/poly-g10/05-90-DAY-IC-EXECUTION-PLAN.md`](./05-90-DAY-IC-EXECUTION-PLAN.md) & [`docs/poly-g8-6/06-IC-DAY0-ACTIVATION-CHECKLIST.md`](../poly-g8-6/06-IC-DAY0-ACTIVATION-CHECKLIST.md)  
**Current State:** `IC_DAY_0 = null` | `W_SKILL = 0` | `LIVE_TRADING_ENABLED = false` | `REAL_MONEY_TRADING = DISABLED`

---

## 1. Entry Rule (Fail-Closed)

`IC_DAY_0` **must remain `null`** until all **12 mandatory prerequisites** below are verified `PASS` with immutable evidence. Source-code readiness on `main` (`68469cfe`) does **not** equal empirical alpha and does **not** authorize starting Day 0.

---

## 2. Twelve Mandatory Prerequisites for `IC_DAY_0`

| # | Prerequisite | Current Status | Required Evidence Artifact to Flip `PASS` |
|---|---|---|---|
| 1 | **Frozen G10 Source Baseline** | `PASS` (`68469cfe`, CI/Security/Gate 8 green) | Verified `origin/main` SHA with zero unreviewed scorecard or guard regressions. |
| 2 | **Cloudflare B0 Access Closure (`#275`)** | `PARTIAL_OR_HOLD` (`TRACK_A = BLOCKED_OPERATOR_UI_ACTION`) | Both `poly-beta-dashboard.pages.dev` and `*.poly-beta-dashboard.pages.dev` protected by Founder-only Access `Allow` policies; unauthenticated probes rejected; Worker ingress still disabled. |
| 3 | **Written Polymarket / ICE Data License (`#278`)** | `HOLD` | Signed/written permission from Adventure One QSS, Inc. and/or ICE Data Services explicitly covering Use Cases 1 & 2 (Vietnam operator, ≤150 markets, WS/REST L2+trades, ≥30d WAL/Parquet, VPS + private R2). |
| 4 | **Written Vietnamese Legal Opinion (`LEGAL_G12`)** | `HOLD` | Dated written opinion from licensed Vietnamese counsel clearing Phase 1 Internal Research (`G12 = PASS`) with explicit compliance controls. |
| 5 | **All-In Collector Budget Sign-Off (`INFRA_BUDGET`)** | `HOLD` | Founder written approval of Scenario B + Scenario C total monthly + 90-day budget (VPS + R2 + RPC + backups + tax + quoted `DATA_LICENSE`) and hard monthly stop-trigger. |
| 6 | **Isolated Non-Root VPS & Private R2 Provisioned** | `HOLD` | Single hardened non-root Linux VPS in a contractually permitted region (zero geo-circumvention) + private R2 bucket (public access off, bucket-scoped write-only/research credentials). |
| 7 | **Strict Collector Key Isolation** | `HOLD` (code ready; runtime unprovisioned) | Verified zero trading API keys, zero wallet private keys, zero EIP-712 signers, and zero withdrawal credentials on collector host (`LIVE_TRADING_ENABLED = false`). |
| 8 | **Independent Settlement Verifier & Checkpoint Boundary** | `HOLD` (offline boundary merged; live verifier unprovisioned) | Independent checkpoint storage + Ed25519 verifier public-key registry outside collector/operator write scope; authorized Polygon PoS CTF `ConditionResolution` verifier configured. |
| 9 | **24-Hour Bounded Read-Only Qualification Drill** | `HOLD` | Auto-stop 24h run measuring real `bytes/market-hr`, WAL/Parquet compression ratios, 48h local spool headroom (<70% disk), and SHA-256 R2 manifest round-trip replay. |
| 10 | **7-Day Operational Qualification (Scenario B)** | `HOLD` | 7 consecutive days with 0 unrecovered WS sequence gaps, 0 hash-chain/checkpoint drift, verified R2 download-and-replay, and actual spend tracking within approved cap. *(Does **not** count toward the 30-day IC window.)* |
| 11 | **IC Repeated-Forecast & Scoring Policy Signed** | `HOLD` | Signed governance record locking `MIN_RECORDED_L2_DAYS = 30`, `MIN_QUALIFYING_MAKER_FILLS = 500`, `MIN_RESOLVED_OOS_FORECASTS = 150`, `w_skill = 0` until proven, and zero post-hoc threshold edits. |
| 12 | **Formal `IC_DAY_0` Timestamp Declaration** | `HOLD` (`IC_DAY_0 = null`) | Founder signs explicit `IC_DAY_0` UTC timestamp in `docs/poly-g8-4/ic-roadmap-manifest.json` after Prerequisites 1–11 are all `PASS`. |

---

## 3. Post-Day-0 90-Day Evidence Milestones (Blocked Until `IC_DAY_0 != null`)

| Window | Objective | Mandatory Quantitative & Governance Outputs |
|---|---|---|
| **Day 0–14** | Initial Qualifying L2 & OOS Capture | 14 qualifying UTC observation days recorded to R2 with SHA-256 manifests; prospective Market-Blind forecasts logged with tamper-evident timestamps; weekly cost & disk audit within cap. |
| **Day 15–30** | Complete 30-Day L2 & Maker Baseline | ≥30 qualifying L2 observation days (`30_DAY_L2`); initial offline Maker + NegRisk replay on genuine recorded L2 books; verify fee/latency/adverse-selection assumptions against live-recorded microstructure. |
| **Day 31–45** | Statistical Validation & First IC Checkpoint | Accumulate toward `≥500` qualifying simulated maker fills and `≥150` finalized on-chain OOS resolutions; compute Deflated Sharpe Ratio (DSR), Brier/log-loss skill score vs. market baseline; fail-closed if `NaN` or under-powered. |
| **Day 46–60** | Out-of-Sample Stress & Independent Audit | Regime-split OOS validation, fill-probability stress testing, fee-tier sensitivity, and independent adversarial audit of settlement receipts (`ConditionResolution`) and replay provenance. |
| **Day 61–90** | Final IC Scorecard & Go / Suspend Decision | Recompute frozen G10 IC scorecard (`evaluateICKpiScorecard`); issue binary **PASS (for G11 design review only)** or **REJECT / SUSPEND** verdict. Real-money trading remains `DISABLED` throughout all 90 days unless separately cleared by G11 + G12 + G13. |

---

## 4. Immediate Hard Kill & Abort Triggers

Stop collection immediately and freeze the program if any of the following occur:
1. Polymarket/ICE license is revoked, disputed, or exceeded in scope.
2. Vietnamese legal status changes or counsel revokes Phase 1 clearance.
3. Projected monthly spend exceeds the Founder-approved hard cap.
4. Collector local disk utilization exceeds `75%` or unrecovered sequence-gap rate violates qualifying-day rules.
5. Any trading credential, wallet key, or unauthorized signing capability is detected on the collector host.
6. Any attempt to edit IC thresholds post-hoc or claim empirical alpha before `30_DAY_L2`, `500` maker fills, and `150` finalized OOS resolutions are empirically satisfied.

```text
IC_DAY_0=null
30_DAY_L2=INSUFFICIENT_DATA
MAKER_ALPHA=INSUFFICIENT_DATA
NEGRISK_ALPHA=INSUFFICIENT_DATA
MARKET_BLIND_ALPHA=INSUFFICIENT_DATA
W_SKILL=0
LIVE_TRADING_ENABLED=false
REAL_MONEY_TRADING=DISABLED
USER_001_INVITE=HOLD
```
