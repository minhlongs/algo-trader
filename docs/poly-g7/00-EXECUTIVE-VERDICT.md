# POLY-G7 Executive Verdict — IC Quant Validation Pack

- **Document ID:** `POLY-G7-00`
- **Date:** 2026-11-19 (Asia/Saigon)
- **Branch:** `feat/poly-g7-ic-quant-validation` (baseline `origin/main` `558adee1`)
- **Tracking Issue:** `#276` (related open out-of-scope issues: `#271`, `#272`, `#275`)
- **Live Capital Status:** `LIVE_TRADING_ENABLED=false` — zero real funds, zero wallets/keys, zero production deploy (`CODE VERIFIED`).

---

## 1. Executive Summary

This Investment Committee (IC) validation pack documents the architectural readiness, execution simulator discipline, L2 market-data capture readiness, and fail-closed empirical governance of the Polymarket quantitative trading desk under **POLY-G7 (G7.0–G7.3)** (`CODE VERIFIED`).

The engineering and infrastructure foundation is ready for prospective data collection: the **Rust Sidecars + TypeScript Core (ADR Option A)** architecture satisfies all 9/9 NautilusTrader parity controls, including deterministic `clientOrderId` / EIP-712 salt derivation and an atomic `cancel/replace` state machine (`CODE VERIFIED`). Furthermore, a bounded 30-second public read-only L2 market-data capture drill completed against live Polymarket feeds with `status: "CAPTURE_READY"`, `636` valid WAL v3 frames, `0` corrupt/gap records across `4` live tokens, and byte-identical SHA-256 restore/replay parity (`LIVE PUBLIC READ-ONLY VERIFIED`).

**No empirical alpha claim is made and no real-money trading is authorized.** Every empirical sample floor remains at zero (`0/30` continuous L2 WAL days, `0/500` qualifying maker fills, `0/150` resolved prospective out-of-sample forecasts), so all 11 IC KPIs report `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` and all capital-allocation gates (`ECONOMIC_G11`, `LEGAL_G12`, `FOUNDER_G13`) remain locked at `HOLD` (`CODE VERIFIED`). G7.4–G7.5 (30–90 day empirical validation and economic gate clearance) cannot pass until prospective observation completes.

---

## 2. Evidence-Labeling Standard

Every claim, metric, and verdict across all reports in `docs/poly-g7/` is tagged with exactly one of the following six evidence labels:

| Evidence Label | Meaning |
| --- | --- |
| `SOURCE VERIFIED` | Verified against primary external specifications, venue documentation, or IC doctrine. |
| `CODE VERIFIED` | Verified directly against committed TypeScript/Rust source code and deterministic CLI output in this repository. |
| `LIVE PUBLIC READ-ONLY VERIFIED` | Verified against live public Polymarket APIs/WebSockets with zero authentication, zero wallets, and zero order endpoints. |
| `SYNTHETIC / UNIT TEST ONLY` | Verified using deterministic synthetic fixtures or Vitest unit tests; not empirical market proof. |
| `NOT IMPLEMENTED` | Capability is absent from the codebase or stubbed without production enforcement. |
| `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` | Empirical market sample floor is unmet (`<30d` L2 WAL, `<500` maker fills, or `<150` resolved OOS forecasts). |

---

## 3. Final Verdicts (10-Gate IC Summary)

| # | Gate / Verdict Key | Verdict | Evidence Label | Rationale |
| --- | --- | --- | --- | --- |
| 1 | `ARCHITECTURE_PARITY` | **PASS** | `CODE VERIFIED` | Rust Sidecars + TS Core (ADR Option A) addresses 9/9 NautilusTrader parity points, including deterministic `clientOrderId` (`src/desk/execution/deterministic-client-order-id.ts`) and atomic `cancel/replace` (`src/desk/execution/polymarket-cancel-replace.ts`). GhostGuard Rust `callback.rs`/`defense.rs` hardening is tracked as a non-blocking residual gap because the TS webhook bridge enforces the kill-switch. |
| 2 | `L2_CAPTURE_READINESS` | **PASS** | `LIVE PUBLIC READ-ONLY VERIFIED` | Bounded 30s public read-only L2 drill (2026-11-19T03:17:40Z–03:18:11Z) returned `status: "CAPTURE_READY"` (`ws-fallback`), `636` valid WAL v3 frames, `0` corrupt/gaps, `4` live tokens, `manifestSha256: 30455393a966bdbf6c984a32426ad7445b788b920d35b80b2a87f7739e0c0c77`, identical `replayHash: d0a6de8f09e8a74e4b3c92e6349152814dc97a5f31ebada8ca918da604c62584` (`64` steps), `activeChildPids: []`. |
| 3 | `30_DAY_L2_DATA` | **INSUFFICIENT_DATA** | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` | `0/30` continuous calendar days of L2 WAL segments recorded in `data/polymarket/l2-wal/`. |
| 4 | `MAKER_ALPHA` | **INSUFFICIENT_DATA** | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` | `0/500` qualifying real maker fills collected under conservative queue simulation or live shadow observation. |
| 5 | `NEGRISK_ALPHA` | **INSUFFICIENT_DATA** | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` | `0` real multi-leg NegRisk execution cycles observed on recorded L2 data or live shadow feeds. |
| 6 | `MARKET_BLIND_ALPHA` | **INSUFFICIENT_DATA** | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` | `0/150` resolved prospective OOS forecasts committed to the durable hash-chained ledger; `w_skill = 0` fail-closed lock active. |
| 7 | `ECONOMIC_G11` | **HOLD** | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` | Locked until all 11 IC KPIs pass over `>=30` L2 days, `>=500` maker fills, and `>=150` resolved OOS forecasts (`npx tsx scripts/poly-g7-scorecard.ts`). |
| 8 | `LEGAL_G12` | **HOLD** | `SOURCE VERIFIED` | Independent Vietnam operator and user legal counsel review is pending prior to any real-capital activity. |
| 9 | `FOUNDER_G13` | **HOLD** | `CODE VERIFIED` | Founder real-capital pilot sign-off (`2,500–5,000 pUSD` conditional pilot vs `40,000–50,000 pUSD` MVC) is locked until both `ECONOMIC_G11` and `LEGAL_G12` pass. |
| 10 | `REAL_MONEY_TRADING` | **DISABLED** | `CODE VERIFIED` | `LIVE_TRADING_ENABLED=false`; G1-Soak and G2-Poly-Shadow remain locked with zero live keys, wallets, or production deployments. |

---

## 4. Key Deliverables Completed (G7.0–G7.3)

1. **Execution Model Separation (`G7.1`):** `src/desk/polymarket/execution-model-matrix.ts` enforces strict metric and invariant boundaries across `TAKER_HARNESS_PAPER_BETA`, `MAKER_ONLY_QUEUE_CONSERVATIVE`, `NEGRISK_MULTI_LEG`, and `MARKET_BLIND_NEWS`, preventing product smoke harnesses from emitting maker-only KPIs (`CODE VERIFIED`).
2. **Deterministic Order Identity & Atomic Cancel/Replace (`G7.1`):** `src/desk/execution/deterministic-client-order-id.ts` derives SHA-256 `poly_<32hex>` IDs and 128-bit EIP-712 salts with restart-safe hydration; `src/desk/execution/polymarket-cancel-replace.ts` blocks double-exposure per quote slot and defers replaces across HTTP 425 `EngineRestartCooldown` (`CODE VERIFIED`).
3. **Public Read-Only L2 Capture & Replay Parity (`G7.2a`):** `scripts/poly-l2-capture-drill.ts` and `src/desk/polymarket/l2/l2-public-capture-drill.ts` verified live public L2 capture into CRC32C WAL v3 segments with SHA-256 manifest verification and deterministic replay parity (`LIVE PUBLIC READ-ONLY VERIFIED`).
4. **Durable Market-Blind Ledger & Resolution Ingestor (`G7.2b`):** `src/desk/polymarket/market-blind/market-blind-ledger-store.ts`, `node-market-blind-ledger-adapter.ts`, and `market-blind-resolution-ingestor.ts` persist hash-chained prospective forecasts across restarts, ingest Gamma/CTF resolutions idempotently, and enforce `w_skill = 0` fail-closed locking (`CODE VERIFIED`).
5. **Machine-Readable 11-KPI Scorecard (`G7.2b`):** `src/desk/polymarket/ic-kpi-scorecard.ts` and `scripts/poly-g7-scorecard.ts` evaluate all 11 IC KPIs fail-closed, returning `empiricalSampleGatePassed: false` whenever sample floors are unmet (`CODE VERIFIED`).
6. **Operational Runbook & Founder Gate (`G7.3`):** `09-PROSPECTIVE-EVALUATION-PROTOCOL.md`, `10-KNOWN-GAPS-AND-DEVIATIONS.md`, and `11-FOUNDER-DECISION-GATE.md` define the exact zero-premature-spend path from G7.3 to G7.4 and G11–G13 (`CODE VERIFIED`).

---

## 5. Explicit Non-Claims and Safety Boundary

- This report does **not** claim positive live or simulated maker, NegRisk, or market-blind alpha (`UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE`).
- This report does **not** authorize enabling `LIVE_TRADING_ENABLED`, funding any wallet, deploying production order-routing changes, or launching paid 24/7 infrastructure before Founder sign-off (`CODE VERIFIED`).
- All unit and synthetic verifications are strictly labeled `SYNTHETIC / UNIT TEST ONLY` and are never substituted for 30-day observed L2 data or prospective out-of-sample outcomes (`CODE VERIFIED`).

---

## 6. Unresolved Questions

1. Which VPS region and Cloudflare R2 retention budget will the Founder approve to start the 30-day continuous read-only L2 WAL capture (`G7.3`)?
2. What is the target timeline and counsel engagement scope for independent Vietnam legal review (`LEGAL_G12`)?
