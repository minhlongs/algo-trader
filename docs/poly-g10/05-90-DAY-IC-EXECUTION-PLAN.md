# POLY-G10 Phase 11 — 90-Day Investment Committee (IC) Execution Plan

**Date:** 2026-11-23
**PDF Reference:** `POLY ALPHA HUNTER v4` pp. 59–67, 74–75 (124 engineer-days, Gates 1–3, 11 IC KPIs, Hard REJECT Triggers)
**Current Clock:** `IC_DAY_0 = null` (clock has **not** started; all external pre-Day-0 gates remain `HOLD`)
**Approved Alpha Priority Order:** **A** (Adaptive Maker-Only MM + Regime Machine) → **B** (Event-Level NegRisk Arbitrage) → **C** (Primary-Source News Latency + Market-Blind Shrunk Fair-Value, `W_SKILL = 0`)

---

## 1. Pre-Day-0 External Gates (Must All Clear Before `IC_DAY_0`)

| Gate | Owner | Current Status | Required Artifact to Clear |
|---|---|---|---|
| **Track A — Data License (`#278`)** | Founder | `DATA_LICENSE = HOLD` | Written Polymarket / ICE permission covering 150-market automated L2 capture & 30d retention |
| **Track B — Cloudflare B0 Access** | Founder | `B0 = PARTIAL_OR_HOLD` | Two saved Founder-only Zero Trust Access apps (`poly-beta-dashboard.pages.dev` & `*.poly-beta-dashboard.pages.dev`) returning HTTP `302` anonymously |
| **Track C — Legal G12** | Vietnamese Counsel | `LEGAL_G12 = HOLD` | Dated written legal opinion clearing Research Group 1 (data collection + offline backtest) |
| **Track D — Budget Sign-Off** | Founder | `VPS_R2_ACTIVATION = HOLD` | Written approval of all-in monthly cost (VPS + R2 + Track A license) |

---

## 2. 90-Day Roadmap & IC Gates (PDF pp. 62–66)

| Window | PDF Effort | Scope & Deliverables | Hard Exit / Gate Criteria | Current Offline Repo Status |
|---|---|---|---|---|
| **Day 0–14** | 22 eng-days | Dependency/license audit, `poly-book` 150+ markets CRC32C WAL + Parquet, `Poly1271` Session Key isolation, `GhostGuard` verification | **7 continuous days** zero sequence/WAL corruption (qualification only; excluded from 30d evidence), `GhostGuard` catches `test_known_ghost_fill`, zero keys on collector host | Offline code & tests **PASS**; 7d live capture **BLOCKED_EXTERNAL** |
| **Day 15–30 (GATE 1)** | 24 eng-days | L2 queue-aware simulator (`100%` back-of-queue, `15–25%` cancel attr, `35/180 ms` log-normal cancel latency, 5-decimal CLOB V2 fees), port Strategy 3 & Strategy 2, start Market-Blind prospective forward log | **GATE 1:** Simulator fee math matches CLOB V2 to 5 decimals; Market-Blind hash-chained ledger logging prospectively (`w_skill = 0`) | Offline simulator & fee math **PASS**; live forward log **BLOCKED_EXTERNAL** |
| **Day 31–45** | 20 eng-days | Walk-Forward on **`>= 30 days` self-recorded L2**, Ablation (Regime Machine & OFI skew), `1.5x` cost/latency + `-50%` rewards + `+0.5¢` stress, Strategy 8 portfolio allocator | Prune any variant with `Deflated Sharpe < 1.0` or non-positive stressed Net PnL; wire maker fill/markout ledger into `ic-evidence-loader.ts` | Stress/bootstrap/allocator code **PASS**; `30_DAY_L2 = INSUFFICIENT_DATA` |
| **Day 46–60 (GATE 2 — IC Review)** | 20 eng-days | 24/7 Live Paper/Shadow Trading (`>= 14d` zero crash, `>= 21d` shadow for KPI 1), accumulate `>= 500` qualifying maker fills & `>= 150` finalized on-chain OOS Market-Blind resolutions | **GATE 2:** All 11 IC KPIs evaluated on real empirical samples (`L2 >= 30d`, `fills >= 500`, `OOS >= 150`); freeze AI branch (`w_skill = 0`) if `BSS_OOS < +0.02` or `ECE >= 0.035` | Scorecard & CLI fail-closed floors (`500` / `150`) **ENFORCED** |
| **Day 61–75** | 20 eng-days | Micro-Pilot (`2,500–5,000 pUSD`, 5–20 shares) **only after** `ECONOMIC_G11 = GO`, `LEGAL_G12 = GO`, `FOUNDER_G13 = GO`, and real Relayer V2 replacing `GnosisCtfSettlementRelayer` offline stub | Live-vs-Sim maker fill divergence `< 20%`, daily rebate/reward receipt via `GET /order-scoring`, live drills: 10s Heartbeat, HTTP 425, GhostGuard kill webhook, `merge_pusd`/`redeemPositions` | `REAL_MONEY_TRADING = DISABLED` |
| **Day 76–90 (GATE 3 — IC Verdict)** | 18 eng-days | Scale to `10,000–15,000 pUSD` only if 14d net positive & zero on-chain recon drift (`<= 1 token`); audit MTM / Realized / Settled PnL | **GATE 3:** **SCALE (`>= 40,000 pUSD`) / HOLD / REJECT** | `FOUNDER_G13 = HOLD` |

---

## 3. Hard REJECT / EXIT Triggers (PDF pp. 60–62, 67 Q10)

Immediately halt and issue **REJECT / EXIT** if any of the following occurs at Day 60–90:
1. Mean 60s `Realized Spread + Maker Rebate + Liquidity Reward < 0 bps` across `>= 500` qualifying fills.
2. Live-vs-Sim maker fill divergence `> 35%` flipping net expectancy negative.
3. Pilot MTM drawdown `>= 3.0%` (auto-cancel all open orders via `DELETE /cancel-all`).
4. Any unexplained Polygon on-chain position discrepancy `> 1 token` or any unguarded Ghost Fill (`status = 0`).
5. Any capital loss from key management, EIP-712 signing, or legal/custody failure.
6. Net PnL positive solely from 1 isolated event cluster, or flips negative under `+0.5¢` adverse slippage shock.
