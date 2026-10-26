# Launch Reddit Post — r/algotrading

**Title:** I built a solo quant desk on Polymarket with Quarter-Kelly sizing & Fail-Closed circuit breakers (17,353+ tests, $0 overhead)

**Body:**

Hey r/algotrading,

I spent the past months building a full-stack quantitative desk and RaaS platform targeting Polymarket prediction markets. The entire architecture is live and verifiable in public.

### The Problem with Prediction Markets
Prediction markets have massive liquidity ($500M+/month), 0% maker fees, and distinct event-driven dynamics. However, most retail participants trade on gut feel and lack two critical things:
1. **Mathematical Position Sizing:** Blindly betting fixed dollar amounts blows up accounts during tail-risk news events.
2. **Fail-Closed Risk State:** If a database connection hiccups or market volatility spikes, naive bots continue firing orders until capital is liquidated.

### What We Built:
- **Core Engine:** TypeScript strict-mode quantitative engine running order book scanning, spread estimation, and automated limit order placement on Polymarket CLOB v2.
- **Risk Architecture:** Quarter-Kelly Criterion sizing `f* = (bp - q) / (4b)` with dynamic daily drawdown caps, max concurrent position limits, and an automated Fail-Closed circuit breaker.
- **Truth in Data:** On our strategy leaderboard, any backtest sample with under 30 trades carries an explicit `INSUFFICIENT_SAMPLE (<30)` warning badge. No fake 100% win rate marketing.
- **Infrastructure:** 17,353+ tests passing across the repository, SQLite local store + PostgreSQL MCU usage metering, deployed on Cloudflare edge.

### Dual-Funnel Structure:
- **Solo Quant Desk (`cashclaw.cc/` & `/methodology`):** Open methodology, public trade log batches, and research manifesto for independent quants.
- **CashClaw RaaS (`cashclaw.cc/pricing`):** Non-custodial deployment connecting to your existing Polymarket API keys. You retain 100% control of your funds.
  - **Free Tier ($0/mo):** 1 strategy, 10 trades/day, $25 daily loss cap.
  - **Pro Tier ($49/mo):** 5 strategies, 200 trades/day, $500 loss cap, API access.
  - **Enterprise Tier ($199/mo):** Unlimited strategies, $10,000 loss cap, priority support.

Happy to answer any technical questions about CLOB integration, order book depth modeling, Kelly calibration, or fail-closed state machines in the comments!

Live site & methodology: https://cashclaw.cc
