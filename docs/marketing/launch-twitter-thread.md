# Launch Twitter/X Thread — Solo Quant Desk & CashClaw RaaS Launch

**Tweet 1/8 (HOOK):**
I built a solo quantitative desk on Polymarket with an autonomous agent stack.

One human. Zero overhead. Open methodology. 17,353+ tests passing.

Here is how a solo operator runs a verifiable prediction-market desk and how you can deploy CashClaw on your own capital 🧵

---

**Tweet 2/8:**
The thesis: You don't need a 20-person team or institutional overhead to capture edge on prediction markets.

I spent months building a full-stack quantitative desk:
- Polymarket CLOB v2 market-making & arbitrage
- Event orderbook depth & spread scanning
- Fail-closed risk guard with automated circuit breaker
- Zero cloud database costs: local SQLite + Cloudflare edge + PostgreSQL MCU metering

All running transparently.

---

**Tweet 3/8:**
The core problem on prediction markets isn't predicting outcomes — it's position sizing.

Most retail traders bet on gut feeling and blow up on fat-tail events.

CashClaw enforces Quarter-Kelly Criterion sizing:
f* = (bp - q) / (4b)

Translation: mathematically bounded position sizes that protect capital during unexpected news shocks.

---

**Tweet 4/8:**
Verifiable Proof-of-Work:

Every paper trade and live execution batch is recorded.
We publish winning weeks alongside losing weeks.

On our backtest leaderboard, every strategy with fewer than 30 trades carries an explicit `INSUFFICIENT_SAMPLE (<30)` warning badge. No fake Sharpe ratios. No curve-fitting hype.

---

**Tweet 5/8:**
Dual-Funnel Architecture:

1. **Solo Quant Desk (`cashclaw.cc/` & `/methodology`)**: Free open methodology, backtest datasets, and manifesto for independent researchers.
2. **CashClaw RaaS (`cashclaw.cc/pricing`)**: Cloud-native subscription that connects non-custodially to your own Polymarket API keys.

Your funds never leave your wallet. We execute trades; you keep custody.

---

**Tweet 6/8:**
Transparent Pricing (No hidden lock-ins):

- **FREE ($0/mo)**: 1 active strategy, 10 trades/day, $25 daily loss cap, $50 max position
- **PRO ($49/mo)**: 5 active strategies, 200 trades/day, $500 daily loss cap, $1,000 max position, API access
- **ENTERPRISE ($199/mo)**: Unlimited strategies & trades, $10,000 daily loss cap, priority support

---

**Tweet 7/8:**
Tech Stack & Battle-Tested Engineering:

- TypeScript strict mode (0 `:any` types)
- Vitest suite: 17,353+ tests passing across core desk, live guards, and web dashboard
- Cloudflare Workers edge runtime (<50ms execution latency)
- Fail-Closed circuit breaker: automatically halts order placement after consecutive losses or state anomalies

---

**Tweet 8/8 (CTA):**
Ready to trade prediction markets with mathematical discipline?

1. Read our open methodology: https://cashclaw.cc/methodology
2. Deploy CashClaw for free: https://cashclaw.cc/signup?tier=free
3. Explore the dashboard: https://cashclaw.cc

Questions? Drop them below. Built solo, verified in public.

#Polymarket #QuantTrading #PredictionMarkets #KellyCriterion #AlgoTrading
