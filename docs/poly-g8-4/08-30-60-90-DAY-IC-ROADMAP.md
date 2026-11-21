# POLY-G8.4 — 30 / 60 / 90-Day IC Quant Roadmap Reconciliation

- **Document ID:** `POLY-G8.4-08`
- **Date:** 2026-11-21
- **Machine-Readable Companion:** `docs/poly-g8-4/ic-roadmap-manifest.json`

---

## 1. Scheduling Rule (`IC_DAY_0`)

- **`IC_DAY_0` Definition:** The first calendar date of a genuinely authorized, legally permitted, and verified continuous L2 data-observation interval.
- **Current Value:** `IC_DAY_0 = null` (`NOT_STARTED`).
- Coding start dates, PDF publication date (2026-11-12), and the 30-second public capture drill (2026-11-19) do **not** start the empirical observation clock.
- Six independent dimensions are tracked separately in `ic-roadmap-manifest.json`: **Engineering Readiness**, **Permitted Operational Readiness**, **Empirical Coverage**, **Statistical Acceptance**, **Legal Eligibility**, and **Founder Capital Approval**.

---

## 2. Six-Stage IC Roadmap Status

| Stage | Window | Engineering Status | Empirical / Operational Status | Entry Gate / Blockers | Acceptance Criteria |
|---|---|---|---|---|---|
| **Stage 1** | **Day 0–14** (Audit, Data Ingest & Key Isolation) | `TESTED` (offline fixtures, 5-repo audit, GhostGuard 54/54, poly-book 58/58, uploader 31/31) | `NOT_STARTED` (`0/7` continuous qualifying days) | `DATA_LICENSE=HOLD`, `INFRA_BUDGET=HOLD`, `VPS_R2_ACTIVATION=HOLD`, `LINUX_SYSTEMD_RUNTIME=NOT_TESTED` | 5-repo license matrix, Linux systemd + live R2 SHA-256 verification, 150+ eligible markets, 7 continuous qualifying WAL/Parquet days, read-only no-trading proof |
| **Stage 2** | **Day 15–30** (Execution Simulator & Baseline — **Gate 1**) | `TESTED` (conservative queue sim, CLOB V2 dynamic fees, execution model separation) | `NOT_STARTED` (`0/30` L2 days) | Stage 1 complete + genuine Parquet data | Deterministic point-in-time replay, 5-decimal fee rounding verified, zero lookahead, YES/NO accounting, reproducible seeds, baseline on genuine eligible data (no synthetic-only PASS) |
| **Stage 3** | **Day 31–45** (Anchored Walk-Forward & Adversarial Stress) | `PARTIAL` (harness exists; awaiting real 30d dataset) | `NOT_STARTED` (`0/30` L2 days) | `>=30` continuous qualifying L2 days | Chronological train/cal/test split, 4 liquidity/event regimes, ±20% param sensitivity, Regime/OFI/Queue ablations, 1.5x cost/slippage & 1.5x cancel-latency stress, 50% reward haircut, 95% bootstrap CI, Deflated Sharpe |
| **Stage 4** | **Day 46–60** (Live Data Paper/Shadow & Calibration — **Gate 2**) | `TESTED` (Market-Blind pipeline, `w_skill=0` lock, separate Maker/NegRisk/AI gates) | `NOT_STARTED` (`0/14` shadow days, `0/150` OOS forecasts) | Stage 3 PASS + data rights permit shadow feed | `>=14` real paper/shadow days, live-vs-replay comparison, 5/60/300s markout, multi-leg partial-fill/unwind stats, `>=150` resolved prospective OOS forecasts, Brier/ECE report; independent PASS/FAIL/INSUFFICIENT_DATA per alpha |
| **Stage 5** | **Day 61–75** (Shadow Verification & Conditional Micro-Pilot) | `DESIGN_ONLY` (`LIVE_TRADING_ENABLED=false`) | `HOLD` (**NOT AUTHORIZED**) | `ECONOMIC_G11=PASS`, `LEGAL_G12=PASS`, `FOUNDER_G13=PASS`, Issue `#272` signing parity | Legal & IC checklists, heartbeat 10s failure drill, HTTP 425 cooldown drill, GhostGuard emergency-stop drill, offline merge/redeem sim, daily reconciliation spec; micro-pilot (`2,500–5,000 pUSD`) remains `HOLD` |
| **Stage 6** | **Day 76–90** (Capacity, Tail Risk & Investment Decision — **Gate 3**) | `DESIGN_ONLY` | `NOT_STARTED` | Stage 5 conditional pilot & capacity study | Capacity curve (`10k–15k` -> `40k+ pUSD` research target), marginal slippage, reward dilution, separated MTM/Realized/Settled PnL, 99% CVaR, UMA dispute/resolution risk, infra drag; explicit IC verdict (`SCALE` / `HOLD` / `REJECT`) |

---

## 3. Hard Anti-Conflation Rules

1. Engineering `TESTED` or CI `PASS` never upgrades any empirical stage from `NOT_STARTED` / `INSUFFICIENT_DATA` to `PASS`.
2. A failed AI/News gate (`Alpha C`) never silently contaminates or approves Maker (`Alpha A`) or NegRisk (`Alpha B`); `w_skill=0` remains locked until `BSS_OOS >= +0.02` and `ECE < 0.035` over `>=150` genuinely resolved prospective forecasts.
3. No real wallet, Poly1271 key creation, deposit, or live ExchangeV3 signing is authorized anywhere in Stages 1–6 without explicit new Founder + Legal + IC approval.
