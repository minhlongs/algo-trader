# POLY-G7 Alpha Experiments A, B, and C — Implementation vs Empirical Status

- **Document ID:** `POLY-G7-05`
- **Date:** 2026-11-19 (Asia/Saigon)
- **Empirical Gate Status:** All three alpha pillars remain `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` because `0/30` L2 WAL days, `0/500` qualifying maker fills, and `0/150` resolved OOS forecasts have been collected (`CODE VERIFIED`).

---

## 1. Strict Separation: Unit/Synthetic Verification vs Empirical Proof

Every strategy pillar below has been implemented and exercised under deterministic fixtures (`SYNTHETIC / UNIT TEST ONLY`). None has produced empirical market evidence (`UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE`). No synthetic PnL, Sharpe, Sortino, markout, or Brier score from unit tests is promoted to the IC scorecard.

| Experiment / Priority | Strategy Pillar | Execution Model | Implementation Status | Unit/Synthetic Verification | Empirical Sample Status | IC Alpha Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| **Priority 1 / Exp A** | Adaptive Maker-Only MM + 5-State Regime Machine | `MAKER_ONLY_QUEUE_CONSERVATIVE` | `CODE VERIFIED` | `SYNTHETIC / UNIT TEST ONLY` | `0/500` fills (`UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE`) | `INSUFFICIENT_DATA` |
| **Priority 2 / Exp B** | Event-Level NegRisk Multi-Outcome Arbitrage | `NEGRISK_MULTI_LEG` | `CODE VERIFIED` | `SYNTHETIC / UNIT TEST ONLY` | `0` real cycles (`UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE`) | `INSUFFICIENT_DATA` |
| **Priority 3 / Exp C** | Market-Blind Bayesian Fair-Value & Shrunk Ensemble | `MARKET_BLIND_NEWS` | `CODE VERIFIED` | `SYNTHETIC / UNIT TEST ONLY` | `0/150` resolved OOS (`UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE`) | `INSUFFICIENT_DATA` |

---

## 2. Priority 1 / Experiment A — Adaptive Maker-Only Market Making

### 2.1 Implemented Architecture (`CODE VERIFIED`)

- **Quoting Engine:** Log-odds Avellaneda-Stoikov market-making engine (`src/desk/polymarket/log-odds-avellaneda-stoikov-mm.ts`) paired with on-chain OFI/VPIN toxicity estimation (`src/desk/polymarket/onchain-ofi-vpin-estimator.ts`) and conservative queue simulation (`src/desk/polymarket/queue-aware-fill-simulator.ts`).
- **5-State Liquidity Regime Machine (`src/desk/polymarket/liquidity-regime-types.ts`, `liquidity-regime-machine.ts`):** Transitions deterministically across `QUIET`, `TRENDING`, `EVENT`, `REDUCE_ONLY`, and `HALTED` using `DEFAULT_LIQUIDITY_REGIME_CONFIG`:
  - `HALTED` triggers: WS lag `> 1,500 ms`, daily loss `> 150 pUSD`, API errors `> 10/min`, cancel ack p99 `> 1,000 ms`, HTTP 425, or ghost fill detection; minimum lock `300,000 ms` (5 min); invokes `DELETE /cancel-market-orders` via `createCancelMarketOrdersTransport`.
  - `REDUCE_ONLY` triggers: normalized inventory `|q| >= 1.0` or time to expiry `<= 2 hours` (full quote withdrawal at `<= 30 minutes`).
  - `EVENT` triggers: 10s mid/touch jump `>= 3` ticks, 10s reference move `>= 2.0%`, or scheduled catalyst window; cooling-off `120,000 ms` (bounded `60,000–180,000 ms`).
  - `TRENDING` triggers: VPIN `> 0.65`, fills/min `> 3`, or Kyle's lambda `> 2.0x` baseline.
- **5-Minute Crypto Exclusion Guard (`src/desk/polymarket/five-minute-crypto-guard.ts`):** `assertNotFiveMinuteCryptoMarket` and `isFiveMinuteCryptoMarket` block 5-minute binary crypto contracts from maker quoting, and `EXECUTION_MODEL_MATRIX.MAKER_ONLY_QUEUE_CONSERVATIVE` forbids `five_min_crypto_maker_pnl_usdc`.
- **Markout & Ex-Rewards Economic Truth (`src/desk/polymarket/economic-truth-pnl.ts`):** Tracks 5s / 60s / 300s adverse-selection markout horizons alongside the 5-quantity `EconomicPnLBreakdown` (`mtmPnlPusd`, `realizedTradingPnlPusd`, `settledPnlPusd`, `capitalAdjustedReturnPct`, `returnOnCapitalTiedUpPct`) and explicitly isolates `netEconomicPnlExRewardsPusd` plus `isRewardsDependent` to expose liquidity-reward dependency.

### 2.2 Empirical Status

- Realized 60s spread + rebate + reward (target `>= +15 bps` over `>= 500` qualifying fills): `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` (`0/500` fills).
- Ex-rewards profitability and 5s/60s/300s markout decay on recorded L2 data: `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` (`0/30` L2 days).

---

## 3. Priority 2 / Experiment B — Event-Level NegRisk Arbitrage

### 3.1 Implemented Architecture (`CODE VERIFIED`)

- **Execution Policy (`EXECUTION_MODEL_MATRIX.NEGRISK_MULTI_LEG`):** Enforces `thinLegMode: 'passive_first'`, `thickLegMode: 'sequential_failfast_fak'`, `modelsStrandedLegUnwindCost: true`, `requiresEthCallPreflight: true`, and `modelsUmaDisputeLockup: true`. Forbids `zero_leg_risk_instant_arb_pnl_usdc`.
- **On-Chain `eth_call` Preflight (`src/desk/polymarket/ctf-eth-call-preflight.ts`):** `CtfEthCallPreflight` encodes exact calldata via `ethers` v6 for `CtfCollateralAdapter` (`0x4D97DCd97eC945f40cF65F87097ACe5EA0476045`: `mergePositions`, `splitPosition`, `redeemPositions`) and `NegRiskCtfCollateralAdapter` (`0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296`: `convertPositions(bytes32, uint256, uint256)`). `validateNegRiskIndexSet` validates `_indexSet` bitmasks against `outcomeCount` (`2–255`) and held NO slots, failing closed on any mismatch or `eth_call` revert.
- **Optimization & Lockup Accounting:** Frank-Wolfe multi-outcome allocation and stranded-leg unwind modeling are coupled with `EconomicPnLInput.umaDisputeLockupDays` and `DEFAULT_OPPORTUNITY_COST_ANNUAL_RATE = 0.045` (4.5%/yr) to penalize capital tied up during resolution or UMA disputes (`CODE VERIFIED`, `SYNTHETIC / UNIT TEST ONLY`).

### 3.2 Empirical Status

- Multi-leg completion rate (target `>= 92%`), stranded-leg unwind cost, `eth_call` preflight pass rate, and weighted-average lockup (`< 10d`, `< 25%` locked): `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE` (`0` real multi-leg execution cycles).

---

## 4. Priority 3 / Experiment C — Market-Blind Prospective Forecasting

### 4.1 Implemented Architecture (`CODE VERIFIED`)

- **Durable Append-Only Hash-Chained Ledger (`src/desk/polymarket/market-blind/market-blind-ledger-store.ts`):** `DurableMarketBlindLedger` persists three canonical JSONL record kinds (`FORECAST_COMMIT`, `MARKET_READ_AFTER_COMMIT`, `RESOLUTION`) linked by a contiguous SHA-256 hash chain (`seq`, `prevHash` -> `entryHash`, genesis `'0'.repeat(64)`). `hydrateFromStore()` replays every record across process restarts and throws `MarketBlindIntegrityError` on any truncation, out-of-order sequence, tampered hash, or market read preceding `receipt.loggedAtMs`.
- **Node.js File Adapter (`src/desk/polymarket/market-blind/node-market-blind-ledger-adapter.ts`):** `createNodeJsonlAppendStore(filePath)` isolates `node:fs` from Worker-safe ledger code, rejects embedded newlines, creates parent directories on demand, and enforces `0o600` file permissions.
- **Gamma/CTF Resolution Ingestor (`src/desk/polymarket/market-blind/market-blind-resolution-ingestor.ts`):** `ingestResolvedMarketsIntoLedger(ledger, records)` maps resolved binary outcomes (`outcome: 0 | 1`) idempotently into the durable ledger (skipping already-resolved receipts and isolating unmatched IDs or errors).
- **5-Gate Fail-Closed Skill Lock (`evaluateLedgerSkillStatus` & `DEFAULT_POSTERIOR_CONFIG`):** Evaluates Brier score, `BSS_OOS`, 95% lower bound (`bssLower95`), 10-bin `ECE`, and rolling 100-market Brier. `w_skill` remains strictly locked at `0` (`loggingOnly: true`) unless all 5 gates pass (`minResolvedQuestions: 150`, `minBssOos: 0.02`, `bssLower95 > 0`, `maxEce: 0.035`, rolling 100-market Brier better than market). Even when unlocked, `wMax` caps weight at `0.35`, market prices are bounded to `[0.10, 0.90]`, conservative edge must be `>= 0.03` (taker `>= 0.045`), and inference cost is capped at `0.0015` (15 bps) of notional.

### 4.2 Empirical Status

- Resolved prospective OOS forecasts: `0/150` (`UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE`).
- `BSS_OOS`, `ECE`, and `w_skill`: `w_skill = 0` (`loggingOnly: true`) locked fail-closed (`CODE VERIFIED`); empirical forecasting edge is `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE`.

---

## 5. Unresolved Questions

1. Which initial market categories (excluding 5-minute crypto) should be prioritized for the first 150 prospective market-blind forecasts so resolutions settle within the 30–90 day observation window?
