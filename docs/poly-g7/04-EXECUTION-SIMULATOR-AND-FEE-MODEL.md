# POLY-G7 Execution Simulator, Order Lifecycle, and Dynamic Fee Model

- **Document ID:** `POLY-G7-04`
- **Date:** 2026-11-19 (Asia/Saigon)
- **Primary Code Surfaces:**
  - `src/desk/polymarket/execution-model-matrix.ts`
  - `src/desk/polymarket/queue-aware-fill-simulator.ts`
  - `src/desk/execution/deterministic-client-order-id.ts`
  - `src/desk/execution/polymarket-cancel-replace.ts`
  - `src/desk/polymarket/polymarket-fee-calculator.ts`
  - `src/desk/polymarket/fee-schedule-resolver.ts`
  - `src/desk/execution/polymarket-clob-v2-fee-categories.ts`

---

## 1. Execution Model Matrix (Strict Harness Separation)

To prevent product smoke harnesses from contaminating quantitative alpha claims, `EXECUTION_MODEL_MATRIX` (`src/desk/polymarket/execution-model-matrix.ts`) defines four mutually exclusive execution models and enforces metric permissions via `assertExecutionModelMetricAllowed(modelKind, metricName)` (`CODE VERIFIED`).

| Model Kind | Order Type | Post-Only | Queue Behind Depth | Cancel Attribution | Cancel Latency (med / p99) | Stale-Quote Fill | 5-Min Crypto Guard | Forbidden Metrics | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `TAKER_HARNESS_PAPER_BETA` | `TAKER_CROSS_SPREAD` | No | `0%` | `null` | `null` | No | No | `maker_markout_bps`, `maker_queue_fill_rate` | `CODE VERIFIED` |
| `MAKER_ONLY_QUEUE_CONSERVATIVE` | `MAKER_POST_ONLY` | Yes | `100%` | `15%–25%` | `35 ms / 180 ms` | Yes | Yes | `five_min_crypto_maker_pnl_usdc` | `CODE VERIFIED` |
| `NEGRISK_MULTI_LEG` | `PASSIVE_FIRST_THEN_FAK` | No | `100%` | `15%–25%` | `35 ms / 180 ms` | Yes | Yes | `zero_leg_risk_instant_arb_pnl_usdc` | `CODE VERIFIED` |
| `MARKET_BLIND_NEWS` | `SEALED_POSTERIOR_GATED` | No | `100%` | `null` | `null` | No | Yes | `retrospective_hindcast_bss`, `unsealed_post_market_p_raw` | `CODE VERIFIED` |

### 1.1 Paper Beta Spread-Crossing Separation

`TAKER_HARNESS_PAPER_BETA` is strictly a product smoke-test harness (`src/desk/polymarket/execution-model-matrix.ts`) (`CODE VERIFIED`). It crosses the displayed spread (`TAKER_CROSS_SPREAD`), models zero resting queue depth (`queueBehindRestingDepthPct: 0`), and leaves resting limit orders in `PENDING` state (`CODE VERIFIED`). Calling `assertExecutionModelMetricAllowed('TAKER_HARNESS_PAPER_BETA', 'maker_markout_bps')` or `'maker_queue_fill_rate'` throws immediately, preventing Paper Beta telemetry from ever being cited as maker alpha (`CODE VERIFIED`).

---

## 2. Conservative Maker Queue-Aware Fill Model

The quantitative maker simulator (`src/desk/polymarket/queue-aware-fill-simulator.ts`) enforces venue microstructure invariants pinned by unit tests (`CODE VERIFIED`, `SYNTHETIC / UNIT TEST ONLY`):

1. **100% Behind Resting Depth:** A newly posted maker order joins strictly at the back of all size already resting at that price level (`queueBehindRestingDepthPct: 100`) (`CODE VERIFIED`).
2. **Cancel Attribution Band (15%–25%):** Between `CANCEL_VOLUME_FRACTION_MIN = 0.15` and `CANCEL_VOLUME_FRACTION_MAX = 0.25` of visible resting size ahead of the order is attributed to cancellations rather than trades (`sampleCancelVolumeFraction`) (`CODE VERIFIED`).
3. **Log-Normal Cancel Latency (35 ms median / 180 ms p99):** Cancel latency is sampled from a log-normal distribution with `CANCEL_LATENCY_MEDIAN_MS = 35`, `CANCEL_LATENCY_P99_MS = 180`, and `CANCEL_LATENCY_SIGMA = ln(180 / 35) / 2.3263478740408408` (`sampleCancelLatencyMs`) (`CODE VERIFIED`).
4. **Stale-Quote Fill Risk During Cancel Flight:** `modelsStaleQuoteFillDuringCancelFlight: true` ensures that adverse market sweeps arriving during the sampled cancel latency window still fill the resting quote, penalizing stale-quote adverse selection (`CODE VERIFIED`).
5. **Crypto Taker Match Delay:** For taker comparisons on crypto-tier contracts, `CRYPTO_TAKER_MATCH_DELAY_MS = 150` is applied via `takerMatchDelayMsForTier('crypto')` (`CODE VERIFIED`).
6. **Zero Lookahead & Deterministic Replay:** All models set `zeroLookaheadEnforced: true` and use `createSeededRandom` (Mulberry32) so identical seeds produce identical queue draws across replays (`CODE VERIFIED`, `SYNTHETIC / UNIT TEST ONLY`).

Empirical calibration of the 15%–25% cancel band and 35 ms / 180 ms latency distribution against live self-recorded L2 order-flow remains `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` until 30 days of L2 WAL segments are collected.

---

## 3. Deterministic `clientOrderId` and Atomic `cancel/replace`

### 3.1 Deterministic Order Identity & Salt (`src/desk/execution/deterministic-client-order-id.ts`)

Every order intent (`DeterministicOrderIdInput`: `strategyId`, `marketId`, `tokenId`, `side`, `priceMicro`, `sizeMicro`, `intentEpochMs`, `sequence`) is canonically serialized as a JSON array and hashed with SHA-256 (`CODE VERIFIED`):

- **`deriveDeterministicClientOrderId(input)`:** Returns `poly_<first 32 hex chars of SHA-256>` (`CODE VERIFIED`).
- **`deriveDeterministicOrderSalt(input)`:** Converts the trailing 32 hex chars (128 bits) to an unsigned base-10 integer string for EIP-712 ExchangeV3 signing (`CODE VERIFIED`).
- **`ClientOrderIdRegistry`:** Tracks duplicate retries (`isDuplicate`, `attempts`), exports `serialize()`, and validates every entry hash and salt on `hydrate(snapshot)`, throwing on any corrupted snapshot entry (`CODE VERIFIED`, `SYNTHETIC / UNIT TEST ONLY`).

### 3.2 Atomic Cancel/Replace State Machine (`src/desk/execution/polymarket-cancel-replace.ts`)

`PolymarketCancelReplaceManager` enforces a strict six-state lifecycle per quote slot (`LIVE`, `PENDING_CANCEL`, `PENDING_REPLACE`, `REPLACED`, `CANCELLED`, `FAILED`) (`CODE VERIFIED`):

- **Double-Exposure Prevention:** `registerLiveOrder` rejects duplicate active orders on an occupied slot; `requestCancel` and `requestReplace` return `IN_FLIGHT_CANCEL_OR_REPLACE` if any cancel or replace is already in flight (`CODE VERIFIED`).
- **HTTP 425 Engine Restart Cooldown:** `noteHttp425(slotId, nowMs)` invokes `EngineRestartCooldown.noteEngineRestart(nowMs)`. While `cooldown.requiresPostOnly(nowMs)` is active, `requestReplace`, `completePriorTermination`, and `retryDeferredReplace` defer promotion with `ENGINE_RESTART_COOLDOWN_DEFERRED` and populate `deferredUntilMs` (`CODE VERIFIED`).
- **Ordered Promotion:** The replacement `pendingClientOrderId` and `pendingSalt` are promoted to active only after `onCancelAck` or `onTerminalFill` confirms termination of the prior order, and the slot moves to `REPLACED` only after `onReplaceAck` receives the new `exchangeOrderId` (`CODE VERIFIED`, `SYNTHETIC / UNIT TEST ONLY`).

---

## 4. Dynamic Fee Reconciliation and Golden Vectors

### 4.1 Venue-Resolved Fee Schedule (`fee-schedule-resolver.ts` & `polymarket-fee-calculator.ts`)

Fill paths resolve live per-market fee schedules from Gamma (`GET /markets?clob_token_ids=<tokenId>&limit=1`) with a 5-minute TTL cache via `FeeScheduleResolver` (`CODE VERIFIED`):

- When `feesEnabled === false`, `resolve()` returns `null` (mapped to `EXEMPT_FEE_SCHEDULE`, where all fees and rebates are `0`) (`CODE VERIFIED`).
- Transport or HTTP errors throw rather than silently defaulting to free (`CODE VERIFIED`).
- Per-share taker fee is `calcTakerFeePerShare(schedule, p) = rate * (p * (1 - p)) ^ exponent` (live `exponent = 1`) (`CODE VERIFIED`).
- Per-share maker rebate is `calcMakerRebatePerShare(schedule, p) = calcTakerFeePerShare(schedule, p) * rebateRate`, with negative effective maker fee rate `-rebate / p` (`CODE VERIFIED`).
- Explicit fee accounting is kept strictly separate from bid-ask spread crossing in `EconomicPnLInput` (`src/desk/polymarket/economic-truth-pnl.ts`), preventing spread double-counting (`CODE VERIFIED`).

### 4.2 CLOB V2 Quadratic Category Golden Vectors (`polymarket-clob-v2-fee-categories.ts`)

At `p = 0.50` (`p * (1 - p) = 0.25`) and `exponent = 1`, `CLOB_V2_QUADRATIC_RATES` produces the following deterministic golden vectors per share (`CODE VERIFIED`):

| Category | `rCat` | `makerRebatePct` | Taker Fee / Share at `p = 0.50` | Taker Fee Rate (% of Notional) at `p = 0.50` | Maker Rebate / Share at `p = 0.50` | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `crypto` | `0.07` | `0.20` | `0.017500 pUSD` | `3.50%` | `0.003500 pUSD` | `CODE VERIFIED` |
| `sports` | `0.05` | `0.20` | `0.012500 pUSD` | `2.50%` | `0.002500 pUSD` | `CODE VERIFIED` |
| `politics` | `0.04` | `0.25` | `0.010000 pUSD` | `2.00%` | `0.002500 pUSD` | `CODE VERIFIED` |
| `finance` | `0.04` | `0.25` | `0.010000 pUSD` | `2.00%` | `0.002500 pUSD` | `CODE VERIFIED` |
| `geopolitics` | `0.00` | `0.00` | `0.000000 pUSD` | `0.00%` | `0.000000 pUSD` | `CODE VERIFIED` |
| `feesEnabled=false` (`EXEMPT_FEE_SCHEDULE`) | `0.00` | `0.00` | `0.000000 pUSD` | `0.00%` | `0.000000 pUSD` | `CODE VERIFIED` |

Additional categories in `CLOB_V2_QUADRATIC_RATES` include `nfl_college_football` (`0.03`, rebate `0.15`), `table_tennis` (`0.10`, rebate `0.15`), `tech`/`culture`/`science`/`pop_culture` (`0.04`, rebate `0.20`), and `world_events` (`0.00`, rebate `0.00`), capped by `CLOB_V2_MAX_BASE_FEE_BPS = 1000` (`CODE VERIFIED`).

---

## 5. Unresolved Questions

1. Should live Gamma `feeSchedule` polling failures halt quoting on the affected token immediately, or fall back to conservative category ceilings only in paper/shadow mode?
