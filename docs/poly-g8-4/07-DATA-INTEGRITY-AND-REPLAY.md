# POLY-G8.4 — Offline Data Integrity, Replay & Prospective Pipeline Verification

- **Document ID:** `POLY-G8.4-07`
- **Date:** 2026-11-21
- **Verification Mode:** Strictly offline / deterministic fixtures (zero live continuous ingestion, zero R2 provisioning, zero live orders).

---

## 1. Pipeline 1: L2 Archive → Replay → Execution Simulator → IC Scorecard

`Fixture Input → CRC32C WAL → SHA-256 Manifest → Parquet Contract → Deterministic Replay → Execution Simulator → Strategy Metrics → IC Scorecard`

| Stage / Suite | Command | Exit Code | Result |
|---|---|---|---|
| Rust `poly-book` (`pb-wal`, `pb-book`, `pb-bin`) | `CC=/usr/bin/cc CARGO_TARGET_AARCH64_APPLE_DARWIN_LINKER=/usr/bin/cc cargo test --manifest-path sidecars/poly-book/Cargo.toml` (on PR `#285` `784d6e98`) | `0` | **58 passed, 0 failed** (`52 + 5 + 1`) |
| Rust `ghost-guard` | `CC=/usr/bin/cc CARGO_TARGET_AARCH64_APPLE_DARWIN_LINKER=/usr/bin/cc cargo test --manifest-path sidecars/ghost-guard/Cargo.toml` (on `main` `7319b8d0`) | `0` | **54 passed, 0 failed, 1 ignored** (`0.12s`) |
| Python non-destructive uploader & SHA-256 archive integrity | `python3 -I -B tests/polymarket/poly-collector-upload.test.py` (on PR `#285` `784d6e98`) | `0` | **31 passed, 0 failed** (`15.666s`) |
| TypeScript Polymarket offline suite (WAL/replay, execution model matrix, maker queue sim, fee model, GhostGuard bridge, IC loader & scorecard) | `npx vitest run tests/polymarket/` (on PR `#285` `784d6e98`) | `0` | **48 files, 418 passed, 0 failed, 0 skipped** (`5.88s`) |
| Baseline `main` 12-suite offline replay/execution check | `npx vitest run` (12 core Polymarket/execution/risk suites on `7319b8d0`) | `0` | **12 files, 108 passed, 0 failed** (`2.82s`) |

---

## 2. Pipeline 2: Prospective Evidence → Durable Seal → Resolution → OOS Scoring → IC Scorecard

`Timestamped Evidence → Market-Blind Forecast → Authoritative Clock Stamp + SHA-256 Chain + Terminal Checkpoint → Idempotent Resolution → Deduplicated OOS Scoring → Fail-Closed IC Scorecard`

### Verified Negative / Integrity Invariants (PR `#285` `784d6e98`)

- **Backfill rejection:** Caller-supplied `recordedAtMs` is overridden by the pipeline clock; records lacking authoritative recording attestation or stamped at/after `resolvedAtMs` are excluded from empirical OOS denominators (`UNATTESTED_OR_BACKFILL_FORECASTS_EXCLUDED`).
- **Legacy compatibility:** Legacy records without `recordedAtMs` still replay cleanly without fabricated attestation.
- **Tamper & truncation detection:** Missing tail, missing middle record, hash-chain break, and stale concurrent writer are detected and fail closed.
- **Canonical denominator:** Duplicate questions, duplicate resolutions, test fixtures, empty WAL days, and unsupported Parquet artifacts are excluded from empirical counts.
- **Trust boundary note:** Administrator-controlled local checkpoints protect against accidental corruption, truncation, and concurrent-writer drift; they do **not** constitute third-party cryptographic notarization against a malicious host administrator.

### Canonical Scorecard Output (`scripts/poly-g7-scorecard.ts` on `784d6e98`)

- Command: `npx tsx scripts/poly-g7-scorecard.ts` (exit `0`).
- `empiricalSampleGatePassed: false`
- `samples: { recordedL2Days: 0, qualifyingMakerFills: 0, resolvedOosForecasts: 0 }`
- All 11 KPIs: `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE`.
- `ECONOMIC_G11 = HOLD`, `LEGAL_G12 = HOLD`, `FOUNDER_G13 = HOLD`, `REAL_MONEY_TRADING = DISABLED`.

---

## 3. Explicit Runtime Limits (Non-Extrapolation)

- `LINUX_SYSTEMD_RUNTIME = NOT_TESTED` (macOS Darwin host; systemd unit execution requires a future authorized Linux verification host).
- Live Cloudflare R2 object upload/retrieval and continuous 24/7 L2 collection remain **not executed** pending `DATA_LICENSE`, `INFRA_BUDGET`, and `VPS_R2_ACTIVATION`.
