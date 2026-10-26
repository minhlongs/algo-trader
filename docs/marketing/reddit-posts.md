# Reddit & Hacker News Posts — Solo Quant Desk & CashClaw RaaS

## 1. r/algotrading Post

**Title:** Built an autonomous prediction-market quant desk on Polymarket: Quarter-Kelly sizing, Fail-Closed risk guard, 17,353+ tests

**Body:**

Hey r/algotrading,

After extensive engineering and testing, our Solo Quant Desk & CashClaw RaaS stack is live for Polymarket prediction markets. Here is a technical breakdown of how the system is structured.

### Core Strategy & Market Microstructure
Polymarket offers 0% maker fees on event prediction markets. By quoting bid/ask spreads around the fair-value midpoint and dynamically adjusting for order book depth and volatility, maker bots can harvest spread without taking unhedged directional bets.

### Key Engineering Decisions
1. **Quarter-Kelly Position Sizing:** Full Kelly is too aggressive for fat-tail event markets where breaking news can jump prices by 40% in seconds. We enforce Quarter-Kelly `f* = (bp - q) / (4b)` capped by `maxPositionFraction`.
2. **Fail-Closed Circuit Breaker:** If `LiveExecutionGuard` detects 3 consecutive losing trades, daily drawdown exceeding 5%, or a state-persistence failure, the circuit breaker trips and blocks all outbound orders until manually audited.
3. **Statistical Honesty (`INSUFFICIENT_SAMPLE`):** Backtests with fewer than 30 trades are flagged on the leaderboard so users never confuse small-sample variance with true alpha.
4. **PostgreSQL MCU Metering:** Atomic single-statement `INSERT ... ON CONFLICT DO UPDATE` ensures multi-tenant quota enforcement without race conditions.

### Try It / Inspect the Methodology
- **Open Methodology & Live Paper Batches:** https://cashclaw.cc/methodology
- **RaaS Tiers (`cashclaw.cc/pricing`):**
  - **Free ($0/mo):** 1 active strategy, 10 trades/day, $25 daily loss cap
  - **Pro ($49/mo):** 5 active strategies, 200 trades/day, $500 daily loss cap, API access
  - **Enterprise ($199/mo):** Unlimited strategies & trades, $10,000 daily loss cap, priority support

Ask me anything about Polymarket CLOB v2 signing, slippage estimation, or risk guards!

---

## 2. Hacker News (Show HN) Post

**Title:** Show HN: CashClaw – Solo Quant Desk and Non-Custodial Market Making on Polymarket

**Body:**

Hi HN,

I built Solo Quant Desk / CashClaw (https://cashclaw.cc), an autonomous quantitative desk and non-custodial RaaS platform for Polymarket prediction markets.

The project started with a simple thesis: one engineer with a disciplined agent stack, strict type safety, and automated risk guards can run a full quantitative trading desk with zero institutional overhead.

**Highlights of the stack:**
- **TypeScript Strict Monorepo:** 17,353+ passing unit/integration tests across the execution engine, risk guard, and React dashboard.
- **Fail-Closed Risk State:** Every live order passes through `LiveExecutionGuard` (position fraction check, daily drawdown limit, max concurrent positions, and consecutive-loss circuit breaker).
- **Verifiable Data Integrity:** We publish both winning and losing trade batches. Strategies with `< 30` trades are automatically badged with `INSUFFICIENT_SAMPLE (<30)` on our leaderboard.
- **Non-Custodial by Design:** Users connect via trade-only Polymarket CLOB API keys. Capital never leaves the user's wallet.

We offer a Free Forever tier ($0/mo, 1 strategy, 10 trades/day) alongside Pro ($49/mo) and Enterprise ($199/mo).

Would love your feedback on the methodology (https://cashclaw.cc/methodology) and risk architecture!
