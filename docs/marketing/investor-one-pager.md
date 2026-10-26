# CashClaw & Solo Quant Desk — Investor & Partner One-Pager

> **Website:** https://cashclaw.cc  
> **API Edge:** https://api.cashclaw.cc  
> **Category:** Autonomous Quantitative Desk & Non-Custodial Prediction Market RaaS

---

## 1. Executive Summary

**CashClaw** is a production-grade quantitative platform and Robot-as-a-Service (RaaS) built for Polymarket prediction markets. Operating on a **Dual-Funnel** model, we combine a transparent, verifiable public research lab (**Solo Quant Desk** at `/methodology`) with a turnkey, non-custodial SaaS subscription (**CashClaw RaaS** at `/pricing`).

The platform is backed by **17,353+ passing automated tests**, zero TypeScript errors, atomic PostgreSQL MCU usage metering, Quarter-Kelly position sizing, and a Fail-Closed execution circuit breaker.

---

## 2. The Problem

Prediction markets like Polymarket process hundreds of millions of dollars in monthly volume with 0% maker fees, yet retail and semi-pro participants face three structural barriers:
1. **No Position Sizing Discipline:** Traders bet arbitrary sizes on binary events and suffer catastrophic drawdowns during fat-tail news shocks.
2. **Fail-Open Bot Risk:** DIY trading scripts lack state-hydrated circuit breakers and continue firing orders during API or database anomalies.
3. **Opaque Performance Claims:** Signal groups cherry-pick tiny backtest samples (`n < 30`) without statistical significance.

---

## 3. The CashClaw Solution

| Capability | Engineering Implementation |
|------------|----------------------------|
| **Market Making & Spread Capture** | Automated bid/ask quoting around fair-value mid-price on Polymarket CLOB v2 with 0% maker fees |
| **Quarter-Kelly Position Sizing** | Mathematically bounded allocation `f* = (bp - q) / (4b)` capped by `maxPositionFraction` |
| **Fail-Closed Circuit Breaker** | `LiveExecutionGuard` halts execution on daily drawdown limits, consecutive losses, or state-store errors |
| **Statistical Honesty** | Strategy leaderboard flags any backtest with `< 30` trades via explicit `INSUFFICIENT_SAMPLE (<30)` badges |
| **Non-Custodial Security** | Trade-only Polymarket CLOB API keys — subscriber funds never leave their own wallet |
| **Atomic Usage Metering** | Single-statement PostgreSQL `INSERT ... ON CONFLICT DO UPDATE` MCU ledger + Cloudflare edge deployment |

---

## 4. Business Model & Unified Pricing

CashClaw operates a transparent 3-tier self-serve SaaS model settled via USDT (NOWPayments) with zero lock-in:

| Tier | Monthly Price | Active Strategies | Daily Trades | Daily Loss Cap | Max Position | Target Segment |
|------|---------------|-------------------|--------------|----------------|--------------|----------------|
| **Free** | **$0/mo** (forever) | 1 | 10 | $25 | $50 | Evaluation, new prediction market traders |
| **Pro** | **$49/mo** | 5 | 200 | $500 | $1,000 | Active retail & semi-pro Polymarket traders |
| **Enterprise** | **$199/mo** | Unlimited | Unlimited | $10,000 | $25,000 | Power users, syndicates, quantitative desks |

*(Custom institutional deployments with dedicated SLAs are available on request via `/enterprise`.)*

---

## 5. Technical Validation & Traction

- **17,353+ Passing Tests:** Comprehensive unit, integration, and UI test suites across 700+ test files.
- **Strict Type & Code Quality:** Zero TypeScript `:any` types, automated quality baseline ratchet in GitHub Actions CI.
- **Edge-Native Infrastructure:** Deployed on Cloudflare Pages (`cashclaw.cc`) and Cloudflare Workers (`api.cashclaw.cc/*`) with `<50ms` health latency.
- **Dual-Funnel Acquisition:** Top-of-funnel organic traffic from technical publications (`/methodology`, `/manifesto`, X, r/algotrading, Hacker News) converts directly into Free ($0) and Paid ($49 / $199) RaaS tiers.
