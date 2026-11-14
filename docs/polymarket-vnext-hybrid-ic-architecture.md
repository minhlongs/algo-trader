# Polymarket Quant Alpha vNext — Hybrid IC Architecture

## Overview

`algo-trader` runs a **Hybrid Rust + TypeScript** architecture for the Polymarket CLOB V2 & Gnosis CTF desk (`Issue #269`, closing `#268`):

1. **Rust Sidecar — `sidecars/poly-book` (`weiminglong/poly-book`, MIT, `unsafe_code = "forbid"`)**:
   - Subscribes to Polymarket CLOB V2 market WebSockets, maintains fixed-point order books (`10^-4` price, `10^-6` size), writes hardware Castagnoli **CRC32C WAL v3** segments (`segment_*.wal`) and Zstd Parquet snapshots.
   - Bridged into `algo-trader` via `src/desk/polymarket/l2/poly-book-wal-{crc32c,codec,bridge}.ts` with dual-clock replay (`recv_time` and `exchange_time`), continuity gap counting, and provenance label `'poly-book-wal'`.
2. **Rust Sidecar — `sidecars/ghost-guard` (`OrderBookTrade/GhostGuard`, MIT)**:
   - Verifies Polygon settlement transactions against JSON-RPC (`eth_getTransactionReceipt` + `eth_call` revert decoding for `status = 0` `TRANSFER_FROM_FAILED` Ghost Fills).
   - Bridged into `algo-trader` via `src/desk/polymarket/ghost-guard-webhook-bridge.ts` (`127.0.0.1` loopback `/ghost-alert` with Host/CSRF/Bearer protection), latching `PolyKillSwitch` synchronously (`< 100ms` local drill).
3. **TypeScript Strategy, Risk & Portfolio Core (`src/desk/`)**:
   - **Defect Remediations**:
     - `resolveOutcomeTokenId` (`src/desk/polymarket/outcome-token-resolver.ts`) eliminates the `noTokenId ?? yesTokenId` bug (`#268`) across all Polymarket strategies.
     - `NegRiskBundleArbitrageStrategy` enforces distinct `'touch'` (`bestBid`) vs `'one-tick-inside'` (`min(bestBid + tick, bestAsk - tick)`) passive thin-leg placement.
     - `runObservedQuantAlphaReplay` enforces `evaluatePolyRisk` preflight fail-closed.
   - **Strategy 3 + 7 (Microstructure Regime & CLOB V2 Surface)**:
     - 5-state `LiquidityRegimeMachine` (`QUIET`, `TRENDING`, `EVENT`, `REDUCE_ONLY`, `HALTED`) with 60–180s `EVENT` hysteresis, 5s `POST /heartbeats` supervisor, `GET /order-scoring` checker, `HTTP 425` 120s post-only cooldown, and hard 5-minute Crypto exclusion.
   - **Strategy 2 Pilot-Ready Settlement Surface**:
     - Mandatory `eth_call` simulation preflight before `convertPositions` / `merge_pusd` / `redeemPositions`, isolated `Poly1271` (`signatureType = 3`) Session Key signer (`MASTER_KEY_FORBIDDEN_IN_RUNTIME`), and standalone bounded `pUSD` approval script (`--dry-run` default).
   - **Strategy 4 + 6 (Arbiter News & Market-Blind Bayesian Shrunk Fair-Value)**:
     - Normalized host/URL whitelist pre-screen + non-overridable `forbiddenTerms` veto + opt-in 3rd `arbiter` split tiebreak inside `dualVerifyWindowMs`.
     - `sanitizeMarketBlindContext` strips 30+ market/odds/orderbook keys and inline price anchors, enforces `6,000` / `24,000` character caps, and blocks hindcasts (`<= modelKnowledgeCutoffMs`).
     - `MarketBlindProspectiveLedger` seals raw forecasts in a SHA-256 hash chain before live market observation; `evaluateSkillGate` locks `w_skill = 0` until `N >= 150`, `BSS_OOS >= +0.02`, `95% LB > 0`, `ECE < 0.035`, and rolling-100 Brier beats market.
   - **Strategy 8 (Lockup-Adjusted Multi-Market Kelly)**:
     - Spectral Projected Gradient Ascent + Dykstra projection solver (`src/desk/portfolio/poly-lockup-kelly-solver.ts`) enforcing `0.15–0.25` fractional Kelly, `4.5%/yr` lockup carry + UMA `RR_i` drag, `<= 3.0% NAV` worst-case cluster loss, freeze above `10% NAV` UMA dispute or `5.0%` portfolio drawdown, and early rotation at `>= 80%` profit capture with `> 15d` remaining lockup.

## Commands

```bash
# Build Rust sidecars (release)
cargo build --release --manifest-path sidecars/poly-book/Cargo.toml
cargo build --release --manifest-path sidecars/ghost-guard/Cargo.toml

# Sidecar health, deterministic status=0 Ghost Fill drill, and WAL sample check
npm run poly:sidecars -- doctor
npm run poly:sidecars -- drill-ghost
npm run poly:sidecars -- capture-sample

# Bounded pUSD ERC-20 approval preflight (always defaults to --dry-run)
npx tsx scripts/poly-approve-pusd.ts --dry-run

# Governance KPI evaluation (baseline and IC --stress shock mode)
npm run kpi:poly -- --days 14 --record-ms 0
npm run kpi:poly -- --days 14 --record-ms 0 --stress

# CI Backtest Integrity, EOD Diagnostics & 10-Repo Upstream Watchlist audit
npm run poly:governance
```

## Runtime Safety Invariants

- Paper/Shadow default: `LIVE_TRADING_ENABLED=false`; zero real orders or private keys in repo or tests.
- Worker bundle isolation: Rust sidecars (`sidecars/**`) and Node-only desk scripts (`scripts/**`) are excluded from `tsconfig.worker.json`.
