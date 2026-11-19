# POLY-G7 Known Gaps, Residual Risks, and Intentional Deviations

- **Document ID:** `POLY-G7-10`
- **Date:** 2026-11-19 (Asia/Saigon)
- **Baseline:** `origin/main` `558adee1` | Tracking Issue `#276` (`CODE VERIFIED`)

---

## 1. Transparent Gap and Deviation Ledger

No gap is hidden or waived silently. Every open empirical deficit, implementation boundary, and governance deviation is listed below with its exact evidence label and mitigation posture.

| # | Gap / Deviation | Category | Current State | Evidence Label | Blocking Status & Mitigation |
| --- | --- | --- | --- | --- | --- |
| A | **Zero Empirical Market Sample (`0/30d` L2, `0/500` fills, `0/150` OOS)** | Empirical Data | `data/polymarket/l2-wal/` has `0` continuous days; `0` qualifying maker fills; `0` resolved prospective OOS forecasts. | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` | **Blocks G7.4–G7.5 & G11.** Mitigated by fail-closed `evaluateICKpiScorecard` and `w_skill = 0` lock. |
| B | **TypeScript Parquet Reader Not Implemented** | L2 Storage | `L2_SOURCE_POLY_BOOK_PARQUET` (`'poly-book-parquet'`) label exists in `src/desk/polymarket/l2/l2-source-labels.ts`, and Rust `poly-book` (`pb-store`) writes Parquet partitions, but TS replay currently decodes WAL v3 (`poly-book-wal-codec.ts`, `poly-book-wal-crc32c.ts`). | `NOT IMPLEMENTED` (TS Parquet reader) / `CODE VERIFIED` (WAL v3 replay) | **Non-blocking for G7.3.** TS replays CRC32C WAL v3 directly with verified SHA-256 parity; add TS Parquet loader or Rust replay export before multi-month analytical queries. |
| C | **Rust `ghost-guard` `callback.rs` & `defense.rs` Hardening** | Sidecar Hardening | Rust `ghost-guard/src/callback.rs` lacks authenticated retry/backoff and `defense.rs` remains a stub. | `NOT IMPLEMENTED` (Rust sidecar) / `CODE VERIFIED` (TS bridge) | **Non-blocking for `ARCHITECTURE_PARITY`.** Mitigated because the TS webhook bridge (`src/desk/polymarket/ghost-guard-webhook-bridge.ts`) and 5-state regime machine (`HALTED` -> `DELETE /cancel-market-orders`) enforce the kill-switch. Must harden Rust sidecar before any live capital deployment. |
| D | **Out-of-Scope Open Issues `#271` & `#272`** | Repo Backlog | `#271` (`disk-monitor` Node 26 compatibility) and `#272` (`ExchangeV3` live smoke gated on G12/G13) remain open and intentionally untouched per POLY-G7 scope contract. | `SOURCE VERIFIED` | **Out of scope for POLY-G7.** `#272` remains explicitly gated behind `LEGAL_G12` and `FOUNDER_G13`. |
| E | **Prior `Load Test` CI Failure on `b778f53a`** | CI History | Historical `Load Test` CI workflow failure observed on commit `b778f53a` prior to POLY-G7 branch work. | `SOURCE VERIFIED` | **Tracked residual.** Must be verified green on the PR/merge baseline before any production Worker deployment (`CLAUDE.md` 12k RPS gate). |
| F | **Capital Sizing Divergence: `#275` `$100` G6 Pilot vs IC `2,500–5,000 pUSD` Conditional Pilot** | Governance Policy | Issue `#275` tracks the POLY-G6 `$100` paper pilot, whereas IC doctrine specifies a `2,500–5,000 pUSD` conditional real-capital pilot (and `40,000–50,000 pUSD` Minimum Viable Capital for full deployment) only after G11 + G12 + G13 pass. | `SOURCE VERIFIED` | **Intentional phase distinction.** `#275` is strictly paper/shadow validation; real-money pilot sizing is governed solely by `FOUNDER_G13` (`11-FOUNDER-DECISION-GATE.md`). |
| G | **Paper Beta Resting Limit Orders Stay `PENDING`** | Simulator Scope | `TAKER_HARNESS_PAPER_BETA` crosses the spread (`TAKER_CROSS_SPREAD`) and leaves resting limit orders in `PENDING` rather than simulating queue fills. | `CODE VERIFIED` | **Intentional separation.** `EXECUTION_MODEL_MATRIX` forbids `TAKER_HARNESS_PAPER_BETA` from emitting `maker_markout_bps` or `maker_queue_fill_rate`; all maker evaluation routes exclusively through `MAKER_ONLY_QUEUE_CONSERVATIVE`. |

---

## 2. Explicit Scope Boundaries Maintained

- **No wallet, private key, or CLOB credential** was created, loaded, or tested (`LIVE_TRADING_ENABLED=false`) (`CODE VERIFIED`).
- **No production Cloudflare Worker deployment** was executed; G1-Soak and G2-Poly-Shadow remain locked (`CODE VERIFIED`).
- **No synthetic unit-test output** was converted into an empirical KPI pass (`CODE VERIFIED`).

---

## 3. Unresolved Questions

1. Should Rust `ghost-guard/src/callback.rs` (authenticated HMAC + exponential retry) and `defense.rs` be scheduled as a prerequisite ticket inside G7.4 before `FOUNDER_G13` review?
2. Should TS add a native Parquet reader for `poly-book-parquet` partitions, or standardize on WAL v3 segments for 30–90 day replay and DuckDB/Python for offline Parquet analysis?
