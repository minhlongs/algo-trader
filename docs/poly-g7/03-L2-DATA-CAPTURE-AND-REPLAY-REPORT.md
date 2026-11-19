# POLY-G7.1 — L2 Data Capture, WAL v3 Parity & Deterministic Replay Report

- **Date:** 2026-11-19 (Asia/Saigon)
- **Branch:** `feat/poly-g7-ic-quant-validation`
- **Pipeline Verdict:** `CAPTURE_READY` (30-second public read-only drill; `LIVE PUBLIC READ-ONLY VERIFIED`)
- **30-Day Empirical Gate (`30_DAY_L2_DATA`):** **`INSUFFICIENT_DATA` (`0 / 30` days archived; `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE`)**

---

## 1. End-to-End L2 Capture & Replay Architecture

Per IC PDF Deliverable D (pp. 49–53; `SOURCE VERIFIED`), point-in-time L2 market data must be captured without lookahead or survivorship bias through a four-stage immutable pipeline:

```text
Polymarket Public WS (wss://ws-subscriptions-clob.polymarket.com/ws/market)
  + Gamma Discovery (https://gamma-api.polymarket.com/markets)
        │
        ▼
  [Stage 1: Ingest & Framing]
  sidecars/poly-book (Rust: pb-feed -> pb-wal) OR TS ws-fallback (l2-public-capture-drill.ts)
  Binary WAL v3 frames: [len: u32 LE (4B)][crc32c: u32 LE (4B)][payload: len B]
        │
        ▼
  [Stage 2: Compaction & Archival]
  Partitioned Parquet (pb-store, --parquet=true) + immutable WAL segments (segment_<id>.wal)
  + SHA-256 Archive Manifest (l2-archive-manifest.ts: buildL2ArchiveManifest)
        │
        ▼
  [Stage 3: Cold Storage & Restore Verification]
  VPS local NVMe -> Cloudflare R2 object store -> cold restore directory
  verifyL2ArchiveManifest + verifyWalRestoreParity (bit-exact replayHash check)
        │
        ▼
  [Stage 4: Deterministic Replay & Queue-Conservative Simulation]
  readPolyBookWalDirectory -> replayPolyBookWalRecords -> ReplayedBookStep[]
  -> Queue-Aware Fill Simulator (100% behind resting depth, 15%-25% cancel attribution)
```

---

## 2. Rust-to-TypeScript WAL v3 Golden Parity

Both the Rust sidecar (`sidecars/poly-book/crates/pb-wal/`) and the TypeScript bridge (`src/desk/polymarket/l2/`) implement the exact same binary wire format (`CODE VERIFIED`):

- **Framing & Checksum (`src/desk/polymarket/l2/poly-book-wal-crc32c.ts`):**
  - Header size: `WAL_FRAME_HEADER_BYTES = 8` (`len: u32 LE` + `crc: u32 LE`).
  - Maximum record size: `WAL_MAX_RECORD_BYTES = 256 MiB`.
  - Checksum algorithm: Castagnoli CRC32C (`0x82F63B78`), computed as `crc32cAppend(crc32c(len_le_bytes), payload)`, matching `pb_wal::segment::frame_crc(len, payload)` (`CODE VERIFIED`).
  - Codec version: `POLY_BOOK_WAL_CODEC_V3 = 3` (`poly-book-wal-codec.ts`), encoding fixed-point prices (`1e-4`, `0..10_000`) and sizes (`1e-6` BigInt) alongside `PolyBookEventProvenance` (`recvTimestampUs`, `exchangeTimestampUs`, `source`, `sequence`, `ingestOrdinal`).
- **Rust Build & Unit Verification:** The `sidecars/poly-book` Rust workspace (`pb-api`, `pb-bin`, `pb-book`, `pb-feed`, `pb-metrics`, `pb-replay`, `pb-service`, `pb-store`, `pb-types`, `pb-wal`) compiles cleanly and passes all unit tests (`cargo test`; `CODE VERIFIED`).
- **TS Parity Tests:** `tests/polymarket/l2/poly-book-wal-bridge.test.ts`, `tests/polymarket/l2/l2-archive-manifest.test.ts`, and `tests/polymarket/l2/l2-public-capture-drill.test.ts` verify CRC32C framing, v3 decoding, manifest integrity, and restore parity (`CODE VERIFIED`).

---

## 3. Data Integrity: Corruption, Gap, Mismatch & Staleness Detection

| Failure Mode | Detection Mechanism | Fail-Closed Behavior | Evidence |
|---|---|---|---|
| **Bit-flip / Corrupt WAL Frame** | `scanPolyBookWalFrames` verifies Castagnoli CRC32C and `WAL_MAX_RECORD_BYTES` (`poly-book-wal-crc32c.ts`) | Throws `PolyBookWalCorruptionError` (`onCorruption: 'throw'` in `verifyWalRestoreParity`); increments `corruptFrames` in skip mode | `CODE VERIFIED` |
| **Truncated Mid-Segment** | Frame length exceeding segment buffer on non-final segments (`poly-book-wal-bridge.ts:184`) | Fails `isContinuityClean` (`corruptFrames > 0`); manifest verification flags `mismatched` file size/SHA-256 | `CODE VERIFIED` |
| **Sequence Gap** | Explicit `Ingest::SequenceGap` records or non-contiguous per-asset `sequence !== prevSeq + 1` (`poly-book-wal-bridge.ts:97,154`) | Increments `sequenceGaps`; `verifyWalRestoreParity` fails `continuityOk` (`sequenceGaps === 0` required) | `CODE VERIFIED` |
| **Book Mismatch / Source Reset** | `Ingest::BookMismatch` increments `bookMismatches`; `Ingest::SourceReset` flushes active book segment (`poly-book-wal-bridge.ts:100–132`) | Any `bookMismatches > 0` fails `isContinuityClean`; `SourceReset` cleanly isolates pre/post-reconnect state | `CODE VERIFIED` |
| **Tampered / Missing Archive Files** | `verifyL2ArchiveManifest` checks `manifestSha256`, file counts, byte sizes, and per-file SHA-256 (`l2-archive-manifest.ts:88–109`) | Reports `missing`, `mismatched`, and `unexpected` arrays and sets `ok: false` | `CODE VERIFIED` |
| **Stale Market Data** | Runtime feed age check (`STALE_FEED_HALT_THRESHOLD_MS = 1_500` ms in `quant-stress-and-bootstrap.ts`; `MARKET_DATA_MAX_AGE_MS = 5_000` ms in `poly-risk-types.ts`) | Fail-closed order halt (`STALE_MARKET_DATA`) until fresh tick arrives | `CODE VERIFIED` |

---

## 4. Survivorship-Bias Prevention Protocol

To prevent survivorship bias in 30-day L2 backtests (IC PDF pp. 49–50; `SOURCE VERIFIED`):
1. **Point-in-Time Universe Logging:** Capture must subscribe to all qualifying active markets discovered via Gamma (`active=true&closed=false`, excluding 5-minute Crypto markets via `classifyFiveMinuteExclusion`) and persist daily universe membership snapshots alongside WAL segments.
2. **Retain Resolved, Delisted & Disputed Markets:** Once a token ID enters the capture universe, its WAL segments and Parquet partitions remain immutable in the archive even after market resolution, cancellation, or UMA dispute.
3. **Dual-Timestamp Ordering:** Every WAL v3 record preserves both `recvTimestampUs` and `exchangeTimestampUs`. Replay defaults to `mode: 'recv_time'` (`poly-book-wal-bridge.ts:88`) so strategies never observe events earlier than local receipt time (zero lookahead; `CODE VERIFIED`).

---

## 5. Real 30-Second Public Read-Only Capture Drill Results

Executed via `runPublicL2CaptureDrill` (`src/desk/polymarket/l2/l2-public-capture-drill.ts`) against live public Polymarket Gamma and WebSocket market channels with zero API keys, zero wallets, and zero order endpoints (`LIVE PUBLIC READ-ONLY VERIFIED`):

| Metric | Observed Value | Evidence |
|---|---|---|
| **Window (UTC)** | `2026-11-19T03:17:40Z` – `2026-11-19T03:18:11Z` | `LIVE PUBLIC READ-ONLY VERIFIED` |
| **Status** | `CAPTURE_READY` (`holdReason: null`, `readOnly: true`) | `LIVE PUBLIC READ-ONLY VERIFIED` |
| **Capture Backend** | `ws-fallback` (writing identical WAL v3 CRC32C format) | `LIVE PUBLIC READ-ONLY VERIFIED` |
| **Duration** | `30,988 ms` | `LIVE PUBLIC READ-ONLY VERIFIED` |
| **Tokens Subscribed** | `4` live Polymarket CLOB tokens | `LIVE PUBLIC READ-ONLY VERIFIED` |
| **WAL v3 Segments** | `1` segment (`100,266` bytes) | `LIVE PUBLIC READ-ONLY VERIFIED` |
| **Segment SHA-256** | `41fa8783a57b853503a14480430b205309d8e0ee2d16a4a724124946f9b1bbcc` | `LIVE PUBLIC READ-ONLY VERIFIED` |
| **Manifest SHA-256** | `30455393a966bdbf6c984a32426ad7445b788b920d35b80b2a87f7739e0c0c77` | `LIVE PUBLIC READ-ONLY VERIFIED` |
| **Valid / Corrupt Frames** | `636` valid / `0` corrupt | `LIVE PUBLIC READ-ONLY VERIFIED` |
| **Sequence Gaps / Book Mismatches** | `0` gaps / `0` mismatches | `LIVE PUBLIC READ-ONLY VERIFIED` |
| **Replayed Book Steps** | `64` steps (original & restored identical) | `LIVE PUBLIC READ-ONLY VERIFIED` |
| **Deterministic `replayHash`** | `d0a6de8f09e8a74e4b3c92e6349152814dc97a5f31ebada8ca918da604c62584` (exact match original == restored) | `LIVE PUBLIC READ-ONLY VERIFIED` |
| **Orphan Child PIDs** | `activeChildPids: []` (zero leaked processes) | `LIVE PUBLIC READ-ONLY VERIFIED` |

**Disclosure:** While the Rust `poly-book` binary compiles and passes `cargo test` (`CODE VERIFIED`), the 30-second live drill exercised the TypeScript `ws-fallback` path writing the exact same WAL v3 CRC32C binary layout. Running `poly-book ingest --auto-rotate --parquet=true` continuously on a dedicated VPS is the next operational step.

---

## 6. Storage & 30-Day VPS + Cloudflare R2 Cost Model

Extrapolating from the observed 30-second drill (`100,266` bytes across `4` active high-volume tokens = `~0.835 KB/s/token` uncompressed WAL v3; `LIVE PUBLIC READ-ONLY VERIFIED`):

| Parameter | Conservative Sizing (25 Active Tokens) | Heavy Sizing (100 Active Tokens) | Evidence |
|---|---|---|---|
| **Raw WAL v3 Volume / Day** | `~1.80 GB/day` (`~54 GB / 30 days`) | `~7.21 GB/day` (`~216 GB / 30 days`) | Extrapolated from 30s drill (`SYNTHETIC / UNIT TEST ONLY`) |
| **Parquet Compacted (ZSTD ~5x–8x)** | `~0.25–0.36 GB/day` (`~8–11 GB / 30 days`) | `~1.0–1.4 GB/day` (`~30–43 GB / 30 days`) | Estimated compression ratio (`UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE`) |
| **VPS Compute (2–4 vCPU, 8 GB RAM, 160 GB NVMe)** | `~$20–$40 / month` | `~$40–$80 / month` | Market infrastructure estimate (`SOURCE VERIFIED` vs IC `$600/mo` full-stack budget) |
| **Cloudflare R2 Storage (`$0.015/GB-mo`, `$0` egress)** | `< $1 / month` (Parquet) or `~$1 / month` (raw WAL) | `~$1–$4 / month` | Standard R2 pricing (`SOURCE VERIFIED`) |
| **Total 30-Day L2 Capture Cost** | **`~$25–$45 / month`** | **`~$45–$85 / month`** | Well below full-stack `$600/mo` live trading infra ceiling |

---

## 7. Empirical Readiness Verdict

- **Capture & Replay Infrastructure:** **READY** (`CAPTURE_READY` verified on live public Polymarket streams with `0` corrupt frames, `0` gaps, and bit-exact restore parity; `LIVE PUBLIC READ-ONLY VERIFIED`).
- **30-Day Empirical Gate (`30_DAY_L2_DATA`):** **`INSUFFICIENT_DATA` (`0 / 30` days continuous archive; `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE`)**. No strategy alpha, markout, or capacity claim can be made until 30 consecutive days of point-in-time WAL v3 + Parquet data are archived and manifest-verified.

---

## 8. Unresolved Questions

1. Should the 30-day capture daemon run `sidecars/poly-book` in Rust (`--parquet=true`) with an hourly R2 upload + SHA-256 manifest verification cron, or retain dual WAL + Parquet for the full 30-day window?
2. Which exact market universe filter (e.g., top 25–50 non-5m-Crypto markets by 24h volume + NegRisk multi-outcome clusters) should be frozen on Day 1 to prevent mid-window universe drift?
