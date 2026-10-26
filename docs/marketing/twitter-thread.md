# Twitter Thread: Solo Quant Desk & Polymarket Market-Making Launch

**Tweet 1/8 (HOOK):**
Why 90% of prediction market traders lose money:
They don't have a prediction problem. They have a position sizing problem.

I built a Solo Quant Desk running automated market making on Polymarket with Quarter-Kelly sizing and 0% maker fees.

Here's the full architecture and how you can run it free 🧵

---

**Tweet 2/8:**
The Polymarket opportunity:
Unlike traditional crypto exchanges with high taker/maker fees, Polymarket provides 0% maker fees on prediction markets.

By placing bid and ask orders around fair-value mid-price, you capture the spread when market participants buy and sell event outcomes.

---

**Tweet 3/8:**
Why manual market making fails:
- Spreads move in sub-second intervals
- Unhedged inventory during sudden breaking news causes catastrophic drawdowns
- Emotion-driven position sizing destroys compounded capital

Automation + mathematical risk controls is the only sustainable edge.

---

**Tweet 4/8:**
The Risk Architecture:
1. Quarter-Kelly sizing: f* = (bp - q) / (4b) prevents over-leveraging
2. Fail-Closed Circuit Breaker: trips immediately after consecutive losses or state anomalies
3. Non-Custodial: Funds stay in your Polymarket proxy wallet at all times

---

**Tweet 5/8:**
Truth in Data:
We test and audit everything publicly.
On our leaderboard, any backtest strategy with under 30 trades displays an explicit INSUFFICIENT_SAMPLE (<30) badge.
17,353+ tests passing across the repository.

---

**Tweet 6/8:**
Dual-Funnel Model:
- **Solo Quant Desk**: Open research, live paper stats, and methodology at https://cashclaw.cc/methodology
- **CashClaw RaaS**: Turnkey cloud deployment connecting to your Polymarket API keys at https://cashclaw.cc/pricing

---

**Tweet 7/8:**
Pricing Plans:
• **FREE ($0/mo)**: 1 strategy, 10 trades/day, $25 daily loss cap
• **PRO ($49/mo)**: 5 strategies, 200 trades/day, $500 loss cap, full API
• **ENTERPRISE ($199/mo)**: Unlimited strategies, $10,000 loss cap, priority support

---

**Tweet 8/8 (CTA):**
Audit our methodology or start trading free today:
→ https://cashclaw.cc

Built solo. Open for everyone.

#Polymarket #AlgoTrading #Quant #KellyCriterion #DeFi
