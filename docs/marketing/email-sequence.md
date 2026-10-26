# Email Nurture Sequence (5-Stage Free -> Pro Conversion)

> Automated lifecycle campaign for CashClaw RaaS & Solo Quant Desk subscribers.
> Target: Users who signed up for the Free Tier ($0/mo).
> Objective: Educate on risk management, demonstrate proof-of-work, and convert to Pro ($49/mo).

---

## Email 1: Welcome & Non-Custodial Security (Day 0 — Immediate)

**Subject:** Welcome to CashClaw — Your Non-Custodial Trading Desk is Ready 🎯

Hey [First Name],

Welcome to **CashClaw & Solo Quant Desk** — the autonomous quantitative platform designed specifically for Polymarket prediction markets.

Your Free account is active. Here is how to get started safely:

1. **Keep Full Custody:** Connect your Polymarket API key in the dashboard. Make sure you grant **Trade permissions only** (never enable withdrawals — CashClaw does not want or need custody of your capital).
2. **Review the Risk Guard:** Your Free tier includes a strict **$25 daily loss cap** and a **$50 maximum position size** enforced by our Fail-Closed circuit breaker.
3. **Explore the Open Methodology:** Check out how our Quarter-Kelly sizing model calculates order sizes at https://cashclaw.cc/methodology.

Have questions about setting up your API key? Reply directly to this email — I read every response.

To disciplined trading,

**Solo Founder, CashClaw**  
https://cashclaw.cc

---

## Email 2: The Math of Quarter-Kelly & Downside Protection (Day 2)

**Subject:** Why Full Kelly blows up prediction market accounts (and why we use Quarter-Kelly)

Hey [First Name],

The most common trap in prediction market trading is over-betting on high-conviction events.

When a news headline breaks, an event probability can swing from 85% to 15% in less than 30 seconds. If you use full Kelly Criterion sizing:
`f* = (bp - q) / b`

A single fat-tail misestimation can wipe out 40%+ of your portfolio.

That is why CashClaw strictly enforces **Quarter-Kelly Sizing**:
`f* = (bp - q) / (4b)`

By cutting position sizes to 25% of theoretical optimal, you capture 75% of maximum compounding growth while reducing portfolio variance and drawdown risk by over 80%.

Our `LiveExecutionGuard` calculates this automatically on every single order before it hits the Polymarket CLOB.

Want to see our backtest data across different volatility regimes?  
→ Read the research: https://cashclaw.cc/methodology

Best,

**Solo Founder, CashClaw**

---

## Email 3: Truth in Data — Why We Flag Small Sample Sizes (Day 4)

**Subject:** Why our leaderboard shows "INSUFFICIENT SAMPLE (<30)" warnings

Hey [First Name],

If you look at most trading software websites, every strategy claims a 90% win rate and a 4.0 Sharpe ratio.

In reality, most of those numbers come from 8 cherry-picked trades during a favorable market window.

On the CashClaw Strategy Leaderboard, we do things differently:
- Every strategy with fewer than 30 trades displays an explicit **`INSUFFICIENT_SAMPLE (<30)`** badge.
- We publish losing weeks right alongside winning weeks.
- All paper trading batches are logged with cryptographic verification.

We believe that **verifiability is the only true competitive edge**. If a model cannot survive out-of-sample stress testing, it does not belong in live execution.

Explore the active strategies on your dashboard:  
→ https://cashclaw.cc

Best,

**Solo Founder, CashClaw**

---

## Email 4: Hitting Free Limits — The Pro Tier Advantage (Day 7)

**Subject:** Scaling beyond 10 trades/day with CashClaw Pro ($49/mo)

Hey [First Name],

Over the past week, you have experienced how CashClaw monitors Polymarket order books, calculates fair-value spreads, and enforces fail-closed risk controls.

On the Free tier, your desk is capped at:
- 1 active strategy
- 10 trades per day
- $25 daily loss limit

If you are ready to scale into multi-market market making and cross-event arbitrage, **CashClaw Pro ($49/mo)** unlocks:
- **5 Active Strategies** running simultaneously
- **200 Trades Per Day** to capture fast-moving order book spreads
- **$500 Daily Loss Cap** with $1,000 max position size
- **Full API & Webhook Access** for custom automation

Pro is billed monthly with zero contracts. You can cancel with one click at any time.

→ Upgrade to Pro: https://cashclaw.cc/pricing

To your trading edge,

**Solo Founder, CashClaw**

---

## Email 5: Special First-Month Offer (Day 10)

**Subject:** Exclusive 20% savings on CashClaw Pro (Code: LAUNCH20)

Hey [First Name],

We want to make upgrading to Pro as seamless as possible.

For the next 48 hours, use code **`LAUNCH20`** at checkout to receive **20% off your first month of CashClaw Pro** (or Enterprise).

**With Pro ($49/mo), you get:**
✅ 5 simultaneous strategies across Polymarket  
✅ 200 trades/day execution capacity  
✅ Full API access & custom webhook triggers  
✅ Automated Fail-Closed risk guard & circuit breaker  

Your capital stays in your own non-custodial wallet at all times.

Claim your discount before it expires:  
→ https://cashclaw.cc/pricing?coupon=LAUNCH20

Best regards,

**Solo Founder, CashClaw**  
https://cashclaw.cc
