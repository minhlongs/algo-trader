# MCU Definition — Monetizable Compute Unit / Định nghĩa Đơn vị Tính toán Được Tính phí

> **Owner/source of truth for the number:** `src/platform/signals-api/usage-metering-types.ts`
> (`MCU_LIMITS`, `MCU_OVERAGE_PRICES`). If this document and the price book disagree, the
> price book is what the code charges and this document is wrong.

## 1. What MCU is / MCU là gì

An MCU (Monetizable Compute Unit) is **one billed compute operation** — the unit a customer's
compute allowance is spent in. It is one of three separate allowances the meter keeps on the same
durable row, and they never cross-spend:

| Allowance | One unit equals / Một đơn vị bằng | Column / Cột | Price book |
|---|---|---|---|
| API calls | one metered API request | `calls_this_period` | `MONTHLY_LIMITS` |
| Trades | one executed order (count + notional volume) | `trades_this_period`, `trade_volume` | `MONTHLY_LIMITS` |
| MCU | one billed compute operation | `mcu_this_period` | `MCU_LIMITS` |

**MCU là một thao tác tính toán được tính phí.** Có ba hạn mức riêng biệt trên cùng một dòng
bền vững (`usage_metrics`). Tiêu một đơn vị của hạn mức này không bao giờ tiêu hạn mức kia, vì
đó là ba sản phẩm có ba mức giá khác nhau.

Because all three live on the row `recordCall`/`recordMcu`/`recordTrade` write, the number that
blocks a request, the number that bills it, and the number a dashboard shows are one number — not
three that could drift apart.

## 2. What one MCU costs today / Một MCU tốn bao nhiêu

Since `recordMcu` is not yet called from any production request path (see §4), the honest answer is
that **no operation currently consumes a customer's MCU allowance**. The allowance table exists and
is enforced on read, but no request writes to it yet.

| Operation / Thao tác | MCU cost | Status |
|---|---|---|
| One metered API request | 1 MCU *(proposed)* | **Not wired** — `recordMcu` has no production caller; only `checkMcu`/`recordMcu` tests exercise it |
| One executed trade | 1 MCU *(proposed)* | **Not wired** — trades record into `trades_this_period`, not `mcu_this_period` |
| One backtest run | *(undecided)* | Not defined |

The proposed 1:1 mapping is what the code is shaped to support (one metered request → one unit),
and it matches the API-call allowance being one call. It is **a proposal, not a live contract** —
adopting it means adding the `recordMcu` call on the request path, which is a product decision with
a billing consequence, not something this document can make true on its own.

## 3. The allowances / Các hạn mức

Canonical contract (`FREE|STARTER|PRO|ENTERPRISE|MASTER`) — what the meter enforces:

| Tier | MCU/month | MCU overage (USD) |
|---|---|---|
| FREE | 1,000 | 0 |
| STARTER | 5,000 | 0.02 |
| PRO | 25,000 | 0.01 |
| ENTERPRISE | 250,000 | 0.005 |
| MASTER | unlimited | 0 |

**Two tier vocabularies, deliberately not mapped.** The repo also carries a desk contract
(`BASIC|PREMIUM|ENTERPRISE|MASTER`, in `src/desk/opencoresaas2026monetization/billing-meter.ts`)
which prices MCU at different numbers (BASIC 1,000 / PREMIUM 25,000 / ENTERPRISE 250,000 /
MASTER 1,000,000). The two are **not** interchangeable: the canonical set has five tiers and prices
API calls, the desk set has four and prices MCU, and BASIC carries two conflicting numbers
(1,000 MCU here vs the FREE API-call allowance of 1,000 calls). The meter therefore **refuses** a
tier its price book does not declare, rather than silently measuring that customer against the
free allowance — which would under-serve a paying customer and under-bill them at the same time.

An unlimited tier declares `-1` and is answered *before* the comparison, so it never reads as
already exhausted and never computes an enormous overage charge off a negative allowance.

## 4. What is enforced vs what is planned / Cái gì đang có so với cái gì còn phải làm

**Enforced (behavior-verified):** a `checkMcu` decision past the allowance returns HTTP 402 on the
same durable number that bills it; the count survives a restart (this is what replaces the
in-process `Map` in the desk meter, which reset on every deploy); MCU and API calls stay separate
allowances; a tier outside the price book is refused, not defaulted.

**Not wired (gap):** no production request path calls `recordMcu`. `open-core-routes.ts` — the one
MCU-facing route that is actually mounted — still checks and records against the desk
`BillingMeter`, whose counter is in-process and therefore resets on restart. So today the durable
store protects a decision that nothing yet increments, while the live path still uses the counter
that resets. Wiring `recordMcu` onto the request path is a separate change with a real billing
effect; it is not claimed as done here.
