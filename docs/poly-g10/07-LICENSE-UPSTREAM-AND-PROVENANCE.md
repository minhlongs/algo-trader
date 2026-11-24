# POLY-G10 Phases 9, 10 & 14 — Data License Review, Upstream 5-Repo Audit & Provenance Manifest

**Date:** 2026-11-23
**PDF Reference:** `POLY ALPHA HUNTER v4` pp. 6–25, 69–76
**External Locks:** `DATA_LICENSE = HOLD` | `PAPER_BETA_DATA_RIGHTS = HOLD` | `LEGAL_G12 = HOLD` | `VPS_R2_ACTIVATION = HOLD`

---

## 1. Phase 9 — Polymarket / ICE Data License & Paper Beta Data-Rights Review

- **Existing Operator Draft:** `docs/poly-g8-6/01-DATA-LICENSE-INQUIRY.md` (already covers Track A internal 150-market L2 capture & Track B Paper Beta redistribution).
- **POLY-G10 Verification Findings:**
  1. `wrangler.poly-beta.toml` locks `MARKET_DATA_ENABLED = "false"`, `MAINTENANCE_MODE = "true"`, `LIVE_TRADING_ENABLED = "false"` — no unlicensed Polymarket market data is displayed, proxied, or redistributed.
  2. No automated collector is running against Polymarket WS/REST endpoints (`VPS_R2_ACTIVATION = HOLD`, `30_DAY_L2 = INSUFFICIENT_DATA`).
  3. No external email or licensing correspondence was sent by this run.
- **Required Founder Action:** Send the sanitized Track A / Track B written inquiry to Adventure One QSS, Inc. and/or ICE Data Services and retain the written response before lifting `DATA_LICENSE = HOLD` or `PAPER_BETA_DATA_RIGHTS = HOLD`.

---

## 2. Phase 10 — Upstream 5-Repo Build-vs-Integrate & License/Security Audit

Per PDF pp. 6–25 and p. 69, the five reference open-source projects are evaluated against what already exists in `algo-trader`:

| # | Upstream Repository | PDF Role | License / Security Notes | Decision in `algo-trader` |
|---|---|---|---|---|
| 1 | `nautechsystems/nautilus_trader` | Reference Rust/Python event-driven backtest & execution architecture | **LGPL-3.0** (copyleft boundary risk if statically linked; PDF p. 25 warns on Polymarket adapter staleness vs CLOB V2) | **DO NOT VENDOR / DO NOT IMPORT.** Existing clean-room TS + Rust `sidecars/poly-book` + `queue-aware-fill-simulator.ts` avoids LGPL-3.0 contamination and already targets CLOB V2 / `pUSD` / `ExchangeV3`. |
| 2 | `weiminglong/poly-book` | Rust fixed-point L2 order book & WAL design reference | MIT/Apache-style reference; requires CLOB V2 schema & CRC32C WAL hardening | **ALREADY RE-IMPLEMENTED IN-REPO** at `sidecars/poly-book/` (586 Rust tests passing offline). Do not replace. |
| 3 | `warproxxx/poly-maker` | Reference Polymarket market-making bot | **CRITICAL SECURITY/V1 RISKS (PDF pp. 16–19):** plaintext private keys, V1 `USDC.e` / `ExchangeV2` assumptions, naive quoting without VPIN/regime protection | **NEVER COPY CODE OR KEY HANDLING.** Replaced cleanly by `log-odds-avellaneda-stoikov-mm.ts`, `liquidity-regime-machine.ts`, and `poly1271-session-signer.ts`. |
| 4 | `OrderBookTrade/GhostGuard` | Polygon receipt `status=0` Ghost Fill detector | Reference pattern for pre-signing & receipt monitoring | **ALREADY RE-IMPLEMENTED IN-REPO** at `sidecars/ghost-guard/` (54 Rust tests passing) + `ghost-guard-webhook-bridge.ts`. |
| 5 | `Alchemist-X/predict-raven` | Reference LLM forecasting / news-to-probability pipeline | High lookahead/anchoring risk if market price leaks into LLM prompt (PDF pp. 21–24) | **DO NOT IMPORT.** Replaced by strict market-blind SHA-256 hash-chained `market-blind-prospective-ledger.ts` with `W_SKILL = 0` and finalized on-chain settlement provenance (`settlement-chain-verifier.ts`). |

---

## 3. Phase 14 — Reproducible Provenance Manifest

| Field | Verified Value |
|---|---|
| **Repository** | `minhlongs/algo-trader` |
| **Base `origin/main` SHA** | `b7bf721fc393a29da67e5ca383320692a6157ea3` |
| **Branch** | `feat/poly-g10-pdf-ic-gap-closure` |
| **Local PDF Source** | `POLY ALPHA HUNTER v4` (80 pages, 2026-11-12; read externally outside git, **never committed**, temporary extracted text deleted before PR) |
| **Node.js** | `v26.7.0` |
| **pnpm** | `12.21.0` |
| **Python** | `3.14.7` |
| **Rust (`rustc` / `cargo`)** | `1.94.1` |
| **`pnpm-lock.yaml` SHA-256** | `30374311603b39ff32929d1ee5d603697ced9dcc3f659c7b8034e0b5b5de61ed` |
| **`sidecars/poly-book/Cargo.lock` SHA-256** | `50697ebf4714ffce35fdc1a589dad860c1451e2620979680ffe33bd9ea1e0a2a` |
| **`sidecars/ghost-guard/Cargo.lock` SHA-256** | `3386c5db8471ae6ffb03342ea341906494742079987e051495835b61f17de683` |
| **TypeScript Typecheck** | `npx tsc --noEmit` → **0 errors** |
| **Vitest Suite** | `npx vitest run tests/polymarket/ tests/desk/ tests/strategies/ tests/risk/ tests/portfolio/` → **190 files, 4,139 tests passed, 0 failed** |
| **Rust `sidecars/poly-book`** | `cargo test --workspace` → **586 passed, 0 failed, 2 ignored (live-network)** |
| **Rust `sidecars/ghost-guard`** | `cargo test` → **54 passed, 0 failed, 1 ignored** |
| **Python Collector Upload Tests** | `python3 tests/polymarket/poly-collector-upload.test.py` → **31 passed, 0 failed** |
| **Fail-Closed Scorecard Check** | `npx tsx scripts/poly-g7-scorecard.ts --json` → `empiricalSampleGatePassed: false`, `0/30d L2`, `0/500 fills`, `0/150 OOS`, all 11 KPIs `UNKNOWN_INSUFFICIENT_EMPIRICAL_SAMPLE` |
