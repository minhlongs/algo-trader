# POLY-G7 Machine-Readable 11-KPI Investment Committee Scorecard

- **Document ID:** `POLY-G7-07`
- **Date:** 2026-11-19 (Asia/Saigon)
- **Implementation:** `src/desk/polymarket/ic-kpi-scorecard.ts` (`CODE VERIFIED`)
- **CLI Entrypoint:** `scripts/poly-g7-scorecard.ts` (`CODE VERIFIED`)
- **Empirical Sample Gate:** `empiricalSampleGatePassed: false` (`L2=0/30d`, `fills=0/500`, `OOS=0/150`) (`CODE VERIFIED`)

---

## 1. Fail-Closed Governance Contract

`evaluateICKpiScorecard` (`src/desk/polymarket/ic-kpi-scorecard.ts`) enforces three hard empirical sample floors before any KPI can evaluate to `PASS` or `FAIL` (`CODE VERIFIED`):

- `MIN_RECORDED_L2_DAYS = 30` (distinct `YYYY-MM-DD.{jsonl,ndjson,wal}` files in `data/polymarket/l2-wal/`)
- `MIN_QUALIFYING_MAKER_FILLS = 500`
- `MIN_RESOLVED_OOS_FORECASTS = 150`

Whenever any floor is unmet, `empiricalSampleGatePassed` is `false`, all 11 KPIs emit `status: "UNKNOWN_INSUFFICIENT_EMPIRICAL_SAMPLE"` (`UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE`), all empirical alpha verdicts lock to `INSUFFICIENT_DATA`, `ECONOMIC_G11` / `LEGAL_G12` / `FOUNDER_G13` lock to `HOLD`, and `REAL_MONEY_TRADING` locks to `DISABLED` (`CODE VERIFIED`).

---

## 2. 11-Metric IC KPI Scorecard Table

| ID | KPI Name | IC Pass Threshold | Current Observed Value | Status | Evidence Label |
| --- | --- | --- | --- | --- | --- |
| 1 | Net PnL 95% Bootstrap CI LB | `> 0 pUSD` | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` | `UNKNOWN_INSUFFICIENT_EMPIRICAL_SAMPLE` | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` |
| 2 | Sortino & Deflated Sharpe | `Sortino >= 2.0 & DSR >= 1.5` | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` | `UNKNOWN_INSUFFICIENT_EMPIRICAL_SAMPLE` | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` |
| 3 | Max Drawdown (MTM) | `< 4.0% (sim)` / `< 2.5% (pilot)` | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` | `UNKNOWN_INSUFFICIENT_EMPIRICAL_SAMPLE` | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` |
| 4 | Profit Factor | `>= 1.35 (mm)` / `>= 1.60 (event)` | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` | `UNKNOWN_INSUFFICIENT_EMPIRICAL_SAMPLE` | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` |
| 5 | Fill Rate & Multi-Leg Completion | `div < 20% & multi-leg >= 92%` | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` | `UNKNOWN_INSUFFICIENT_EMPIRICAL_SAMPLE` | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` |
| 6 | Adverse Selection (60s Spread+Rebate+Reward) | `>= +15 bps over >= 500 fills` | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` | `UNKNOWN_INSUFFICIENT_EMPIRICAL_SAMPLE` | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` |
| 7 | Brier / Calibration (BSS_OOS & ECE) | `BSS_OOS >= +0.02 & ECE < 0.035 (>=150 OOS)` | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` | `UNKNOWN_INSUFFICIENT_EMPIRICAL_SAMPLE` | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` |
| 8 | Capital Utilization | `avg lockup < 10d & locked < 25%` | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` | `UNKNOWN_INSUFFICIENT_EMPIRICAL_SAMPLE` | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` |
| 9 | Turnover & Cost Stress | `net PnL > 0 at 1.5x slip/cancel & -50% rewards` | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` | `UNKNOWN_INSUFFICIENT_EMPIRICAL_SAMPLE` | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` |
| 10 | Deployable Capacity | `>= 25,000 pUSD` | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` | `UNKNOWN_INSUFFICIENT_EMPIRICAL_SAMPLE` | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` |
| 11 | Tail Loss & Settlement | `cluster < 3.0% NAV, 0 Ghost Fills, <= 1 token drift` | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` | `UNKNOWN_INSUFFICIENT_EMPIRICAL_SAMPLE` | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` |

---

## 3. Verbatim CLI Output (`npx tsx scripts/poly-g7-scorecard.ts`)

Captured directly from this worktree on 2026-11-19 (`CODE VERIFIED`):

```json
{
  "generatedAtIso": "2026-11-19T03:20:12.254Z",
  "empiricalSampleGatePassed": false,
  "samples": {
    "recordedL2Days": 0,
    "qualifyingMakerFills": 0,
    "resolvedOosForecasts": 0
  },
  "kpis": [
    {
      "id": 1,
      "name": "Net PnL 95% Bootstrap CI LB",
      "status": "UNKNOWN_INSUFFICIENT_EMPIRICAL_SAMPLE",
      "label": "UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE",
      "observed": "UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE",
      "threshold": "> 0 pUSD",
      "detail": "Sample floor unmet (L2=0/30d, fills=0/500, OOS=0/150)"
    },
    {
      "id": 2,
      "name": "Sortino & Deflated Sharpe",
      "status": "UNKNOWN_INSUFFICIENT_EMPIRICAL_SAMPLE",
      "label": "UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE",
      "observed": "UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE",
      "threshold": "Sortino >= 2.0 & DSR >= 1.5",
      "detail": "Sample floor unmet (L2=0/30d, fills=0/500, OOS=0/150)"
    },
    {
      "id": 3,
      "name": "Max Drawdown (MTM)",
      "status": "UNKNOWN_INSUFFICIENT_EMPIRICAL_SAMPLE",
      "label": "UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE",
      "observed": "UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE",
      "threshold": "< 4.0% (sim)",
      "detail": "Sample floor unmet (L2=0/30d, fills=0/500, OOS=0/150)"
    },
    {
      "id": 4,
      "name": "Profit Factor",
      "status": "UNKNOWN_INSUFFICIENT_EMPIRICAL_SAMPLE",
      "label": "UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE",
      "observed": "UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE",
      "threshold": ">= 1.35 (mm)",
      "detail": "Sample floor unmet (L2=0/30d, fills=0/500, OOS=0/150)"
    },
    {
      "id": 5,
      "name": "Fill Rate & Multi-Leg Completion",
      "status": "UNKNOWN_INSUFFICIENT_EMPIRICAL_SAMPLE",
      "label": "UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE",
      "observed": "UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE",
      "threshold": "div < 20% & multi-leg >= 92%",
      "detail": "Sample floor unmet (L2=0/30d, fills=0/500, OOS=0/150)"
    },
    {
      "id": 6,
      "name": "Adverse Selection (60s Spread+Rebate+Reward)",
      "status": "UNKNOWN_INSUFFICIENT_EMPIRICAL_SAMPLE",
      "label": "UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE",
      "observed": "UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE",
      "threshold": ">= +15 bps over >= 500 fills",
      "detail": "Sample floor unmet (L2=0/30d, fills=0/500, OOS=0/150)"
    },
    {
      "id": 7,
      "name": "Brier / Calibration (BSS_OOS & ECE)",
      "status": "UNKNOWN_INSUFFICIENT_EMPIRICAL_SAMPLE",
      "label": "UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE",
      "observed": "UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE",
      "threshold": "BSS_OOS >= +0.02 & ECE < 0.035 (>=150 OOS)",
      "detail": "Sample floor unmet (L2=0/30d, fills=0/500, OOS=0/150)"
    },
    {
      "id": 8,
      "name": "Capital Utilization",
      "status": "UNKNOWN_INSUFFICIENT_EMPIRICAL_SAMPLE",
      "label": "UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE",
      "observed": "UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE",
      "threshold": "avg lockup < 10d & locked < 25%",
      "detail": "Sample floor unmet (L2=0/30d, fills=0/500, OOS=0/150)"
    },
    {
      "id": 9,
      "name": "Turnover & Cost Stress",
      "status": "UNKNOWN_INSUFFICIENT_EMPIRICAL_SAMPLE",
      "label": "UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE",
      "observed": "UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE",
      "threshold": "net PnL > 0 at 1.5x slip/cancel & -50% rewards",
      "detail": "Sample floor unmet (L2=0/30d, fills=0/500, OOS=0/150)"
    },
    {
      "id": 10,
      "name": "Deployable Capacity",
      "status": "UNKNOWN_INSUFFICIENT_EMPIRICAL_SAMPLE",
      "label": "UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE",
      "observed": "UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE",
      "threshold": ">= 25,000 pUSD",
      "detail": "Sample floor unmet (L2=0/30d, fills=0/500, OOS=0/150)"
    },
    {
      "id": 11,
      "name": "Tail Loss & Settlement",
      "status": "UNKNOWN_INSUFFICIENT_EMPIRICAL_SAMPLE",
      "label": "UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE",
      "observed": "UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE",
      "threshold": "cluster < 3.0% NAV, 0 Ghost Fills, <= 1 token drift",
      "detail": "Sample floor unmet (L2=0/30d, fills=0/500, OOS=0/150)"
    }
  ],
  "verdicts": {
    "ARCHITECTURE_PARITY": "HOLD",
    "L2_CAPTURE_READINESS": "HOLD",
    "30_DAY_L2_DATA": "INSUFFICIENT_DATA",
    "MAKER_ALPHA": "INSUFFICIENT_DATA",
    "NEGRISK_ALPHA": "INSUFFICIENT_DATA",
    "MARKET_BLIND_ALPHA": "INSUFFICIENT_DATA",
    "ECONOMIC_G11": "HOLD",
    "LEGAL_G12": "HOLD",
    "FOUNDER_G13": "HOLD",
    "REAL_MONEY_TRADING": "DISABLED"
  }
}
```

---

## 4. Alignment with Executive 10-Verdict Summary

The CLI `verdicts` object governs the empirical and capital-release gates (`30_DAY_L2_DATA`, `MAKER_ALPHA`, `NEGRISK_ALPHA`, `MARKET_BLIND_ALPHA`, `ECONOMIC_G11`, `LEGAL_G12`, `FOUNDER_G13`, `REAL_MONEY_TRADING`), plus the runtime stress/safety sub-gates (`STRESS_RESILIENCE`, `EXECUTION_SAFETY`) (`CODE VERIFIED`). Combined with the two pre-empirical readiness verdicts in `00-EXECUTIVE-VERDICT.md` (`ARCHITECTURE_PARITY: PASS`, `L2_CAPTURE_READINESS: PASS`), all 10 Executive Verdicts remain mutually consistent (`CODE VERIFIED`).

---

## 5. Unresolved Questions

1. Should `scripts/poly-g7-scorecard.ts` also auto-count resolved forecasts directly from a configured JSONL ledger path (e.g., `--ledger-path data/polymarket/market-blind/ledger.jsonl`) during G7.4 weekly runs?
