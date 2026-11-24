# POLY-G10 Phase 3 — Collector, WAL/Parquet Replay & Key Isolation Readiness Report

**Date:** 2026-11-23
**Base Commit (`origin/main`):** `b7bf721fc393a29da67e5ca383320692a6157ea3`
**PDF Reference:** `POLY ALPHA HUNTER v4` pp. 13–15, 28, 48–55, 63, 70, 72
**Evidence Status:** `L2_CAPTURE_READINESS = PASS (OFFLINE_ENGINEERING_ONLY)` | `30_DAY_L2 = INSUFFICIENT_DATA` | `IC_DAY_0 = null` | `VPS_R2_ACTIVATION = HOLD`

> **Epistemic Boundary:** Offline unit tests, synthetic fixtures, and 30-second drills are technical smoke tests only. They do **not** constitute 7 days of continuous operational qualification, 30 days of licensed L2 capture, or IC Day 0.

---

## 1. Collector, Rust L2 Order Book, WAL & Parquet Audit

| Subsystem | Verified Implementation | Verification Evidence | Status |
|---|---|---|---|
| Rust fixed-point L2 order book & deterministic replay | `sidecars/poly-book/` (`orderbook`, `wal`, `parquet`, `replay`) | `cargo test --workspace`: **586 passed**, 0 failed (2 ignored live-network tests) | `IMPLEMENTED_AND_VERIFIED` (offline) |
| CRC32C WAL integrity, truncated WAL recovery & corrupt-frame rejection | `sidecars/poly-book/` WAL crate + `src/desk/polymarket/l2/` | Deterministic unit & corruption tests in Rust workspace | `IMPLEMENTED_AND_VERIFIED` (offline) |
| Parquet upload, spool bounds & manifest SHA-256 verification | `infra/poly-collector/`, `src/desk/polymarket/l2/l2-archive-coverage.ts` | `python3 tests/polymarket/poly-collector-upload.test.py`: **31 passed**, 0 failed; TS archive coverage tests green | `IMPLEMENTED_AND_VERIFIED` (offline) |
| GhostGuard `status=0` Ghost Fill sidecar & `<100 ms` kill-switch bridge | `sidecars/ghost-guard/`, `src/desk/polymarket/ghost-guard-webhook-bridge.ts`, `scripts/poly-sidecars.ts` | `cargo test`: **54 passed**, 0 failed (1 ignored); `cmdDrillGhost()` latches `PolyKillSwitch` in `<100 ms` | `IMPLEMENTED_AND_VERIFIED` (offline) |
| Fail-closed pre-trade risk engine (`>1500 ms` stale feed, missing fee, notional cap, drawdown auto-halt) | `src/desk/risk/poly-fail-closed-risk-engine.ts`, `src/desk/polymarket/quant-stress-and-bootstrap.ts` | `STALE_FEED_GT_1500MS` routed directly through `evaluatePolyRisk`; all 9 stress scenarios verified | `IMPLEMENTED_AND_VERIFIED` (offline) |

### Key Verified Invariants
- Single event-ordering model with exchange timestamp and local receive timestamp separation.
- Corrupt CRC32C frames, truncated WAL tails, tampered manifests, and stale books fail closed with explicit error reporting (no silently repaired trading history).
- `GnosisCtfSettlementRelayer` now enforces an explicit `mode: 'offline-paper' | 'live'` guard and refuses to execute or emit `0xmock-*` hashes in `'live'` mode.

---

## 2. Poly1271 & Secret-Boundary Key Isolation Audit

| Control | Verified Source State | Verdict |
|---|---|---|
| No private key in collector process (`infra/poly-collector/`, `sidecars/poly-book/`) | Read-only public WS/REST ingestion + bucket-scoped R2 uploader credentials only; zero signing or wallet keys referenced | `PASS` |
| No private key in Paper Beta Worker (`wrangler.poly-beta.toml`, `src/platform/poly-beta/`) | `LIVE_TRADING_ENABLED="false"`, `MAINTENANCE_MODE="true"`, `MARKET_DATA_ENABLED="false"`; simulated `$100` paper ledger only | `PASS` |
| Scoped Session Key signing (`Poly1271`, `signatureType = 3`, `ExchangeV3`, `pUSD`) | `src/desk/polymarket/poly1271-session-signer.ts` & `clob-v2-order-signing.ts` reject V1 collateral and master deposit keys | `PASS` |
| Emergency kill switch independent of live market data | `createPolyKillSwitch` latches locally and blocks all new orders before any network call | `PASS` |
| Live-wallet / key generation prohibition | Zero wallets created, zero transactions signed, zero funds transferred | `PASS` |

---

## 3. Remaining External Prerequisites Before Day 0 Activation

1. **Track A — Written Data License (`DATA_LICENSE = HOLD`):** Signed/written permission from Adventure One QSS, Inc. and/or ICE Data Services covering Vietnam solo operator, up to 150 markets, automated WS/REST L2 capture, 30-day rolling WAL/Parquet retention, Linux VPS, and private Cloudflare R2.
2. **Track C — Vietnam Legal G12 Opinion (`LEGAL_G12 = HOLD`):** Dated written preliminary opinion from licensed Vietnamese counsel clearing Research Group 1 (data collection + offline backtesting).
3. **Track D — Budget Approval (`VPS_R2_ACTIVATION = HOLD`):** Founder explicit written sign-off on total recurring monthly cost (VPS + R2 + tax + Track A license fee) and hard spending kill-switch.
4. **Sequential Qualification (Post-Approval):** 24-hour bounded read-only drill → 7-day continuous zero-drop operational qualification (neither counts toward the 30-day IC window) → Founder signs `IC_DAY_0` to begin the 30-day qualifying L2 capture.
