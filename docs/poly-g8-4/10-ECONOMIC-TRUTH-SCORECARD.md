# POLY-G8.4 — Canonical Economic Truth Scorecard (11 Mandatory KPIs)

- **Document ID:** `POLY-G8.4-10`
- **Date:** 2026-11-21
- **Canonical CLI:** `npx tsx scripts/poly-g7-scorecard.ts` (aligned to `data/polymarket/market-blind-prospective.jsonl` in PR `#285` `784d6e98`)
- **Provenance:** Executed on `main` (`7319b8d0`) and PR `#285` (`784d6e98`), exit code `0`, `empiricalSampleGatePassed: false`.

---

## 1. Empirical Sample Denominators (Verified Observed)

| Denominator | Observed | Required Floor | Status |
|---|---|---|---|
| `recordedL2Days` (continuous qualifying L2 WAL days) | `0` | `30` days | `INSUFFICIENT_DATA` |
| `qualifyingMakerFills` (conservative queue / shadow fills) | `0` | `500` fills | `INSUFFICIENT_DATA` |
| `resolvedOosForecasts` (attested prospective resolutions) | `0` | `150` forecasts | `INSUFFICIENT_DATA` |

---

## 2. Eleven Mandatory IC KPI Dimensions

| KPI # | Dimension | IC Target / Stress Condition | Observed Value | Status |
|---|---|---|---|---|
| **KPI 1** | **Net Economic PnL** | Bootstrap 95% CI LB `> 0 pUSD` after fees, slippage, relayer/gas, hedge, infra, inference, and 4.5% annual capital-cost historical IC research assumption (under required stress) | `UNKNOWN` | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` |
| **KPI 2** | **Sharpe / Sortino** | Sortino `>= 2.0` & Deflated Sharpe `>= 1.5` (multiple-testing adjusted) | `UNKNOWN` | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` |
| **KPI 3** | **Drawdown** | Simulation max MTM drawdown `< 4.0%`; pilot caps & emergency stops formally reconciled | `UNKNOWN` | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` |
| **KPI 4** | **Profit Factor** | Maker `>= 1.35`; Event/NegRisk `>= 1.60` | `UNKNOWN` | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` |
| **KPI 5** | **Fill Quality** | Conservative behind-queue model; multi-leg completion `>= 92%`; Live-vs-Sim separated from Shadow-vs-Sim | `UNKNOWN` | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` |
| **KPI 6** | **Adverse Selection** | Markout at 5s / 60s / 300s; net realized spread + confirmed rewards `>= 15 bps` | `UNKNOWN` | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` |
| **KPI 7** | **Probabilistic Skill** | Genuine OOS Brier; `BSS_OOS >= +0.02` vs market baseline; `ECE < 0.035`; rolling calibration | `UNKNOWN` | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` |
| **KPI 8** | **Capital Utilization** | Weighted lockup time, locked-capital fraction, delayed resolution & dispute burden | `UNKNOWN` | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` |
| **KPI 9** | **Turnover & Cost Stress** | Survives `1.5x` adverse cost, `+0.5` tick slippage, and `50%` reward reduction / incentive loss | `UNKNOWN` | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` |
| **KPI 10** | **Capacity** | Net edge vs deployable capital, marginal return deterioration, multi-market diversification | `UNKNOWN` | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` |
| **KPI 11** | **Tail Loss & Settlement** | 99% CVaR, cluster-level loss, UMA oracle disputes, ghost fills, on-chain reconciliation | `UNKNOWN` | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` |

---

## 3. PnL Accounting Separation Rule

MTM PnL, Realized PnL, and Settled PnL are **never** combined into a single cash-profit figure. The 4.5% annual capital-cost figure is explicitly tagged as a **historical IC research assumption** (PDF reference date November 12, 2026), not a live risk-free rate oracle.
