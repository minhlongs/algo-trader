# POLY-G8.6 — IC Day 0 Activation Checklist

**Date:** 2026-11-22  
**Current State:** `IC_DAY_0 = null` | `VPS_R2_ACTIVATION = HOLD` | `LIVE_TRADING_ENABLED = false`  
**Rule:** Every gate below is **sequential and fail-closed**. No phase may start while any prerequisite gate is `HOLD` or `UNKNOWN`.

---

## Pre-Day-0 External Gates (All Currently `HOLD`)

- [ ] **Gate A — Written Data License (`#278`):** Signed/written permission from Adventure One QSS, Inc. and/or ICE Data Services covering Vietnam operator, up to 150 markets, automated API/WebSocket L2 snapshots/deltas/trades, 30-day rolling WAL/Parquet retention, isolated Linux VPS processing, and private Cloudflare R2 storage.
- [ ] **Gate C — Vietnam Legal G12 Opinion:** Dated written preliminary legal opinion from independent licensed Vietnamese counsel clearing Research Group 1 (data collection + offline backtest) under current Vietnamese law (including Law `71/2025/QH15`, Resolution `05/2025/NQ-CP`, privacy, and cross-border cloud rules).
- [ ] **Gate D — Infrastructure & License Budget Sign-Off:** Founder explicit written approval of total recurring monthly cost (VPS + R2 + tax + payment fees + Track A license fee) and hard spending stop-trigger.
- [ ] **Gate E — Resolution Authority & Code Baseline:** Track E Draft PR `#292` (`fix/poly-g8-6-settlement-provenance`) reviewed, CI-green, and merged to `main`; independent checkpoint path and verifier public-key registry provisioned outside operator/collector write scope; authorized live Polygon PoS chain verifier deployed (offline fixtures only at this stage); IC repeated-forecast policy formally signed.

---

## Controlled Activation Sequence (Only After All Pre-Day-0 Gates Pass)

1. **Provision Isolated Infra:** One non-root Linux VPS in a contractually & legally permitted region (never for geo-circumvention) + one private Cloudflare R2 Standard bucket (public access off, separate bucket-scoped uploader credentials, zero trading/signing keys).
2. **24-Hour Bounded Read-Only Qualification:**
   - Auto-stop timer at 24h (or immediate halt on disk >70%, R2 op anomaly, or budget projection exceeding approved ceiling).
   - Measure actual `bytes/market-hour`, WAL/Parquet compression ratios, local 48h spool disk footprint, and manifest SHA-256 round-trip replay.
3. **7-Day Operational Qualification:**
   - Verify zero unrecovered WS gaps, zero hash-chain/checkpoint drift, and verified download-and-replay from R2.
   - **Rule:** Neither the 24h drill nor the 7d qualification counts toward the 30-day IC evidence window.
4. **Formal `IC_DAY_0` Declaration:**
   - Founder signs `IC_DAY_0` timestamp in `docs/poly-g8-4/ic-roadmap-manifest.json` and starts the qualifying 30-day observation window (`30_DAY_L2_DATA` + 150+ finalized on-chain Market-Blind OOS resolutions).

---

## Hard Kill & Rollback Triggers

- Immediate collector halt if: license revoked or scope exceeded, Vietnam legal status changes, monthly projected cost exceeds approved ceiling, disk occupancy exceeds 75%, or any unauthorized credential/key is detected on the collector host.
- `LIVE_TRADING_ENABLED` remains `false` throughout the entire 30-day research program (`REAL_MONEY_TRADING = DISABLED`).
