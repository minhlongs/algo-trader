# POLY-G7 — Architecture Decision Record: Hybrid Rust Sidecars + TypeScript Core vs NautilusTrader

- **ADR ID:** `ADR-POLY-G7-001`
- **Date:** 2026-11-19 (Asia/Saigon)
- **Status:** **ACCEPTED (Option A)**
- **Branch:** `feat/poly-g7-ic-quant-validation`
- **Source Doctrine:** `Kiến Trúc Quant Alpha Polymarket.pdf` (Deliverables A & D, pp. 2–4, pp. 48–58; `SOURCE VERIFIED`)

---

## 1. Context & Problem Statement

The Investment Committee (IC) architecture doctrine evaluates five open-source repositories (`nautilus_trader`, `poly-book`, `poly-maker`, `GhostGuard`, `predict-raven`) and recommends a high-integrity execution, L2 capture, and backtest stack for Polymarket CLOB V2 (`SOURCE VERIFIED`, pp. 3–4, 49–55).

This repository (`algo-trader`) already runs a TypeScript quantitative core (`src/desk/polymarket/`, `src/desk/risk/`, `src/desk/execution/`), a Cloudflare Paper Beta (`poly-beta-api` / `TenantPaperEngine` DO), and two vendored Rust sidecars (`sidecars/poly-book/` and `sidecars/ghost-guard/`) with deterministic WAL v3 CRC32C replay parity (`CODE VERIFIED`). The architectural decision is whether to:
- **Option A:** Retain the Hybrid Rust Sidecars (`poly-book` + `ghost-guard`) + TypeScript Core and close remaining order-lifecycle parity gaps in TypeScript.
- **Option B:** Add a narrow `nautilus_trader` Python/Rust verification adapter strictly for backtest cross-checking while keeping production in TypeScript + Rust sidecars.
- **Option C:** Perform a full migration of strategy execution, risk, and backtesting into `nautilus_trader` (Python/Rust, LGPL-3.0).

---

## 2. Five-Repository Evaluation Matrix (IC PDF pp. 3–4, 49–55)

| Upstream Repository | IC Score & License | IC Role (PDF) | Repo Disposition | Evidence |
|---|---|---|---|---|
| `nautechsystems/nautilus_trader` | `86/100`, `LGPL-3.0` (pp. 52–54) | Event-driven execution & backtest engine reference | **Not adopted as runtime**; 9-point parity audit completed in TS (`Option A`) | `SOURCE VERIFIED` |
| `weiminglong/poly-book` | `85/100`, `MIT` (p. 3, pp. 49–53) | Low-latency L2 orderbook ingest, WAL v3 CRC32C, Parquet & replay | **Vendored & compiled** in `sidecars/poly-book/` (`pb-wal`, `pb-book`, `pb-replay`, `pb-store`); TS WAL v3 parity bridge verified | `CODE VERIFIED` |
| `warproxxx/poly-maker` (`v2-rewrite`) | `90/100`, `MIT` (p. 3, p. 6, pp. 53–54) | Post-only quoting, inventory skew, CLOB V2 patterns | **Ported to TS** in `log-odds-avellaneda-stoikov-mm.ts`, `clob-v2-order-signing.ts`, `liquidity-regime-machine.ts` | `CODE VERIFIED` |
| `OrderBookTrade/GhostGuard` | `81/100`, `MIT` (pp. 3–4, p. 51, p. 55) | Polygon receipt `status=0` ghost-fill detector & cancel-all trigger | **Vendored** in `sidecars/ghost-guard/` + TS `ghost-guard-webhook-bridge.ts` (`74.35ms` drill); Rust `defense.rs` still `TODO(phase-3)` | `CODE VERIFIED` |
| `Alchemist-X/predict-raven` | `86/100`, `MIT` (p. 4, p. 43, p. 53, p. 74) | Market-blind forecasting core only (anti-anchoring, OOS calibration) | **Ported to TS** in `src/desk/polymarket/market-blind/` (sanitizer, prospective ledger, shrunk posterior, durable store) | `CODE VERIFIED` |

---

## 3. Nine-Point NautilusTrader Parity Audit

To evaluate whether migrating to `nautilus_trader` is justified before empirical alpha is proven, we audited nine core execution and simulation capabilities against our TypeScript + Rust sidecar stack:

| # | Capability | NautilusTrader Reference | Current `algo-trader` Implementation | Parity Status | Evidence |
|---|---|---|---|---|---|
| 1 | **Deterministic `clientOrderId` & Salt** | Deterministic order ID generator across restarts | `src/desk/execution/deterministic-client-order-id.ts` (`deriveDeterministicClientOrderId`, `deriveDeterministicOrderSalt`, `ClientOrderIdRegistry` with `serialize()`/`hydrate()` integrity checks) | **Full Parity** | `CODE VERIFIED` |
| 2 | **Atomic `cancel/replace` State Machine** | Single in-flight modify/cancel FSM preventing double exposure | `src/desk/execution/polymarket-cancel-replace.ts` (`PolymarketCancelReplaceManager`: `LIVE -> PENDING_CANCEL -> PENDING_REPLACE -> REPLACED/CANCELLED/FAILED`, blocks concurrent replaces, defers across HTTP 425 `EngineRestartCooldown`) | **Full Parity** | `CODE VERIFIED` |
| 3 | **ExchangeV3 EIP-712 Signing & Transport** | Native Polymarket adapter signing | `src/desk/polymarket/clob-v2-order-signing.ts` + `poly1271-session-signer.ts` (11-field struct byte-for-byte parity with `@polymarket/clob-client-v2@0.2.7`, isolated `Poly1271` session key) | **Full Parity (Offline)** | `CODE VERIFIED` |
| 4 | **L2 Event Replay & Corruption Guard** | Rust `OrderBook` + Parquet catalog | `sidecars/poly-book/` (Rust) + `src/desk/polymarket/l2/poly-book-wal-crc32c.ts`, `poly-book-wal-bridge.ts`, `l2-archive-manifest.ts` (Castagnoli CRC32C, SHA-256 manifest, deterministic `replayHash`) | **Full Parity** | `LIVE PUBLIC READ-ONLY VERIFIED` |
| 5 | **Queue-Conservative Fill Simulation** | L2 matching engine with queue position | `src/desk/polymarket/queue-aware-fill-simulator.ts` + `execution-model-matrix.ts` (100% behind resting depth, 15%–25% cancel attribution, log-normal cancel 35ms/180ms p99, 150ms crypto delay) | **Full Parity** | `CODE VERIFIED` |
| 6 | **Fail-Closed Pre-Trade Risk & Kill Switch** | `RiskEngine` + `ExecutionEngine` halt | `src/desk/risk/poly-fail-closed-risk-engine.ts` (`evaluatePolyRisk`, type-level `'unknown'` deny) + `poly-kill-switch.ts` + `clob-v2-heartbeat-service.ts` | **Full Parity** | `CODE VERIFIED` |
| 7 | **Ghost-Fill Receipt Defense** | Custom venue extension required | `sidecars/ghost-guard/` + `ghost-guard-webhook-bridge.ts` (TS cancel-all trigger works; Rust `defense.rs` empty stub, `callback.rs` lacks HMAC/retry) | **Partial** (TS mitigates; Rust hardening tracked) | `CODE VERIFIED` |
| 8 | **Polymarket Economic Truth PnL & UMA Carry** | Generic portfolio accounting (no UMA lockup/rewards split) | `src/desk/polymarket/economic-truth-pnl.ts` (5-quantity PnL, `4.5%/yr` carry, UMA dispute buffer, `netEconomicPnlExRewardsPusd`) | **Exceeds Nautilus Default** | `CODE VERIFIED` |
| 9 | **Runtime Licensing & Operational Footprint** | `LGPL-3.0` (copyleft compliance obligations for linking/distribution) + Python/Rust dual-stack ops | `MIT` sidecars + pure TS/Node/CF Workers core (zero LGPL-3.0 licensing friction, single CI/test toolchain) | **Advantage `algo-trader`** | `SOURCE VERIFIED` |

---

## 4. Options Comparison

| Criterion | Option A: Keep Rust Sidecars + TS Core (Accepted) | Option B: Narrow Nautilus Verification Adapter | Option C: Full NautilusTrader Migration |
|---|---|---|---|
| **Engineering Effort** | Low (`0` rewrite; deterministic ID + cancel/replace already landed in G7) | Medium (Python/Rust bridge, schema translation, dual CI maintenance) | High (4–8 weeks rewriting 60+ Polymarket TS modules, risk engine, and tests) |
| **Licensing Risk** | None (`MIT` sidecars + internal TS) | Low–Medium (`LGPL-3.0` isolation boundary required) | Medium–High (`LGPL-3.0` obligations across core execution stack) |
| **Time to 30-Day L2 Evidence** | Immediate (30s public capture drill already `CAPTURE_READY`) | Delayed by adapter build/maintenance | Severely delayed; violates IC "prove edge before infra spend" rule |
| **Execution Latency Fit** | Sufficient: Polymarket CLOB REST/WS RTT is `35–180ms` (`SOURCE VERIFIED`, p. 58); hot L2 ingest stays in Rust (`poly-book`) | Same live path as Option A | Marginal sub-ms local dispatch gain dwarfed by Polygon/CLOB network RTT |
| **Cloudflare Deployment Fit** | Paper beta runs natively on CF Workers/DO; live VPS runs Node + Rust sidecars | Requires Python runtime alongside Node/Rust | Incompatible with CF Workers; forces full VPS-only architecture |
| **Bug Surface / Parity Risk** | Single source of truth between backtest and live TS execution | Risk of false divergence between TS and Python simulators | High regression risk; discards 100+ verified Polymarket tests |

---

## 5. Decision

**Accepted: Option A — Keep Rust Sidecars (`poly-book` + `ghost-guard`) + TypeScript Core.**

1. **Rationale:** All critical execution-safety invariants from `nautilus_trader` (deterministic `clientOrderId`/salt, atomic `cancel/replace` state machine with HTTP 425 deferral, fail-closed risk engine, CRC32C WAL replay, and queue-conservative fill modeling) are now `CODE VERIFIED` in TypeScript + Rust sidecars without introducing `LGPL-3.0` licensing constraints or a Python/Rust/TS tri-runtime.
2. **Boundary Discipline:**
   - **Data plane (hot path):** Rust `sidecars/poly-book` handles high-frequency L2 WebSocket ingest, WAL v3 CRC32C persistence, and Parquet compaction on a dedicated VPS (not CF Workers, which cannot spawn native binaries; `SOURCE VERIFIED`, `docs/poly-g5-forensics-and-boundary-matrix.md`).
   - **Defense plane:** Rust `sidecars/ghost-guard` monitors Polygon receipts and alerts TS `ghost-guard-webhook-bridge.ts` over loopback; hardening `callback.rs` (HMAC + retry) and `defense.rs` is required before any live capital deployment.
   - **Strategy, Risk & Signing plane:** TypeScript core (`src/desk/polymarket/`, `src/desk/risk/`, `src/desk/execution/`) remains the single implementation for both replay simulation and live execution.

---

## 6. Explicit Re-Evaluation Triggers

This ADR MUST be reopened to evaluate **Option B** or **Option C** if any of the following occur:
1. **Throughput / Latency Ceiling:** Multi-market maker quoting exceeds `50` concurrent markets and Node.js event-loop p99 tick-to-quote latency exceeds `15ms` under live L2 load.
2. **Replay Divergence:** Independent audit of 30-day L2 replay vs live shadow fills shows unexplained fill-rate divergence `>= 20%` (KPI #5 failure) attributable to simulator architecture rather than queue parameters.
3. **Capital Scale:** Approved live AUM exceeds `100,000 pUSD` across multiple venues (beyond Polymarket CLOB V2), where `nautilus_trader`'s multi-venue adapter ecosystem justifies dual-stack operational overhead.

---

## 7. Unresolved Questions

1. Will Release B (post-G11/G12/G13) deploy the Node + Rust sidecars on a dedicated EU/US-adjacent VPS (recommended for `poly-book` + `ghost-guard` loopback latency) or Cloudflare Containers?
2. Should `sidecars/ghost-guard/src/callback.rs` HMAC authentication and `defense.rs` direct CLOB cancel-all fallback be completed as a mandatory pre-pilot milestone before G11 closes?
