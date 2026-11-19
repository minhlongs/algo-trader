# POLY-G7 — Fail-Closed Risk Controls, 9-Scenario Stress Matrix & Statistical Validation

- **Date:** 2026-11-19 (Asia/Saigon)
- **Branch:** `feat/poly-g7-ic-quant-validation`
- **Core Modules:** `src/desk/risk/poly-fail-closed-risk-engine.ts`, `poly-fail-closed-risk-checks.ts`, `poly-kill-switch.ts`, `src/desk/polymarket/clob-v2-heartbeat-service.ts`, `ghost-guard-webhook-bridge.ts`, `poly1271-session-signer.ts`, `quant-stress-and-bootstrap.ts` (`CODE VERIFIED`)
- **Test Suites:** `tests/risk/poly-fail-closed-risk-engine.test.ts`, `tests/risk/poly-kill-switch.test.ts`, `tests/polymarket/quant-stress-and-bootstrap.test.ts`, `tests/polymarket/ghost-guard-webhook-bridge.test.ts` (`CODE VERIFIED`)

---

## 1. Fail-Closed Pre-Trade Risk & Custody Architecture

Every pre-trade risk check in `evaluatePolyRisk(intent, state)` (`src/desk/risk/poly-fail-closed-risk-engine.ts`) is pure, deterministic, and type-level fail-closed (`T | 'unknown' | undefined`). Any missing, `'unknown'`, NaN, or malformed state routes directly to a deny verdict (`UNRESOLVED_STATE`; `CODE VERIFIED`).

| Risk Control | Enforcement Mechanism & Exact Threshold | Block / Halt Action | Evidence |
|---|---|---|---|
| **Pre-Trade Risk Gate (`evaluatePolyRisk`)** | Checks kill switch, intent validity (`price in (0,1)`, `size > 0`), min resting size (`>= 5` shares for GTC/GTD), GTD future expiration, notional cap, fee schedule match, position reconciliation TTL (`<= 60_000` ms) (`poly-fail-closed-risk-checks.ts`) | Returns `{ allowed: false, reason }` — zero silent pass | `CODE VERIFIED` |
| **Latching Kill Switch (`createPolyKillSwitch`)** | Synchronous latch before `await` prevents concurrent double cancel-all; issues `DELETE /cancel-all`; stays latched even if HTTP cancel-all throws; records full audit trail (`fired`, `idempotent-replay`, `reset`) (`poly-kill-switch.ts`) | Blocks all new orders (`KILL_SWITCH_ACTIVE`) until explicit manual `reset()` | `CODE VERIFIED` |
| **Heartbeat Deadman (`ClobV2HeartbeatService`)** | `POST /heartbeats` every `5_000` ms (`DEFAULT_HEARTBEAT_INTERVAL_MS`), per-tick abort timeout `<= 4_500` ms; fires `killSwitch` on `>= 2` consecutive misses (`10s` window; `clob-v2-heartbeat-service.ts:10–11, 188–194`) | Fires `killSwitch.fire('heartbeat-deadman-missed')` | `CODE VERIFIED` |
| **HTTP 425 Engine Restart Cooldown** | `classifyClobV2SubmitResponse` + `EngineRestartCooldown` (`clob-v2-submit-classifier.ts`); integrated into `ClobV2HeartbeatService` and `PolymarketCancelReplaceManager` | `120_000` ms (`120s`) post-only cooldown; defers active cancel/replace transitions (`ENGINE_RESTART_COOLDOWN_DEFERRED`) | `CODE VERIFIED` |
| **Stale Market Data Gate** | `STALE_FEED_HALT_THRESHOLD_MS = 1_500` ms (`quant-stress-and-bootstrap.ts:14`); `MARKET_DATA_MAX_AGE_MS = 5_000` ms (`poly-risk-types.ts:91`) — **Audit Gap:** tighten `poly-risk-types.ts` to `1_500` ms for maker quoting | Denies with `STALE_MARKET_DATA` (also rejects future-skewed timestamps `ageMs < 0`) | `CODE VERIFIED` |
| **GhostGuard Receipt `status=0` Breaker** | `sidecars/ghost-guard` -> loopback `127.0.0.1` `POST /ghost-alert` -> `handleGhostGuardPayload` (`ghost-guard-webhook-bridge.ts`) latches `PolyKillSwitch` synchronously (`74.35ms < 100ms` drill in POLY-G5) | Immediate `killSwitch.fire('ghost-guard:...')` on `Ghost`, `Timeout`, or `GhostFillEvent` | `CODE VERIFIED` |
| **Cluster Tail Loss Cap** | `CLUSTER_TAIL_LOSS_MAX_NAV_FRACTION = 0.03` (`< 3.0%` NAV; `poly-risk-types.ts:102`, `poly-fail-closed-risk-checks.ts:134–155`) | Denies with `CLUSTER_TAIL_LOSS_ABOVE_CAP` (enforced even on `REDUCE_ONLY` exits if projected cluster loss breaches cap) | `CODE VERIFIED` |
| **UMA Dispute Lockup Freeze** | `PORTFOLIO_UMA_DISPUTE_MAX_NAV_PCT = 10.0` (`> 10%` NAV; `poly-risk-types.ts:98`, `poly-fail-closed-risk-checks.ts:144–146`) | Denies new risk-increasing orders with `UMA_DISPUTE_LOCKUP_HALT` while permitting `REDUCE_ONLY` sells | `CODE VERIFIED` |
| **Drawdown Auto-Halt & Kelly Freeze** | `DRAWDOWN_AUTO_HALT_PCT = 3.0%` (single-strategy), `PORTFOLIO_KELLY_DRAWDOWN_FREEZE_PCT = 5.0%` (`poly-risk-types.ts:96–100`) | Denies with `DRAWDOWN_AUTO_HALT` / `PORTFOLIO_KELLY_FROZEN` | `CODE VERIFIED` |
| **AI Authority Boundary** | `EXECUTION_MODEL_MATRIX.MARKET_BLIND_NEWS` + `market-blind-shrunk-posterior.ts` enforce sealed `p_raw` prior to market read and 5-gate OOS skill unlock (`>= 150` resolved forecasts) | Fail-closed `w_skill = 0`; AI cannot emit orders or override deterministic risk gates | `CODE VERIFIED` |
| **Non-Custodial Signing (`Poly1271SessionSigner`)** | Isolates ERC-1967/EIP-1271 Deposit Wallet (`maker`, `signatureType = 3`) from session EOA (`signer`); hard-rejects `POLY_OWNER_MASTER_PRIVATE_KEY` (`MASTER_KEY_FORBIDDEN_IN_RUNTIME`), retired V1 exchange, non-pUSD collateral, raw L1/L2 tx signing, and expired `sessionExpiresAtSec` (`poly1271-session-signer.ts`) | Throws `Poly1271IsolationError` at boot or sign time; verifies `ethers.verifyTypedData` recovery before returning | `CODE VERIFIED` |

### Critical Rust Sidecar Disclosure (`sidecars/ghost-guard`)
Direct source inspection of `sidecars/ghost-guard/src/` reveals two unclosed hardening items (`CODE VERIFIED`):
1. **`sidecars/ghost-guard/src/defense.rs` (`NOT IMPLEMENTED`):** Currently an empty `TODO(phase-3)` stub. Direct Rust-side CLOB auto-cancel and persistent counterparty blacklisting (`data/blacklist.txt`) are not implemented; defense relies entirely on the TypeScript `ghost-guard-webhook-bridge.ts` -> `PolyKillSwitch` path.
2. **`sidecars/ghost-guard/src/callback.rs` (`PARTIAL`):** Dispatches JSON webhooks via `reqwest::Client::new().post(url)` without HMAC signature headers, bearer auth token support, or retry backoff on transient non-2xx/network errors. While `startGhostGuardWebhookServer` enforces loopback `127.0.0.1` binding by default (`ghost-guard-webhook-bridge.ts:101–105`), production VPS deployment must add shared-secret HMAC + retry before live funds.

---

## 2. Nine-Scenario IC Stress Matrix (`runNineScenarioStressSuite`)

Implemented in `src/desk/polymarket/quant-stress-and-bootstrap.ts` and unit-verified in `tests/polymarket/quant-stress-and-bootstrap.test.ts` (`SYNTHETIC / UNIT TEST ONLY` on synthetic baselines; empirical strategy stress resilience remains `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE`):

| # | Scenario ID | Category | Shock / Fault Injected | Pass Criterion / Expected Action | Current Status | Evidence |
|---|---|---|---|---|---|---|
| 1 | `SLIPPAGE_1_5X` | Economic | `1.5x` baseline execution slippage (`baselineNetPnl - 0.5 * baselineSlippage`) | `stressedNetPnlPusd > 0` (`NET_PNL_POSITIVE`) | Harness Verified; Strategy Empirical = `UNKNOWN` | `SYNTHETIC / UNIT TEST ONLY` |
| 2 | `CANCEL_LATENCY_1_5X` | Economic | `1.5x` stale-quote adverse fill cost from cancel-flight latency | `stressedNetPnlPusd > 0` (`NET_PNL_POSITIVE`) | Harness Verified; Strategy Empirical = `UNKNOWN` | `SYNTHETIC / UNIT TEST ONLY` |
| 3 | `LIQUIDITY_REWARDS_MINUS_50PCT` | Economic | `-50%` haircut on Polymarket liquidity rewards | `stressedNetPnlPusd > 0` (`NET_PNL_POSITIVE`) | Harness Verified; Strategy Empirical = `UNKNOWN` | `SYNTHETIC / UNIT TEST ONLY` |
| 4 | `ADVERSE_HALF_TICK` | Economic | `+0.5` tick (`0.005 pUSD`) adverse markout across all fills (`fillCount * avgFillShares * 0.5 * tick`) | `stressedNetPnlPusd > 0` (`NET_PNL_POSITIVE`) | Harness Verified; Strategy Empirical = `UNKNOWN` | `SYNTHETIC / UNIT TEST ONLY` |
| 5 | `STALE_FEED_GT_1500MS` | Operational Guard | Feed age `> 1,500 ms` (default `1,501 ms`) | `HALT_FAIL_CLOSED` | Pass | `CODE VERIFIED` |
| 6 | `HTTP_425_ENGINE_RESTART` | Operational Guard | CLOB HTTP `425` (`engine restarting`) | `POST_ONLY_COOLDOWN_120S` (`retryAfterMs = 120_000`, `requiresPostOnly(now + 60s) === true`) | Pass | `CODE VERIFIED` |
| 7 | `GHOST_FILL_STATUS_ZERO` | Operational Guard | Polygon receipt `status=0` ghost-fill trigger | `KILL_SWITCH_FIRED_0_UNGUARDED` (`ks.isFired() === true`, `evaluatePolyRisk -> KILL_SWITCH_ACTIVE`) | Pass | `CODE VERIFIED` |
| 8 | `UMA_DISPUTE_GT_10PCT_NAV` | Operational Guard | Active UMA-disputed capital `10.5% > 10.0%` NAV | `FREEZE_NEW_ALLOCATION` (`evaluatePolyRisk -> UMA_DISPUTE_LOCKUP_HALT`) | Pass | `CODE VERIFIED` |
| 9 | `FIVE_MIN_CRYPTO_EXCLUSION` | Operational Guard | 5-minute Crypto market (`btc-up-or-down-5m`) | `HARD_REJECT` (`classifyFiveMinuteExclusion !== null`) | Pass | `CODE VERIFIED` |

---

## 3. Statistical Validation Methodology (Bootstrap & Deflated Sharpe)

Implemented in `src/desk/polymarket/quant-stress-and-bootstrap.ts` (`CODE VERIFIED`):

1. **Stationary Block Bootstrap 95% CI (`stationaryBlockBootstrapCI`):**
   - Wraps `stationaryBlockBootstrap` (`src/desk/backtesting/stationary-block-bootstrap.ts`) with deterministic seeded resampling (`iterations = 1_000`, `avgBlockLength = 5`, `confidence = 0.95`, `seed = 42`) to preserve serial autocorrelation in daily/episode PnL series.
   - **IC KPI #1 Gate:** `netPnlBootstrapCiLowerPusd > 0` required across `>= 30` days L2 data (`CODE VERIFIED`, `ic-kpi-scorecard.ts:114`).
2. **Bailey & Lopez de Prado Deflated Sharpe Ratio (`computeDeflatedSharpeRatio`):**
   - Computes per-period Sharpe, sample skewness, and sample kurtosis (`src/desk/backtesting/metrics-calculator-robustness.ts`), then evaluates `deflatedSharpeRatio` (`src/desk/backtesting/deflated-sharpe.ts`) adjusting for multiple-testing bias across `nTrials` strategy/parameter configurations and non-normal higher moments.
   - Annualizes observed Sharpe and expected maximum Sharpe under the null by `sqrt(periodsPerYear)` (default `252`).
   - **IC KPI #2 Gate:** `Sortino >= 2.0` AND `Deflated Sharpe >= 1.5` (`CODE VERIFIED`, `ic-kpi-scorecard.ts:115`).
3. **Current Empirical Verdict:** `ECONOMIC_G11 = HOLD` (`MAKER_ALPHA`, `NEGRISK_ALPHA`, `MARKET_BLIND_ALPHA` = `INSUFFICIENT_DATA`; empirical sample floor unmet in `ic-kpi-scorecard.ts`; `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE`).

---

## 4. Unresolved Questions

1. Should `MARKET_DATA_MAX_AGE_MS` in `src/desk/risk/poly-risk-types.ts` be reduced from `5_000` ms to `1_500` ms so the pre-trade risk engine and stress suite share one canonical staleness ceiling?
2. Should `sidecars/ghost-guard/src/callback.rs` (HMAC auth + retry) and `defense.rs` (direct CLOB cancel-all fallback) be hardened before any live pilot authentication tests?
