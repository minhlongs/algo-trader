# POLY-G10 Phase 8 — Solo-Operator vs. Institutional Unit Economics

**Date:** 2026-11-23
**PDF Reference:** `POLY ALPHA HUNTER v4` pp. 67–68 (Unit Economics & Minimum Viable Capital)
**Prior Repo Reference:** `docs/poly-g8-6/04-VPS-R2-ECONOMICS-DECISION.md`, `src/desk/polymarket/l2/l2-collector-cost-assumptions.ts`
**Budget Gate:** `ECONOMIC_G11 = HOLD` | `VPS_R2_ACTIVATION = HOLD` | `INFRA_BUDGET = HOLD`

---

## 1. PDF Institutional Baseline vs. Solo-Operator Reality

| Cost / Capital Line | PDF Institutional Model (pp. 67–68) | Solo-Operator Model (`l2-collector-cost-assumptions.ts` & G8.6) | Delta / Implication |
|---|---|---|---|
| **Fixed Monthly Infra** | `$600/mo` (`$7,200/yr`; range `$500–$800/mo` VPS + dedicated RPC + LLM API + monitoring) | `$30.00/mo` hard budget ceiling (`l2-collector-cost-assumptions.ts:75`); 150-market 30d VPS+R2 projection = `$31.06–$59.32/mo` pre-tax & **excluding** commercial data license | Even stripped to VPS+R2 without live RPC/LLM, 150-market capture exceeds the `$30/mo` solo ceiling before license fees |
| **Data License (Polymarket / ICE)** | Not explicitly priced in PDF `$600/mo` table | **Unknown** (`DATA_LICENSE = HOLD`; commercial ICE/Polymarket licensing can dwarf VPS+R2 cost) | Must obtain written Track A quote before unlocking any spend |
| **Opportunity Cost of Locked Capital** | `4.5%/yr` (`DEFAULT_OPPORTUNITY_COST_ANNUAL_RATE = 0.045`) + `3–6 days` UMA dispute lockup | Enforced in `src/desk/polymarket/economic-truth-pnl.ts` (both linear and compound ROC) | Eliminates false profitability on slow-resolving markets |
| **Minimum Viable Trading Capital** | **`40,000–50,000 pUSD`** (at `$600/mo` fixed infra) | Lower fixed infra reduces break-even capital, **only if** data license + RPC + LLM stay below ~$100/mo; otherwise institutional `$40k–$50k pUSD` floor applies | Do not deploy real money at sub-viable capital where fixed costs eat alpha |

---

## 2. PDF Institutional Scenario Table (pp. 67–68, `$600/mo` Fixed Infra)

| Starting Capital | Bear Case (Hard-Capped `-3.0%` Pilot Stop) | Base Case (Net of `$7,200/yr` Infra) | Bull Case (Net of `$7,200/yr` Infra) | Viability |
|---|---|---|---|---|
| `25,000 pUSD` | `-31.3%` uncapped (capped `-3.0%` / `-$750`) | **`-0.8%` (`-$200`)** | `+31.2%` (`+$7,800`) | **Sub-viable** (Base case negative) |
| `50,000 pUSD` | `-16.9%` uncapped (capped `-3.0%` / `-$1,500`) | **`+13.6%` (`+$6,800`)** | `+45.6%` (`+$22,800`) | **Minimum viable institutional floor** |

---

## 3. Solo-Operator Cost Control Rules & Hard Kill-Switches

1. **Zero Unbudgeted Provisioning:** No VPS, Cloudflare R2 bucket, paid Polygon RPC, or LLM inference subscription is provisioned in POLY-G10 (`VPS_R2_ACTIVATION = HOLD`).
2. **All-In Quote Requirement:** Before lifting `INFRA_BUDGET = HOLD`, the Founder must approve a single all-in monthly figure combining:
   - Linux VPS + tax/FX fees
   - Cloudflare R2 storage + Class A/B operations
   - Track A written data license fee (if non-zero)
   - Dedicated Polygon RPC (only when moving to Phase 6/Pilot, never public `polygon-rpc.com`)
3. **Automated Spend Kill-Switch:** Collector host must auto-halt if projected monthly storage/ops exceeds the approved ceiling or local spool disk exceeds `75%`.
4. **Capital-Efficiency Guard:** Any strategy whose net economic PnL flips non-positive under `1.5x` slippage/cancel-latency stress, `-50%` liquidity rewards haircut, or `+0.5¢` adverse slippage shock fails KPI 9 and is pruned before capital deployment.
