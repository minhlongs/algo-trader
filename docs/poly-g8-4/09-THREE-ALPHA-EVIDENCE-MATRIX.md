# POLY-G8.4 — Three Alpha Experiments Evidence Matrix

- **Document ID:** `POLY-G8.4-09`
- **Date:** 2026-11-21
- **Empirical Summary:** All three alpha experiments are **`INSUFFICIENT_DATA`** (`0/500` qualifying maker fills, `0` real NegRisk multi-leg cycles, `0/150` genuinely resolved prospective OOS forecasts). Unit and fixture tests verify software correctness only and are never treated as empirical alpha.

---

## 1. Exact Priority & Evidence Matrix

| Priority | Alpha Experiment | Target Universe & Exclusions | Engineering Readiness | Empirical Sample Observed vs. Required | Key IC Thresholds | Current Verdict |
|---|---|---|---|---|---|---|
| **FIRST** | **Alpha A — Adaptive Maker-Only + Regime Switching** | Politics, Finance, Economics (suitable duration & liquidity); **excludes** automated ultra-short 5-minute Crypto markets | `TESTED` (`execution-model-matrix.ts`, `maker-queue-simulator.ts`, CLOB V2 dynamic fees; separated from taker smoke harness) | `0 / 500` qualifying maker fills on genuine L2 data | Net realized spread + confirmed rewards `>= +15 bps`; Profit Factor `>= 1.35`; conservative behind-queue fills; 5s/60s/300s markout | `INSUFFICIENT_DATA` |
| **SECOND** | **Alpha B — Event-Level NegRisk** | Only events with verified outcome exclusivity & exhaustiveness | `TESTED` (model boundary & thin-leg-first / partial-fill unwind semantics in offline tests) | `0` real multi-leg execution cycles on recorded L2 or shadow feeds | Multi-leg completion `>= 92%`; Profit Factor `>= 1.60`; reject async-snapshot false arb; no atomic batch assumption; model gas/relayer + lockup cost + UMA 50/50 dispute risk | `INSUFFICIENT_DATA` |
| **THIRD** | **Alpha C — Market-Blind News & Bayesian Fair Value** | Prospective primary-source events logged strictly before resolution | `TESTED` (`scripts/poly-market-blind-logger.ts`, SHA-256 chain, terminal checkpoint, authoritative `recordedAtMs` clock, backfill exclusion, `w_skill=0` lock) | `0 / 150` genuinely resolved prospective OOS forecasts (`150–200` target) | `BSS_OOS >= +0.02` vs market baseline; `ECE < 0.035`; positive required CI bound; strict primary-source false-positive cap; `w_skill = 0` until proven | `INSUFFICIENT_DATA` |

---

## 2. Hard Methodological Guardrails

1. **No Taker-as-Maker Substitution:** `TAKER_HARNESS_PAPER_BETA` is strictly isolated from `MAKER_ONLY_QUEUE_CONSERVATIVE`; taker smoke fills never enter Maker KPIs.
2. **No Synthetic-as-Exchange Substitution:** Queue-aware simulated fills on genuine L2 data are explicitly labeled separately from exchange-confirmed fills; unconfirmed rewards are never booked as realized revenue.
3. **No Batch Atomicity Myth:** NegRisk multi-leg order batches are modeled sequentially (thin-leg-first, fail-fast, stranded-leg unwind), never as atomic swaps.
4. **No Hindcast Contamination:** PR `#285` (`784d6e98`) enforces authoritative pipeline clock stamping (`recordedAtMs`) and excludes unattested or post-resolution records (`UNATTESTED_OR_BACKFILL_FORECASTS_EXCLUDED`).
5. **Strategy Isolation at Gate 2:** Failure or `INSUFFICIENT_DATA` in Alpha C does not contaminate or approve Alpha A or Alpha B.
