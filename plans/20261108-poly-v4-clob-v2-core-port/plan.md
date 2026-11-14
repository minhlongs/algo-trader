# Plan: Polymarket CLOB V2 (`POLY-ALPHA-HUNTER-V4`) Core Port into `algo-trader`

- **Date:** 2026-11-08
- **Branch:** `feat/poly-v4-clob-v2-core-port`
- **Status:** completed
- **Route:** Feature + Hardening (`/ak-vibe --auto --ship`)

## 1. Objective & Scope

Port the 5 core protocol, accounting, pre-trade risk, microstructure, and market-making primitives from `POLY-ALPHA-HUNTER-V4-SPEC-FULL` (`poly.md`) into the TypeScript monorepo `algo-trader` while preserving 100% compatibility with the 30-day `G1-Soak` (`startedAt = 1793536843401`) and `G2-Poly-Shadow` (`startedAtMs = 1794047000444`) cohorts and keeping `LIVE_TRADING_ENABLED=false` (Gate `G3` strictly `BLOCKED`):

1. **Task 1 — Quadratic Taker Fee, Maker Rebate & Liquidity Reward Engine V2 (`src/desk/polymarket/polymarket-fee-calculator.ts`):**
   - Implement `calcQuadraticTakerFeeRateV2(category, probability)`, `calcQuadraticTakerFeeV2(category, probability, contracts)`, `calcMakerRebateV2(category, probability, contracts)`, and `calcLiquidityRewardScoreV2(params)` with the exact November 2026 CLOB V2 quadratic curve $\text{Fee} = C \times r_{\text{cat}} \times p \times (1 - p)$ (`crypto: 0.07`, `sports: 0.05`, `politics: 0.04`, `finance: 0.04`, `geopolitics: 0.00`, `world_events: 0.00`), `10%` statutory cap (`base_fee = 1000 bps`), `0%` Maker fee (`postOnly`), Maker rebates (`20%` crypto/sports, `25%` politics/finance), and two-sided liquidity reward rule $Q = \max(\min(Q_{\text{bid}}, Q_{\text{ask}}), \max(Q_{\text{bid}}, Q_{\text{ask}}) / 3.0)$ for $p \in [0.10, 0.90]$ (`c = 3.0` penalty outside).
   - Preserve backwards compatibility of legacy `calcTakerFee` / `calcMakerRebate` so `npm run check:leaderboard` (`30/30` strategies) remains 100% unchanged.

2. **Task 2 — 5-Tier Integer Micro-Unit FIFO Ledger (`src/desk/execution/integer-micro-unit-fifo-ledger.ts`):**
   - Implement `IntegerMicroUnitFifoLedger` using integer micro-units (`1 unit = 10^-6 pUSD`, `MICRO = 1_000_000`) with exact integer floor division (`Math.floor` on non-negative integer products) to prevent the 6-decimal `avg_price` truncation bug in `/v2/activity`.
   - Maintain 5 separated PnL buckets: `realizedTradingPnlMicro`, `accruedRebateIncomeMicro`, `accruedLiquidityRewardMicro`, `settledRedemptionPnlMicro` (`$1.00` or `$0.00` payout), and `computeUnrealizedMtmMicro(tokenId, bidLevelsMicro, exitFeeBps)` using size-aware VWAP Bid minus expected exit Taker fee.

3. **Task 3 — 10-Rule CLOB V2 Pre-Trade Risk Gate (`src/desk/execution/polymarket-v2-pretrade-risk-gate.ts`):**
   - Implement `PolymarketV2PreTradeRiskGate` enforcing all 10 hard rules from Section `13.3` & `PATCH-06..12`:
     1. Consecutive orderbook error circuit breaker (`consecutiveBookErrors < maxConsecutiveBookErrors` default `5`).
     2. VPIN toxicity kill-switch (`currentVpin <= maxVpinThreshold` default `0.70`).
     3. Tail-risk cluster CVaR gate (`clusterCvar99Pct <= maxClusterCvarPct` default `0.035`).
     4. Extreme probability quote cutoffs (`priceMicro >= 20_000` (`$0.02`) and `<= 980_000` (`$0.98`)).
     5. Valid tick grid alignment (`10_000`, `5_000`, `2_500`, `1_000` micro-units) and exact multiple check (`priceMicro % tickSizeMicro === 0`).
     6. Minimum limit order size (`sharesMicro >= 5_000_000` = `5 shares` when `isLimitOrder`).
     7. Market BUY (`FAK`/`FOK`) 2-decimal collateral floor (`floorMarketBuyNotionalMicro(notionalMicro)` to multiple of `10_000` micro-units, Issues `#59`, `#99`).
     8. `20%` stale matched-order balance reserve (`effectiveFreeBalanceMicro = floor(rawFreeBalanceMicro * 0.80)`, Issues `#112`, `#36`).
     9. Per-market inventory concentration cap (`marketExposureMicro <= maxMarketExposureMicro`).
     10. Maker two-sided quoting balance helper (`computeEffectiveRewardDepthMicro`).

4. **Task 4 — On-Chain `OrderFilled` OFI/VPIN Estimator & Log-Odds Avellaneda-Stoikov Market Maker (`src/desk/polymarket/onchain-ofi-vpin-estimator.ts` & `src/desk/polymarket/log-odds-avellaneda-stoikov-mm.ts`):**
   - `onchain-ofi-vpin-estimator.ts`: Decode ground-truth `aggressorSide` from on-chain `OrderFilled` (`makerAssetId === '0' || makerAssetId === 0n` -> `'BUY'`, else `'SELL'` to defeat the `59.2%` WebSocket sign-inference trap `arXiv:2604.24366`), compute 5-level Order Flow Imbalance ($\text{OFI}^{(5)}_t$) with exponential depth decay, and compute volume-synchronized VPIN over rolling volume buckets + 4-state regime classifier (`1: Calm`, `2: catalyst`, `3: Jump/Toxic`, `4: Near-Resolution`).
   - `log-odds-avellaneda-stoikov-mm.ts`: Compute reservation log-odds $r_t = L_t - q_t \gamma \sigma_L^2 \tau_t + \kappa \cdot \text{OFI}^{(5)}_t$ and optimal half-spread $\delta_t = \frac{1}{\gamma}\ln(1 + \frac{\gamma}{k}) + \frac{1}{2}\gamma \sigma_L^2 \tau_t + \eta \cdot \text{VPIN}_t$ on $L_t = \ln(p_t/(1-p_t))$, map back via logistic sigmoid $\sigma(x) = (1 + e^{-x})^{-1}$ snapped to the market tick grid, and provide conservative Maker queue-position simulator `advanceConservativeMakerQueue` ($Q_{\text{ahead}} \leftarrow \max(0, Q_{\text{ahead}} - 0.20 \cdot \Delta Q_{\text{cancel}})$, `BT-TRAP-01`).

5. **Task 5 — `ExchangeV3` (`signatureType=3`, `pUSD`) Fail-Closed Signer Support & Walk-Forward OOS V2 Evaluation (`src/desk/execution/polymarket-signer.ts` & `src/desk/polymarket/polymarket-oos-evaluator.ts`):**
   - Extend `PolymarketSigner` with CLOB V2 constants (`EXCHANGE_V3_ADDRESS`, `PUSD_COLLATERAL_ADDRESS = '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB'`, `signatureType: 0 | 1 | 2 | 3`, optional `protocolVersion: '1' | '3'` and `positionId` support in `buildTypedData`) while preserving default `'1'` compatibility for existing tests and keeping `LIVE_TRADING_ENABLED=false` fail-closed.
   - Extend `polymarket-oos-evaluator.ts` with `log_odds_maker_mm_v2` candidate evaluation using conservative queue progress (`20%`) and quadratic V2 fees/rebates.

## 2. Files to Create / Modify (All `<= 200` LOC)

- `src/desk/polymarket/polymarket-fee-calculator.ts` (`<= 200` LOC)
- `src/desk/execution/integer-micro-unit-fifo-ledger.ts` (`<= 200` LOC)
- `src/desk/execution/polymarket-v2-pretrade-risk-gate.ts` (`<= 200` LOC)
- `src/desk/polymarket/onchain-ofi-vpin-estimator.ts` (`<= 200` LOC)
- `src/desk/polymarket/log-odds-avellaneda-stoikov-mm.ts` (`<= 200` LOC)
- `src/desk/execution/polymarket-signer.ts` (`<= 200` LOC)
- `src/desk/polymarket/polymarket-oos-evaluator.ts` (`<= 200` LOC)
- `src/desk/polymarket/__tests__/poly-v4-clob-v2-core.test.ts` (`<= 200` LOC)
- `src/desk/execution/__tests__/poly-v4-ledger-and-risk-gate.test.ts` (`<= 200` LOC)
- `plans/reports/audit-261101-golive-poly/08-live-readiness-and-canary.md`
- `plans/reports/audit-261101-golive-poly/10-executive-summary.md`
- `plans/reports/audit-261101-golive-poly/11-handoff.md`

## 3. Acceptance Criteria & Verification

1. Unit tests verify quadratic Taker fee curve peak at `p = 0.50` (`1.75%` crypto, `1.25%` sports, `1.00%` politics, `0%` geopolitics), `0%` Maker fee, Maker rebate, and quadratic liquidity reward score with `1/3` two-sided rule.
2. Unit tests verify `IntegerMicroUnitFifoLedger` partial FIFO lot disposal, Maker rebate & liquidity reward accrual, `$1.00`/`$0.00` redemption settlement, and size-aware VWAP Bid MTM with `0` micro-unit drift.
3. Unit tests verify `PolymarketV2PreTradeRiskGate` across all 10 hard rules (`VPIN > 0.70` rejection, `floorMarketBuyNotionalMicro(10_559_000) === 10_550_000`, `20%` balance reserve, tick grid alignment, `< 5 shares` rejection, `[$0.02, $0.98]` cutoffs).
4. Unit tests verify on-chain `OrderFilled` `aggressorSide` decoding (`makerAssetId === '0'` -> `'BUY'`), 5-level OFI, VPIN toxicity & 4-state regime classification, Log-Odds Avellaneda-Stoikov reservation/spread quotes inside $(0, 1)$, and conservative `20%` Maker queue simulator (`BT-TRAP-01`).
5. `npx tsc --noEmit`, Vitest test suites, `npm run check:leaderboard`, and `node scripts/check-quality-baseline.mjs` pass with 0 errors and all touched code files `<= 200` LOC.
