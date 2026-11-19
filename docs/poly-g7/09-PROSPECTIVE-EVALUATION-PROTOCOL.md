# POLY-G7 Prospective Evaluation Protocol (G7.3 Operational Runbook)

- **Document ID:** `POLY-G7-09`
- **Date:** 2026-11-19 (Asia/Saigon)
- **Scope:** Transition from `G7.3` (Read-Only Capture Ready) to `G7.4` (30–90 Day Empirical Observation) without prematurely activating paid 24/7 production trading infrastructure or live wallets (`CODE VERIFIED`).
- **Safety Boundary:** `LIVE_TRADING_ENABLED=false`; zero real funds, zero private keys, zero order-submission endpoints (`CODE VERIFIED`).

---

## 1. Pre-Start Discipline (Zero Premature Paid Infrastructure)

Do **not** provision paid 24/7 live execution infrastructure, trading wallets, or production Worker deploys during G7.3 (`CODE VERIFIED`). Validate capture locally or in bounded bursts first, then activate only a single low-cost read-only capture VPS + Cloudflare R2 archive bucket once the Founder approves the G7.3 data-collection budget (`SOURCE VERIFIED`).

---

## 2. Step 1 — Bounded Read-Only L2 Capture Verification & 30-Day Rollout

### 2.1 Local / Staging Bounded Verification Drill (`LIVE PUBLIC READ-ONLY VERIFIED`)

Before enabling continuous capture, run the bounded read-only drill CLI (`scripts/poly-l2-capture-drill.ts`) to confirm `status: "CAPTURE_READY"`, zero corrupt/gap frames, SHA-256 manifest integrity, identical restore/replay hash, and clean child teardown (`activeChildPids: []`):

```bash
npx tsx scripts/poly-l2-capture-drill.ts \
  --duration-sec 30 \
  --out-dir /tmp/poly-g7-drill \
  --strict
```

Supported flags (`scripts/poly-l2-capture-drill.ts`, `CODE VERIFIED`):
- `--duration-sec <N>`: Bounded capture window (default `30`).
- `--out-dir <DIR>`: Destination directory for WAL v3 segments, SHA-256 manifest, and restore parity check.
- `--tokens <id1,id2,...>`: Explicit CLOB token IDs; omitted auto-discovers top-volume active markets via Gamma public API.
- `--ws-only`: Forces public WebSocket WAL v3 fallback (`ws-fallback`) without spawning `poly-book`.
- `--build-poly-book`: Compiles `sidecars/poly-book` if binary is absent.
- `--strict`: Exits non-zero unless `report.status === "CAPTURE_READY"`.

### 2.2 30-Day Continuous Read-Only VPS + R2 Archive Protocol (`SOURCE VERIFIED`, `CODE VERIFIED`)

1. Run `poly-book` (`ingest --auto-rotate --parquet`) or the read-only WS recorder on a single non-trading capture host writing daily rotated WAL v3 segments (`YYYY-MM-DD.wal` / `YYYY-MM-DD.jsonl`) into `data/polymarket/l2-wal/` (`CODE VERIFIED`).
2. At UTC midnight each day, compute the SHA-256 archive manifest (`buildL2ArchiveManifest`), upload the immutable daily segment + manifest to Cloudflare R2 (object-lock / append-only prefix), and run `verifyWalRestoreParity` on a restored copy (`CODE VERIFIED`).
3. Reject any day with corrupt CRC32C frames or unrecovered sequence gaps; require `>= 30` distinct valid calendar days before evaluating `30_DAY_L2_DATA` (`CODE VERIFIED`).

---

## 3. Step 2 — Prospective Market-Blind Forecast Logging (Zero Hindcasts)

Retrospective hindcasts are strictly forbidden (`EXECUTION_MODEL_MATRIX.MARKET_BLIND_NEWS.forbiddenMetrics` includes `retrospective_hindcast_bss` and `unsealed_post_market_p_raw`) (`CODE VERIFIED`).

1. **Initialize Durable Ledger:** Instantiate `createNodeJsonlAppendStore('data/polymarket/market-blind/ledger.jsonl')` (`src/desk/polymarket/market-blind/node-market-blind-ledger-adapter.ts`, enforces `0o600` mode) and hydrate via `DurableMarketBlindLedger.hydrateFromStore(store)` (`src/desk/polymarket/market-blind/market-blind-ledger-store.ts`) (`CODE VERIFIED`). Any tampering, truncation, or out-of-order `seq`/`prevHash` raises `MarketBlindIntegrityError` immediately.
2. **Commit Sealed Blind Forecast First:** Sanitize news/context via `market-blind-sanitizer.ts` (stripping market prices/anchors) and call `ledger.commitForecast(input)` to persist a `FORECAST_COMMIT` record and obtain `SealedForecastReceipt` (`CODE VERIFIED`).
3. **Read Live Market Only After Commit:** Call `await ledger.readLiveMarketAfterCommit(receipt, reader, observedAtMs)` to record `MARKET_READ_AFTER_COMMIT`. Any `observedAtMs < receipt.loggedAtMs` throws `MarketBlindIntegrityError` (`CODE VERIFIED`).
4. **Ingest Resolutions Idempotently:** On a daily cron, fetch resolved binary Gamma/CTF markets (`outcome: 0 | 1`) and call `ingestResolvedMarketsIntoLedger(ledger, records)` (`src/desk/polymarket/market-blind/market-blind-resolution-ingestor.ts`). Already-resolved receipts are skipped idempotently (`CODE VERIFIED`).
5. **Evaluate Skill Lock:** Call `evaluateLedgerSkillStatus(ledger)` weekly. `wSkill` stays locked at `0` (`loggingOnly: true`) until `resolvedCount >= 150`, `bssOos >= 0.02`, `bssLower95 > 0`, `ece < 0.035`, and rolling 100-market Brier beats the market (`CODE VERIFIED`).

---

## 4. Step 3 — Collecting >= 500 Qualifying Maker Fills (Paper / Shadow Mode)

1. Replay recorded daily WAL v3 segments through `MAKER_ONLY_QUEUE_CONSERVATIVE` (`src/desk/polymarket/queue-aware-fill-simulator.ts` + `src/desk/polymarket/execution-model-matrix.ts`) with `100%` behind resting depth, `15%–25%` cancel attribution, `35 ms / 180 ms` log-normal cancel latency, stale-quote fill modeling, and `FiveMinuteCryptoExclusionError` active (`CODE VERIFIED`).
2. Do **not** count `TAKER_HARNESS_PAPER_BETA` fills toward the `500` qualifying maker fill floor; `assertExecutionModelMetricAllowed` blocks cross-contamination (`CODE VERIFIED`).
3. Record 5s, 60s, and 300s markout horizons alongside `EconomicPnLBreakdown` (`netEconomicPnlPusd` and `netEconomicPnlExRewardsPusd`) to measure adverse selection and rewards dependency (`CODE VERIFIED`).
4. For NegRisk (`NEGRISK_MULTI_LEG`), record passive-first thin-leg fill rates, sequential fail-fast FAK thick-leg completion rates (`>= 92%` target), stranded-leg unwind costs, `CtfEthCallPreflight` pass rates, and UMA dispute lockup carry (`CODE VERIFIED`).

---

## 5. Step 4 — Weekly Fail-Closed Scorecard Cadence

Run the machine-readable IC KPI scorecard weekly during G7.4 (`CODE VERIFIED`):

```bash
# Default workspace scan (auto-counts data/polymarket/l2-wal/ days, fail-closed)
npx tsx scripts/poly-g7-scorecard.ts

# Full empirical bundle evaluation once >=30d L2, >=500 fills, and >=150 OOS forecasts exist
npx tsx scripts/poly-g7-scorecard.ts --input data/polymarket/scorecard-input.json
```

Archive each weekly JSON output with its UTC timestamp and git SHA. Do not advance to `ECONOMIC_G11` review until `empiricalSampleGatePassed === true` and all 11 KPIs return `status: "PASS"` (`CODE VERIFIED`).

---

## 6. Unresolved Questions

1. Should the weekly `scripts/poly-g7-scorecard.ts` run be automated as a read-only GitHub Actions schedule or executed manually from the capture host?
