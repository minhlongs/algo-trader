# POLY-G10 Phases 4–7 — Offline Queue-Aware Simulation, Maker/NegRisk Baselines & Market-Blind Discipline

**EVIDENCE STAMP:** `SYNTHETIC_OR_OFFLINE_VALIDATION_ONLY`
**Date:** 2026-11-23
**Base Commit (`origin/main`):** `b7bf721fc393a29da67e5ca383320692a6157ea3`
**PDF Reference:** `POLY ALPHA HUNTER v4` pp. 26–47, 56–62, 74–76
**Alpha Claims:** **NONE** (`30_DAY_L2 = INSUFFICIENT_DATA`, `MAKER_ALPHA = INSUFFICIENT_DATA`, `NEGRISK_ALPHA = INSUFFICIENT_DATA`, `MARKET_BLIND_ALPHA = INSUFFICIENT_DATA`, `W_SKILL = 0`)

> **Mandatory Disclosure:** All simulation outputs referenced below come exclusively from offline deterministic unit/integration fixtures. They validate simulator invariants, fee math, stress halts, and fail-closed governance gates only. They are **not** independently observed market data and do **not** prove live trading edge.

---

## 1. Queue-Aware Simulation & CLOB V2 Cost Model (Phase 4)

| Component | Source Path | Verified Offline Invariant |
|---|---|---|
| Conservative back-of-queue fill model | `src/desk/polymarket/queue-aware-fill-simulator.ts`, `src/desk/polymarket/execution-model-matrix.ts` | Newly posted orders start behind `100%` of displayed queue; cancellation attribution configurable & conservative (`15–25%` PDF reference); no automatic fills on price touch alone; partial fills & adverse late-cancel fills supported |
| Log-normal cancel latency & HTTP 425 / heartbeat | `src/desk/polymarket/queue-aware-fill-simulator.ts`, `src/desk/polymarket/clob-v2-heartbeat-service.ts`, `src/desk/polymarket/clob-v2-submit-classifier.ts` | `p50 = 35 ms`, `p99 = 180 ms` cancel ack delay; HTTP 425 matching-engine restart pauses quoting; 10s heartbeat auto-cancel guard |
| Dynamic CLOB V2 fee & maker rebate/reward accounting | `src/desk/execution/polymarket-clob-v2-fee-math.ts` | `fee = C * rate * p * (1 - p)` rounded to 5 decimals (`0.00001` pUSD floor); `0%` maker fee (`postOnly`); `20%` taker-fee pool rebate accounting; explicit `0`-cost rejection when fee schedule missing |
| 5-measure Economic Truth PnL | `src/desk/polymarket/economic-truth-pnl.ts` | Separates MTM (executable bid), Realized Closed, Settled Cash, Drawdown/Tail Risk-Adjusted Return, and Compound Annualized ROC (`4.5%/yr` carry + `3–6d` UMA dispute lockup) |

---

## 2. Alpha Candidates A, B, C — Offline Engineering Status (Phases 5–7)

### Candidate A — Toxicity-Aware Adaptive Maker-Only MM + Regime Switching
- **Code:** `src/desk/polymarket/log-odds-avellaneda-stoikov-mm.ts`, `src/desk/polymarket/liquidity-regime-machine.ts`, `src/desk/polymarket/onchain-ofi-vpin-estimator.ts`, `src/desk/strategies/polymarket/quant-alpha/toxicity-aware-market-maker.ts`.
- **Verified offline invariants:** Log-odds reservation price & spread; `buyYesPriceMicro + buyNoPriceMicro < 1_000_000` (`< 1.00 pUSD`); `shouldMergePusd(yes, no, 20)` capital-recycling helper; 5-state Regime Machine (`QUIET` / `TRENDING` / `EVENT` / `REDUCE_ONLY` / `HALTED`); OFI skew + VPIN widen/pull.
- **Empirical status:** `MAKER_ALPHA = INSUFFICIENT_DATA` (0/30 qualifying L2 days, 0/500 qualifying maker fills).

### Candidate B — Event-Level NegRisk / Combinatorial Rebalancing
- **Code:** `src/desk/strategies/polymarket/quant-alpha/negrisk-bundle-arbitrage-*.ts`, `src/desk/polymarket/ctf-eth-call-preflight.ts`, `src/desk/polymarket/gnosis-ctf-settlement-relayer.ts`.
- **Verified offline invariants:** Non-atomic per-leg simulation; `5-minute` binary markets excluded; `requirePreflight: true` fails closed (`preflightBlocked++`, event killed) when `ctfPreflight` is omitted; `GnosisCtfSettlementRelayer` rejects `'live'` mode rather than emitting `0xmock-*` tx hashes.
- **Empirical status:** `NEGRISK_ALPHA = INSUFFICIENT_DATA` (no 30-day L2 multi-leg replay yet).

### Candidate C — Primary-Source News Latency + Market-Blind Shrunk Fair-Value
- **Code:** `src/desk/polymarket/market-blind/market-blind-prospective-ledger.ts`, `src/desk/polymarket/market-blind/settlement-chain-verifier.ts`, `src/desk/polymarket/ic-evidence-loader.ts`.
- **Verified offline invariants:** `w_skill` locked to `0` (`W_SKILL = 0`); SHA-256 hash-chained prospective forecast ledger; fail-closed on-chain finalized settlement provenance (rejects simulated/operator-authored claims); CLI & scorecard floors require `>= 150` finalized OOS resolutions before non-zero `w_skill`.
- **Empirical status:** `MARKET_BLIND_ALPHA = INSUFFICIENT_DATA` (0/150 finalized OOS resolutions).

---

## 3. Stress Suite & Live Scorecard Verification

- **9-Scenario Stress Suite (`src/desk/polymarket/quant-stress-and-bootstrap.ts`):** Verified `1.5x` slippage, `1.5x` cancel latency, `-50%` liquidity rewards, `+0.5¢` adverse slippage, `300 ms` spike, HTTP 425, `>1500 ms` stale feed (routed directly through `evaluatePolyRisk`), Ghost Fill (`status=0`), and cluster correlated-tail shock.
- **Live IC Scorecard Command (`npx tsx scripts/poly-g7-scorecard.ts --json`):**
  - `empiricalSampleGatePassed: false`
  - `samples: { recordedL2Days: 0, qualifyingMakerFills: 0, resolvedOosForecasts: 0 }`
  - All 11 IC KPIs report `UNKNOWN_INSUFFICIENT_EMPIRICAL_SAMPLE` (fail-closed verified).
