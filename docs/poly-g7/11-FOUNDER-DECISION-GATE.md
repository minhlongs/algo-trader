# POLY-G7 Founder Decision Gate (G7.3 -> G7.4 -> G11 / G12 / G13)

- **Document ID:** `POLY-G7-11`
- **Date:** 2026-11-19 (Asia/Saigon)
- **Current Global Posture:** `REAL_MONEY_TRADING: DISABLED` (`LIVE_TRADING_ENABLED=false`), `ECONOMIC_G11: HOLD`, `LEGAL_G12: HOLD`, `FOUNDER_G13: HOLD` (`CODE VERIFIED`).

---

## 1. Decision Gate Summary (Aligned with Executive Verdicts)

| Gate | Current Verdict | Evidence Label | Required Clearance Condition |
| --- | --- | --- | --- |
| `ARCHITECTURE_PARITY` | **PASS** | `CODE VERIFIED` | Already cleared (9/9 NautilusTrader parity points; Rust `ghost-guard` hardening tracked in `10-KNOWN-GAPS-AND-DEVIATIONS.md`). |
| `L2_CAPTURE_READINESS` | **PASS** | `LIVE PUBLIC READ-ONLY VERIFIED` | Already cleared (`CAPTURE_READY`, `636` WAL v3 frames, `0` corrupt/gaps, SHA-256 restore parity). |
| `30_DAY_L2_DATA` (G7.4a) | **INSUFFICIENT_DATA** | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` | `>= 30` continuous calendar days of valid WAL v3 segments with daily SHA-256 manifest + R2 restore parity. |
| `MAKER_ALPHA` (G7.4b) | **INSUFFICIENT_DATA** | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` | `>= 500` qualifying maker fills under `MAKER_ONLY_QUEUE_CONSERVATIVE`, 60s spread+rebate+reward `>= +15 bps`, ex-rewards dependency quantified. |
| `NEGRISK_ALPHA` (G7.4c) | **INSUFFICIENT_DATA** | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` | Real multi-leg cycles on recorded L2 data with completion `>= 92%`, `eth_call` preflight verified, lockup `< 10d` & `< 25%`. |
| `MARKET_BLIND_ALPHA` (G7.4d) | **INSUFFICIENT_DATA** | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` | `>= 150` resolved prospective OOS forecasts in hash-chained ledger, `BSS_OOS >= +0.02`, `bssLower95 > 0`, `ECE < 0.035`, rolling 100-market Brier beats market (`w_skill` auto-unlocks). |
| `ECONOMIC_G11` | **HOLD** | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` | `npx tsx scripts/poly-g7-scorecard.ts` returns `empiricalSampleGatePassed: true` and `11/11` KPIs = `PASS` (including 1.5x slippage/cancel and -50% rewards stress survival, deployable capacity `>= 25,000 pUSD`, `0` Ghost Fills). |
| `LEGAL_G12` | **HOLD** | `SOURCE VERIFIED` | Written sign-off from independent Vietnam legal counsel covering operator/entity posture, user/jurisdiction restrictions, and Polymarket Terms of Service compliance. |
| `FOUNDER_G13` | **HOLD** | `CODE VERIFIED` | Explicit Founder written authorization after both `ECONOMIC_G11 = GO` and `LEGAL_G12 = GO`, choosing pilot capital tier (`2,500–5,000 pUSD` conditional pilot vs `40,000–50,000 pUSD` MVC). |
| `REAL_MONEY_TRADING` | **DISABLED** | `CODE VERIFIED` | Remains `DISABLED` until `ECONOMIC_G11`, `LEGAL_G12`, and `FOUNDER_G13` are simultaneously `GO`. |

---

## 2. Capital Sizing Governance (Conditional Pilot vs MVC)

Do **not** conflate the `#275` POLY-G6 `$100` paper pilot with real-capital allocation (`SOURCE VERIFIED`):

- **Stage 0 — G7.3 / G7.4 Observation (`0 pUSD` real capital):** Read-only L2 WAL capture, conservative queue replay, and prospective market-blind ledger logging only (`CODE VERIFIED`).
- **Stage 1 — Conditional Real-Capital Pilot (`2,500–5,000 pUSD`):** Eligible **only** after `ECONOMIC_G11 = GO`, `LEGAL_G12 = GO`, `FOUNDER_G13 = GO`, Rust `ghost-guard` callback/defense hardening, and ExchangeV3 smoke (`#272`) pass. Subject to pilot MTM drawdown ceiling `< 2.5%` (`src/desk/polymarket/ic-kpi-scorecard.ts`, `mode: 'pilot'`) (`CODE VERIFIED`).
- **Stage 2 — Minimum Viable Capital (`40,000–50,000 pUSD` MVC):** Eligible **only** after the conditional pilot confirms live fill-rate divergence `< 20%`, zero ghost fills, `<= 1` token drift, and positive realized economic PnL net of fees, gas, inference, and infra (`SOURCE VERIFIED`, `CODE VERIFIED`).

---

## 3. Recommended Next Actions (Strict Execution Order)

1. **Merge POLY-G7 PR & Keep Live Trading Locked:** Review and merge `feat/poly-g7-ic-quant-validation` into `main` while keeping `LIVE_TRADING_ENABLED=false` and zero paid live-trading infrastructure active (`CODE VERIFIED`).
2. **Approve Low-Cost Read-Only Capture Host (G7.3 -> G7.4):** Provision a single non-trading VPS + Cloudflare R2 bucket to run daily rotated L2 WAL v3 capture and SHA-256 restore verification (`09-PROSPECTIVE-EVALUATION-PROTOCOL.md`) (`SOURCE VERIFIED`).
3. **Start Prospective Market-Blind Logging (Day 1 of G7.4):** Begin committing sealed prospective forecasts via `DurableMarketBlindLedger` + `createNodeJsonlAppendStore` and ingesting resolved Gamma/CTF outcomes daily toward the `150` resolved OOS floor (`CODE VERIFIED`).
4. **Engage Independent Vietnam Legal Counsel (`LEGAL_G12`) in Parallel:** Run the legal review during the 30–90 day observation window so `LEGAL_G12` does not become a serial bottleneck if `ECONOMIC_G11` passes (`SOURCE VERIFIED`).
5. **Harden Residual Engineering Items During G7.4:** Address Rust `ghost-guard` (`callback.rs` auth/retry + `defense.rs`), investigate prior `Load Test` CI failure (`b778f53a`), and triage `#271` (`disk-monitor` Node 26) (`SOURCE VERIFIED`).
6. **Convene IC Gate Review (`G11` + `G12` + `G13`) After Day 30–90:** Run `npx tsx scripts/poly-g7-scorecard.ts --input <empirical-bundle.json>`. If any KPI fails or `empiricalSampleGatePassed === false`, **HOLD or KILL** without deploying real capital (`CODE VERIFIED`).

---

## 4. Unresolved Questions

1. Does the Founder approve launching the read-only VPS + R2 capture job immediately after PR merge to start Day 1 of the 30-day L2 clock?
2. Should `LEGAL_G12` review be initiated in parallel with Day 1 of G7.4 or deferred until Day 30 empirical L2 replay results are inspected?
