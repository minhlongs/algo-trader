# POLY-G7.0 — Investment Committee PDF-to-Repository Traceability Matrix

- **Date:** 2026-11-19 (Asia/Saigon)
- **Branch:** `feat/poly-g7-ic-quant-validation`
- **Baseline Commit:** `origin/main` `558adee1` (`SOURCE VERIFIED`)
- **Source Doctrine:** `Kiến Trúc Quant Alpha Polymarket.pdf` (80 pages, 2026-11-12; `SOURCE VERIFIED`)
- **Live Trading Status:** `DISABLED` (`LIVE_TRADING_ENABLED=false`; `CODE VERIFIED`)

---

## 1. Evidence & Status Taxonomy

All claims and metrics in this matrix use the six mandatory evidence tags:
- `SOURCE VERIFIED` — Directly verified from the 80-page IC PDF, repository code, git history, or GitHub state.
- `CODE VERIFIED` — Verified via TypeScript/Rust source inspection and passing automated unit/integration tests.
- `LIVE PUBLIC READ-ONLY VERIFIED` — Verified against live public Polymarket endpoints with zero auth, keys, or order endpoints.
- `SYNTHETIC / UNIT TEST ONLY` — Validated solely on deterministic synthetic or mocked inputs.
- `NOT IMPLEMENTED` — Absent from production runtime or stubbed only.
- `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` — Empirical sample floor unmet (`< 30` days L2 WAL, `< 500` qualifying maker fills, or `< 150` resolved OOS forecasts).

Every requirement row carries one of seven exact status labels: `IMPLEMENTED & VERIFIED`, `IMPLEMENTED (UNIT/SYNTHETIC ONLY)`, `PARTIAL`, `MISSING`, `INTENTIONALLY DEVIATED (ADR)`, `BLOCKED EXTERNAL`, or `INSUFFICIENT EMPIRICAL DATA`.

---

## 2. Repository & GitHub Governance Baseline

| Surface | Verified State (2026-11-19) | Evidence | Open Gap / Action |
|---|---|---|---|
| `origin/main` HEAD | `558adee1` (PR `#273` / `#274` merged); CI/CD + Security workflows green | `SOURCE VERIFIED` | None on main CI/Security; prior `Load Test` workflow on `b778f53a` failed and has not been re-validated on `558adee1`. |
| GitHub Issue `#271` | Node 26 `npm run disk:check` / `build:worker` missing `scripts/disk-monitor.ts` | `SOURCE VERIFIED` | Remediated in POLY-G5 (`tsx` + `fs.statfsSync`, `docs/poly-g5-forensics-and-boundary-matrix.md`), but Issue `#271` remains **open** on GitHub pending closeout verification. |
| GitHub Issue `#272` | ExchangeV3 EIP-712 `ORDER_FIELD_TYPES` parity with `@polymarket/clob-client-v2` | `SOURCE VERIFIED` | Offline 11-field SDK byte-for-byte parity fixed and tested in `tests/polymarket/clob-v2-order-signing-sdk-parity.test.ts` (`CODE VERIFIED`), but live venue smoke remains gated on G12/G13 and Issue `#272` remains **open**. |
| GitHub Issue `#275` | `POLY-G6` USER_001 `$100` paper pilot tracking | `SOURCE VERIFIED` | Paper beta live (`poly-beta-api` / `poly-beta-dashboard`); real-money `$100` pilot remains `DISABLED` (`HOLD`) and is an operational smoke deviation from IC `2,500–5,000 pUSD`. |
| GitHub Issue `#276` | `POLY-G7` IC Quant Validation tracking issue | `SOURCE VERIFIED` | Active under branch `feat/poly-g7-ic-quant-validation`. |

---

## 3. Deliverables A–F Traceability Matrix

### Deliverable A — Executive Thesis, Scope & Repository Selection (PDF pp. 2–4)

| ID | PDF Requirement (Pages) | Repo Files & Tests | Status | Evidence | Gap / Notes |
|---|---|---|---|---|---|
| A.1 | Exclude 5-minute Crypto markets (taker adverse selection / 150ms delay) (p. 2, p. 31) | `src/desk/polymarket/five-minute-crypto-guard.ts`, `src/desk/polymarket/execution-model-matrix.ts`, `tests/polymarket/quant-stress-and-bootstrap.test.ts` | `IMPLEMENTED & VERIFIED` | `CODE VERIFIED` | Hard-rejected in `classifyFiveMinuteExclusion` and enforced in `EXECUTION_MODEL_MATRIX`. |
| A.2 | Adopt 5 canonical upstream repos (`nautilus_trader` 86, `poly-book` 85, `poly-maker` 90, `GhostGuard` 81, `predict-raven` 86) (pp. 3–4, pp. 49–55) | `sidecars/poly-book/`, `sidecars/ghost-guard/`, `src/desk/polymarket/market-blind/`, `src/desk/polymarket/log-odds-avellaneda-stoikov-mm.ts` | `INTENTIONALLY DEVIATED (ADR)` | `SOURCE VERIFIED` | `poly-book` and `ghost-guard` vendored as Rust sidecars; `poly-maker` and `predict-raven` market-blind core ported to TS; `nautilus_trader` intentionally not adopted as runtime engine per `02-HYBRID-ARCHITECTURE-ADR.md` (Option A). |
| A.3 | Conditional micro-pilot `2,500–5,000 pUSD` only after all 11 KPIs + legal/founder gates pass (p. 2, p. 65, pp. 74–75) | `src/desk/polymarket/ic-kpi-scorecard.ts`, `docs/poly-g5-live-pilot-readiness-and-gates.md`, `tests/polymarket/ic-kpi-scorecard.test.ts` | `BLOCKED EXTERNAL` | `CODE VERIFIED` | `REAL_MONEY_TRADING` locked `DISABLED`; G11 (`HOLD`), G12 legal (`HOLD`), G13 founder (`HOLD`). |

### Deliverable B — Venue Microstructure, CLOB V2 / ExchangeV3 & Settlement (PDF pp. 4–29)

| ID | PDF Requirement (Pages) | Repo Files & Tests | Status | Evidence | Gap / Notes |
|---|---|---|---|---|---|
| B.1 | CLOB V2 / ExchangeV3 11-field EIP-712 order signing & transport separation (pp. 6–11) | `src/desk/polymarket/clob-v2-order-signing.ts`, `src/desk/polymarket/clob-v2-order-transport.ts`, `tests/polymarket/clob-v2-order-signing-sdk-parity.test.ts` | `IMPLEMENTED (UNIT/SYNTHETIC ONLY)` | `CODE VERIFIED` | Offline byte-for-byte parity with `@polymarket/clob-client-v2@0.2.7` verified; live authenticated venue smoke blocked on G12/G13 (`#272` still open). |
| B.2 | Non-custodial `Poly1271` session signer isolating Deposit Wallet from runtime (`signatureType = 3`) (pp. 12–15) | `src/desk/polymarket/poly1271-session-signer.ts`, `src/desk/polymarket/pusd-bounded-approval-runner.ts`, `tests/polymarket/poly-vnext-deep-branch-coverage.test.ts` | `IMPLEMENTED (UNIT/SYNTHETIC ONLY)` | `CODE VERIFIED` | Hard-rejects master keys (`MASTER_KEY_FORBIDDEN_IN_RUNTIME`), retired V1 exchange, non-pUSD collateral, expired TTLs; live on-chain EIP-1271 validation unexercised (G12/G13). |
| B.3 | `POST /heartbeats` 5s deadman switch & HTTP 425 engine-restart 120s post-only cooldown (pp. 16–19) | `src/desk/polymarket/clob-v2-heartbeat-service.ts`, `src/desk/polymarket/clob-v2-submit-classifier.ts`, `tests/polymarket/clob-v2-submit-classifier.test.ts` | `IMPLEMENTED (UNIT/SYNTHETIC ONLY)` | `CODE VERIFIED` | Fires `PolyKillSwitch` on `>= 2` consecutive misses (10s window); HTTP 425 triggers 120s `EngineRestartCooldown`. Live authenticated heartbeat unverified. |
| B.4 | Ghost fill detection (`status=0` Polygon receipt) & sub-100ms cancel-all defense (pp. 20–24, p. 51, p. 55) | `sidecars/ghost-guard/src/`, `src/desk/polymarket/ghost-guard-webhook-bridge.ts`, `src/desk/polymarket/ghost-guard-drill-rpc.ts`, `tests/polymarket/ghost-guard-webhook-bridge.test.ts` | `PARTIAL` | `CODE VERIFIED` | TS webhook bridge latches `PolyKillSwitch` (`74.35ms` drill in POLY-G5). However, Rust `sidecars/ghost-guard/src/defense.rs` is an empty `TODO(phase-3)` stub and `callback.rs` lacks HMAC signing/retry backoff. |
| B.5 | On-chain CTF `eth_call` preflight, Gnosis Safe relayer & 5-tier FIFO redemption reconciliation (pp. 25–29) | `src/desk/polymarket/ctf-eth-call-preflight.ts`, `src/desk/polymarket/gnosis-ctf-settlement-relayer.ts`, `src/desk/polymarket/poly-settlement-reconciliation-drills.ts`, `tests/polymarket/poly-settlement-reconciliation-drills.test.ts` | `IMPLEMENTED (UNIT/SYNTHETIC ONLY)` | `CODE VERIFIED` | Deterministic reconciliation drills pass (`<= 1` token drift); live Polygon mainnet relayer submission disabled until G12/G13. |

### Deliverable C — Fees, Economic Truth PnL & Strategy Design (PDF pp. 29–48)

| ID | PDF Requirement (Pages) | Repo Files & Tests | Status | Evidence | Gap / Notes |
|---|---|---|---|---|---|
| C.1 | Dynamic quadratic fee schedule `C * feeRate * p * (1-p)` (5-decimal rounding), Maker `0%`, category rebates (pp. 31–32) | `src/desk/execution/polymarket-clob-v2-fee-categories.ts`, `src/desk/polymarket/polymarket-fee-calculator.ts`, `src/desk/polymarket/fee-schedule-resolver.ts`, `tests/polymarket/execution-model-matrix-and-fees.test.ts` | `PARTIAL` | `CODE VERIFIED` | Formula and Crypto (`0.07`, 20%), Politics/Finance (`0.04`, 25%), Geopolitics (`0.00`) match PDF. Minor rebate/rate divergences vs PDF p. 31–32: Sports rebate coded `20%` (PDF `15%`), Culture `0.04`/20% (PDF `0.05`/25%), Tech rebate `20%` (PDF `25%`), Combos/RFQ/Economics/Weather/Mentions lack dedicated enum keys. |
| C.2 | 5-quantity Economic Truth PnL + `4.5%/yr` locked-capital carry + UMA dispute buffer + rewards-dependency flag (p. 30, pp. 32–33) | `src/desk/polymarket/economic-truth-pnl.ts`, `tests/polymarket/economic-truth-pnl.test.ts` | `IMPLEMENTED & VERIFIED` | `CODE VERIFIED` | Separates MTM, Realized Trading, Settled, Capital-Adjusted Return, and Annualized Return on Capital Tied Up; exposes `netEconomicPnlExRewardsPusd` and `isRewardsDependent`. |
| C.3 | Log-odds Avellaneda-Stoikov market maker with OFI/VPIN toxicity skew & regime machine (pp. 34–38) | `src/desk/polymarket/log-odds-avellaneda-stoikov-mm.ts`, `src/desk/polymarket/onchain-ofi-vpin-estimator.ts`, `src/desk/polymarket/liquidity-regime-machine.ts`, `tests/polymarket/quant-alpha-strategies-and-kpi-coverage.test.ts` | `INSUFFICIENT EMPIRICAL DATA` | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` | Code verified on synthetic inputs; `0 / 500` qualifying live/L2-replayed maker fills recorded. |
| C.4 | NegRisk multi-outcome bundle arbitrage (passive-first thin leg, sequential fail-fast FAK thick leg, stranded-leg unwind) (pp. 39–42) | `src/desk/polymarket/execution-model-matrix.ts`, `src/desk/polymarket/paper-leg-decay-tracker.ts`, `src/desk/polymarket/polymarket-oos-arb-episode-simulator.ts` | `INSUFFICIENT EMPIRICAL DATA` | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` | Execution policy and leg-decay model verified on synthetic episodes; `0 / 30` days L2 WAL replay data. |
| C.5 | Market-blind forecasting pipeline (`predict-raven` core: sealed `p_raw`, sanitizer, 5-gate OOS skill unlock `w_skill`) (pp. 43–48) | `src/desk/polymarket/market-blind/market-blind-sanitizer.ts`, `market-blind-prospective-ledger.ts`, `market-blind-ledger-store.ts`, `market-blind-resolution-ingestor.ts`, `market-blind-shrunk-posterior.ts`, `tests/polymarket/market-blind-durable-ledger.test.ts` | `INSUFFICIENT EMPIRICAL DATA` | `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` | Durable ledger, sanitizer, and fail-closed `w_skill = 0` gate are `CODE VERIFIED`; resolved prospective OOS forecasts = `0 / 150`. |

### Deliverable D — Data Infrastructure, Sidecars & Execution Architecture (PDF pp. 48–58)

| ID | PDF Requirement (Pages) | Repo Files & Tests | Status | Evidence | Gap / Notes |
|---|---|---|---|---|---|
| D.1 | Continuous point-in-time L2 capture (`poly-book` WAL v3 CRC32C + Parquet + SHA-256 manifest + deterministic restore) (pp. 49–53) | `sidecars/poly-book/crates/`, `src/desk/polymarket/l2/poly-book-wal-crc32c.ts`, `poly-book-wal-bridge.ts`, `l2-archive-manifest.ts`, `l2-public-capture-drill.ts`, `tests/polymarket/l2/l2-archive-manifest.test.ts`, `l2-public-capture-drill.test.ts` | `PARTIAL` | `LIVE PUBLIC READ-ONLY VERIFIED` | 30s public read-only capture drill passed (`CAPTURE_READY`, 636 valid WAL v3 frames, 0 corrupt/gaps, identical replayHash). Continuous 30-day VPS+R2 daemon not yet deployed (`0 / 30` days archived). |
| D.2 | Deterministic `clientOrderId` / salt derivation & atomic single-in-flight `cancel/replace` state machine (pp. 52–54) | `src/desk/execution/deterministic-client-order-id.ts`, `src/desk/execution/polymarket-cancel-replace.ts`, `tests/execution/deterministic-id-and-cancel-replace.test.ts` | `IMPLEMENTED & VERIFIED` | `CODE VERIFIED` | Closes the 2 primary NautilusTrader parity gaps identified in ADR Option A; restart-safe registry and HTTP 425 deferral verified by unit tests. |
| D.3 | Queue-conservative fill simulator (100% behind resting depth, 15%–25% cancel attribution, log-normal cancel 35ms/180ms p99, 150ms crypto delay) (p. 58) | `src/desk/polymarket/queue-aware-fill-simulator.ts`, `src/desk/polymarket/execution-model-matrix.ts`, `tests/polymarket/queue-aware-fill-simulator.test.ts` | `IMPLEMENTED & VERIFIED` | `CODE VERIFIED` | Exact PDF constants pinned and enforced; separates product taker smoke harness from maker/NegRisk/market-blind validation harnesses. |

### Deliverable E — 11 IC KPIs, Statistical Validation & Stress Testing (PDF pp. 58–62)

| ID | PDF Requirement (Pages) | Repo Files & Tests | Status | Evidence | Gap / Notes |
|---|---|---|---|---|---|
| E.1 | 11-KPI machine-readable IC scorecard with fail-closed sample floors (`30d` L2, `500` fills, `150` OOS) (pp. 59–62) | `src/desk/polymarket/ic-kpi-scorecard.ts`, `scripts/poly-g7-scorecard.ts`, `tests/polymarket/ic-kpi-scorecard.test.ts` | `IMPLEMENTED & VERIFIED` | `CODE VERIFIED` | All 11 KPIs currently output `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` and lock `ECONOMIC_G11 = HOLD`, `REAL_MONEY_TRADING = DISABLED`. |
| E.2 | Stationary block bootstrap 95% CI & Bailey–Lopez de Prado Deflated Sharpe Ratio (pp. 59–60) | `src/desk/polymarket/quant-stress-and-bootstrap.ts`, `src/desk/backtesting/stationary-block-bootstrap.ts`, `src/desk/backtesting/deflated-sharpe.ts`, `tests/polymarket/quant-stress-and-bootstrap.test.ts` | `IMPLEMENTED & VERIFIED` | `CODE VERIFIED` | Deterministic seeded bootstrap and DSR probability verified on unit inputs; awaits 30d empirical return series. |
| E.3 | 9-scenario IC stress suite (4 economic shocks + 5 fail-closed operational guards) (pp. 60–62) | `src/desk/polymarket/quant-stress-and-bootstrap.ts`, `tests/polymarket/quant-stress-and-bootstrap.test.ts` | `IMPLEMENTED (UNIT/SYNTHETIC ONLY)` | `SYNTHETIC / UNIT TEST ONLY` | All 9 scenarios implemented and passing on synthetic baselines; empirical strategy stress resilience remains `INSUFFICIENT_DATA`. |

### Deliverable F — Risk Controls, Capital Sizing & Go-Live Governance (PDF pp. 62–68)

| ID | PDF Requirement (Pages) | Repo Files & Tests | Status | Evidence | Gap / Notes |
|---|---|---|---|---|---|
| F.1 | Fail-closed pre-trade risk engine (cluster `< 3%` NAV, UMA `> 10%` NAV freeze, drawdown auto-halt, min 5 shares, stale feed) (pp. 62–65) | `src/desk/risk/poly-fail-closed-risk-engine.ts`, `poly-fail-closed-risk-checks.ts`, `poly-risk-types.ts`, `tests/risk/poly-fail-closed-risk-engine.test.ts` | `IMPLEMENTED & VERIFIED` | `CODE VERIFIED` | Type-level `'unknown'` enforcement denies unresolved state. Note: `MARKET_DATA_MAX_AGE_MS = 5_000` in `poly-risk-types.ts` vs `STALE_FEED_HALT_THRESHOLD_MS = 1_500` in `quant-stress-and-bootstrap.ts` (see Report `08`). |
| F.2 | Capital viability & Minimum Viable Capital (`40,000–50,000 pUSD` for `~$7,200/yr` infra; `2,500–5,000 pUSD` conditional pilot) (p. 65, p. 68, pp. 74–75) | `src/desk/polymarket/economic-truth-pnl.ts`, `docs/poly-g7/06-ECONOMIC-TRUTH-PNL-AND-COST-MODEL.md` | `BLOCKED EXTERNAL` | `SOURCE VERIFIED` | Documented and modeled; real capital allocation gated on G11, G12, and G13. |
| F.3 | Legal eligibility (Vietnam operator/user jurisdiction, Polymarket ToS, zero VPN circumvention) & Founder sign-off (pp. 66–68) | `docs/poly-g5-live-pilot-readiness-and-gates.md` | `BLOCKED EXTERNAL` | `SOURCE VERIFIED` | Independent legal review (`G12`) and Founder capital sign-off (`G13`) remain `HOLD`. |

---

## 4. Summary of Critical Gaps

1. **Empirical Data Deficit (`INSUFFICIENT EMPIRICAL DATA`):** `0/30` days continuous L2 WAL archive, `0/500` qualifying L2-replayed maker fills, `0/150` resolved market-blind OOS forecasts (`UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE`).
2. **Rust Sidecar Defense Gap (`PARTIAL`):** `sidecars/ghost-guard/src/defense.rs` is an unimplemented `TODO(phase-3)` stub, and `callback.rs` posts webhooks without HMAC authentication or retry backoff (`CODE VERIFIED`).
3. **Fee Schedule Minor Drift (`PARTIAL`):** `CLOB_V2_QUADRATIC_RATES` has small rebate/rate discrepancies vs PDF pp. 31–32 for Sports, Culture, Tech, and lacks explicit keys for Economics/Weather/Mentions/Combos/RFQ (`CODE VERIFIED`).
4. **Stale Feed Threshold Alignment (`PARTIAL`):** `poly-risk-types.ts` defaults `MARKET_DATA_MAX_AGE_MS = 5_000` ms while IC stress guard enforces `1_500` ms (`CODE VERIFIED`).
5. **Open Governance & CI Items (`BLOCKED EXTERNAL`):** GitHub Issues `#271` and `#272` remain open pending closeout; `Load Test` failed on `b778f53a`; G11/G12/G13 remain `HOLD` (`SOURCE VERIFIED`).

---

## 5. Unresolved Questions

1. Should `CLOB_V2_QUADRATIC_RATES` be updated to match every category/rebate row on IC PDF pp. 31–32 (`Sports 15%`, `Culture 0.05/25%`, `Tech 25%`, plus `Economics`/`Weather`/`Mentions`/`Combos/RFQ`) before starting 30-day shadow accounting?
2. Should `MARKET_DATA_MAX_AGE_MS` in `src/desk/risk/poly-risk-types.ts` be tightened from `5_000` ms to `1_500` ms globally for live maker strategies?
3. When will the dedicated low-latency VPS + R2 bucket be provisioned to start day 1 of the 30-day continuous `poly-book` L2 capture?
