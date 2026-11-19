# POLY-G7 — Economic Truth PnL & Full-Stack Cost Model

- **Date:** 2026-11-19 (Asia/Saigon)
- **Branch:** `feat/poly-g7-ic-quant-validation`
- **Canonical Implementation:** `src/desk/polymarket/economic-truth-pnl.ts` (`CODE VERIFIED`)
- **Test Suite:** `tests/polymarket/economic-truth-pnl.test.ts` & `tests/polymarket/execution-model-matrix-and-fees.test.ts` (`CODE VERIFIED`)
- **Source Doctrine:** `Kiến Trúc Quant Alpha Polymarket.pdf` (pp. 30–33, p. 50, p. 60, p. 65, p. 68, pp. 74–75; `SOURCE VERIFIED`)

---

## 1. Five-Quantity Economic Truth PnL Specification

To eliminate mark-to-midpoint illusion, rewards masking, and ignored capital-lockup drag, `computeCanonicalEconomicPnL(input)` (`src/desk/polymarket/economic-truth-pnl.ts`) strictly separates five non-interchangeable quantities (`CODE VERIFIED`):

| # | Quantity (`EconomicPnLBreakdown` Field) | Exact Formula | Economic Meaning | Evidence |
|---|---|---|---|---|
| 1 | **MTM PnL** (`mtmPnlPusd`) | `pusdBalance + executableBidValuePusd - initialCapitalPusd` | Liquidation-grounded equity using **executable bid depth**, never mid-price | `CODE VERIFIED` |
| 2 | **Realized Trading PnL** (`realizedTradingPnlPusd`) | `grossClosedTradingPnlPusd - realizedFeesPusd - slippagePusd` | Closed trading edge net of explicit venue fees and execution slippage | `CODE VERIFIED` |
| 3 | **Settled PnL** (`settledPnlPusd`) | `grossSettledPnlPusd - settledRedemptionCostPusd` | Cash actually recovered post-`redeemPositions` on resolved CTF markets | `CODE VERIFIED` |
| 4 | **Capital-Adjusted Return (%)** (`capitalAdjustedReturnPct`) | `(netEconomicPnlPusd / allocatedCapitalPusd) * 100` | Return on total allocated capital after all 8 cost categories | `CODE VERIFIED` |
| 5 | **Annualized Return on Capital Tied Up (%)** (`returnOnCapitalTiedUpPct`) | `(netEconomicPnlPusd / lockedCapitalPusd) * (365 / effectiveLockupDays) * 100` | Capital velocity accounting for `weightedAvgLockupDays + umaDisputeLockupDays` | `CODE VERIFIED` |

All non-negative cost and capital inputs are strictly validated via `assertNonNegative` / `assertFinite` and rounded to 4 decimals (`round4`), throwing `RangeError` on NaN, Infinity, or negative cost injection (`CODE VERIFIED`).

---

## 2. Dynamic Fee Schedule & Full Cost Waterfall

### 2.1 Polymarket CLOB V2 Dynamic Fee Formula (PDF pp. 31–32)

- **Maker Orders (`postOnly = true`):** `0%` fee (`CODE VERIFIED`, `calcQuadraticTakerFeeRateV2`).
- **Taker Orders:** `Fee = C * feeRate * p * (1 - p)` (PDF specifies 5-decimal rounding; `SOURCE VERIFIED`, pp. 31–32).
  - **Code Audit Note:** `calcQuadraticTakerFeeV2` (`src/desk/execution/polymarket-clob-v2-fee-math.ts`) implements `contracts * min(rCat * p * (1 - p), 0.10)` in unrounded IEEE-754 floating point; callers requiring venue-exact 5-decimal settlement rounding should apply `Math.round(fee * 1e5) / 1e5` (`CODE VERIFIED`).
- **Category Rates & Maker Rebates (PDF pp. 31–32 vs Repo):**

| Category | PDF `feeRate` & Rebate (`SOURCE VERIFIED`) | Repo `CLOB_V2_QUADRATIC_RATES` (`CODE VERIFIED`) | Parity Note |
|---|---|---|---|
| **Crypto** | `0.07`, `20%` rebate | `0.07`, `20%` rebate | Exact match |
| **Sports** | `0.05`, `15%` rebate | `0.05`, `20%` rebate | Repo rebate `+5%` higher than PDF |
| **Economics / Culture / Weather / Other** | `0.05`, `25%` rebate | `culture: 0.04, 20%` (others fallback to `politics`) | Minor drift; update before 30d shadow accounting |
| **Finance / Politics / Mentions / Tech** | `0.04`, `25%` rebate | `politics`/`finance: 0.04, 25%`; `tech: 0.04, 20%` | `tech` rebate `-5%` vs PDF; `mentions` lacks key |
| **Combos / RFQ** | `0.05`, `0%` rebate | Not explicitly keyed | Add explicit enum before RFQ/Combo quoting |
| **Geopolitics** | `0.00` (exempt) | `0.00`, `0%` rebate | Exact match (`EXEMPT_FEE_SCHEDULE` also supported via Gamma `feesEnabled: false`) |

### 2.2 Eight-Component Cost Waterfall (`EconomicPnLItemizedCosts`)

`netEconomicPnlPusd` deducts all eight explicit and implicit cost components from `grossClosedTradingPnlPusd + makerRebatesPusd + liquidityRewardsPusd` (`CODE VERIFIED`, `economic-truth-pnl.ts:140–158`):

1. **Realized Fees (`realizedFeesPusd`):** Actual venue taker fees paid on filled trades.
2. **Estimated Fees (`estimatedFeesPusd`):** Accrued/pending taker fees on open exit legs (prevents double-counting spread inside fee math; `CODE VERIFIED`, `execution-model-matrix-and-fees.test.ts:108–123`).
3. **Execution Slippage (`slippagePusd`):** Market impact, half-spread crossing on taker exits, and stale-quote adverse fill cost during cancel-flight (`35ms` median / `180ms` p99).
4. **Relayer & Polygon Gas (`relayerGasPusd`):** CTF `splitPosition`, `mergePositions`, `redeemPositions`, and ERC-20 bounded approval gas/relayer fees.
5. **LLM / Inference Cost (`inferenceCostPusd`):** API/compute cost for the `predict-raven` market-blind forecasting branch (billed even when `w_skill = 0`).
6. **Fixed Infrastructure Cost (`infraCostPusd`):** Dedicated low-latency VPS, Polygon RPC, monitoring, and R2 archive (~`$600/month` = `~$7,200/year` full live stack; `SOURCE VERIFIED`, PDF pp. 65, 68, 74–75).
7. **Locked-Capital Opportunity Cost (`opportunityCostPusd`):** Default `4.5%/yr` (`DEFAULT_OPPORTUNITY_COST_ANNUAL_RATE = 0.045`) over `lockedCapitalPusd * 0.045 * (weightedAvgLockupDays / 365)` (`CODE VERIFIED`, `economic-truth-pnl.ts:14, 130–132`).
8. **UMA Dispute Lockup Cost (`umaDisputeLockupCostPusd`):** Additional carry over `3–6` day UMA Optimistic Oracle dispute freeze windows (`lockedCapitalPusd * 0.045 * (umaDisputeLockupDays / 365)`; `CODE VERIFIED`, `economic-truth-pnl.ts:133–135`; `SOURCE VERIFIED`, PDF p. 33).

---

## 3. Rewards-Dependency Test (`netEconomicPnlExRewardsPusd`)

Polymarket liquidity rewards are discretionary and can be cut or re-weighted without notice (`SOURCE VERIFIED`, PDF p. 60). Therefore, `computeCanonicalEconomicPnL` computes:
- `netEconomicPnlPusd = grossClosedTradingPnlPusd + makerRebatesPusd + liquidityRewardsPusd - totalCostsPusd`
- `netEconomicPnlExRewardsPusd = grossClosedTradingPnlPusd + makerRebatesPusd - totalCostsPusd`
- `isRewardsDependent = netEconomicPnlPusd > 0 && netEconomicPnlExRewardsPusd <= 0` (`CODE VERIFIED`, `economic-truth-pnl.ts:155–177`).

Under IC KPI #9 (`ic-kpi-scorecard.ts:122`), a strategy MUST remain strictly net-positive (`> 0 pUSD`) even after a **`-50%` liquidity rewards haircut** (`LIQUIDITY_REWARDS_MINUS_50PCT` in `quant-stress-and-bootstrap.ts:180`; `CODE VERIFIED`). If `isRewardsDependent === true`, the strategy is classified as subsidy-farming rather than durable alpha and cannot pass `ECONOMIC_G11`.

---

## 4. Capital Viability Threshold: Conditional Pilot vs Minimum Viable Capital (MVC)

Per IC PDF pp. 65, 68, and 74–75 (`SOURCE VERIFIED`), fixed live infrastructure (`~$600/mo` = `~$7,200/yr`) creates a hard fixed-cost hurdle that separates **operational validation** from **economically viable deployment**:

| Capital Tier | Capital Envelope | Annualized Fixed-Infra Drag (`$7,200/yr`) | + `4.5%/yr` Carry Hurdle | Required Gross Strategy Yield Just to Break Even | Role & Governance Status | Evidence |
|---|---|---|---|---|---|---|
| **Paper / `$100` Operational Smoke** (POLY-G5/G6 Deviation) | `100 pUSD` (`$5` max order, `$20` max exposure) | `7,200%` (non-economic) | `4.5%` | Not economically viable | Plumbing smoke test only; **NOT alpha proof**; `DISABLED` (`HOLD`) | `SOURCE VERIFIED` |
| **IC Conditional Micro-Pilot** | `2,500–5,000 pUSD` | `144%–288%` (if full `$600/mo` stack allocated) | `4.5%` | Unprofitable after full infra; requires lightweight pilot infra or R&D subsidy | Conditional live execution & fill-rate fidelity validation **only after G11+G12+G13 PASS** | `SOURCE VERIFIED` |
| **IC Deployable Capacity Floor (KPI #10)** | `25,000 pUSD` | `28.8%` | `4.5%` | `>= 33.3%` gross net-of-trading-cost yield | Minimum strategy capacity required by KPI #10 (`deployableCapacityPusd >= 25_000`) | `CODE VERIFIED` |
| **IC Minimum Viable Capital (MVC)** | `40,000–50,000 pUSD` | `14.4%–18.0%` | `4.5%` | `>= 18.9%–22.5%` net trading yield before infra/carry | Break-even commercial scale covering `~$7,200/yr` fixed infra + `4.5%/yr` carry | `SOURCE VERIFIED` |

---

## 5. Current Empirical Economic Status

- **Live / 30-Day Replayed Economic PnL:** **`UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE`** (`0 / 30` days L2 WAL, `0 / 500` qualifying maker fills, `0 / 150` resolved OOS forecasts; `CODE VERIFIED` via `ic-kpi-scorecard.ts`).
- **Economic Gate (`ECONOMIC_G11`):** **`HOLD`** (`REAL_MONEY_TRADING = DISABLED`).

---

## 6. Unresolved Questions

1. Should `calcQuadraticTakerFeeV2` in `src/desk/execution/polymarket-clob-v2-fee-math.ts` enforce 5-decimal rounding (`Math.round(x * 1e5) / 1e5`) natively to match the venue rounding rule on IC PDF p. 31?
2. During the `2,500–5,000 pUSD` conditional micro-pilot (if G11/G12/G13 ever pass), should fixed infrastructure be sized down to `~$60–$100/mo` (single VPS + R2) while still evaluating commercial viability against the full `$7,200/yr` MVC hurdle?
