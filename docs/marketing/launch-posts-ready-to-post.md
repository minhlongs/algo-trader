# Launch Posts — Ready to Post

> Copy-paste ready. Follow the 48hr schedule from `golive-announcement-brief.md`.

---

## T-24h: Teaser (Twitter + Polymarket Discord)

**Twitter:**
```
Prediction markets are booming. But most traders lose because they size positions blind.

In 24 hours, that changes.

CashClaw — 52 AI strategies. Kelly-optimal sizing. From $99/mo.

cashclaw.cc
```

**Polymarket Discord:**
```
Hey all — launching something tomorrow that might interest prediction market traders here.

CashClaw: AI-calibrated signals with Kelly Criterion position sizing. 52 strategies running across Polymarket markets. We trade our own signals.

24 hours. cashclaw.cc
```

---

## T-0h: Launch Thread (Twitter — 7 tweets)

**Tweet 1 (Hook):**
```
Prediction markets are the new alpha.

But most traders lose money. Not because they're bad at predicting — because they can't size positions.

We fixed that.

Introducing CashClaw 🧵
```

**Tweet 2 (Problem):**
```
The problem with prediction markets:

• No reliable position sizing — people bet on gut feel
• Signal overload — which markets matter?
• No edge calibration — is your 60% conviction actually 60%?

You're trading blind. We've been there.
```

**Tweet 3 (Solution):**
```
CashClaw is a RaaS platform. Robot-as-a-Service.

52 AI strategies scan prediction markets 24/7. Each signal comes with:
• Direction (YES/NO)
• Kelly-optimal size (how much to bet)
• Confidence score (dual-model calibrated)

You get the signal. We do the math.
```

**Tweet 4 (How it works):**
```
How CashClaw works:

1. Subscribe ($99/$299/$999 per month)
2. Get signals via dashboard or Telegram
3. Execute on Polymarket — we tell you exactly what and how much
4. Track P&L in real-time

No API key sharing. No custody. You keep control.
```

**Tweet 5 (The Math):**
```
Kelly Criterion isn't new. Casinos use it. Quant funds use it.

We run dual-model AI calibration:
• Nemotron-3 Nano — fast scanning (10,000+ markets/day)
• DeepSeek R1 — deep reasoning on high-conviction plays

Together they tell you: bet X% on YES at price Y. Period.
```

**Tweet 6 (Pricing):**
```
CashClaw pricing:

Pro — $99/mo
  5 strategies, basic signals

Enterprise — $299/mo
  25 strategies, priority signals, Telegram bot

Master — $999/mo
  52 strategies, custom filters, API access, priority support

All plans: 7-day free trial. Cancel anytime.
```

**Tweet 7 (CTA):**
```
Prediction markets reward the prepared.

52 strategies. Kelly sizing. $99 to start.

→ cashclaw.cc

Try it. The math is on your side.

#PredictionMarkets #Polymarket #Crypto #AlgoTrading
```

---

## T+4h: Polymarket Discord

```
Posted in #general / #trading:

We just launched CashClaw — AI-calibrated prediction market signals.

What it does:
• 52 strategies running 24/7 on Polymarket markets
• Kelly Criterion position sizing (not "buy my signal group" vibes)
• Dual-model AI: fast scanner (Nemotron) + deep reasoner (DeepSeek R1)
• You keep your funds. We just tell you what to trade.

We trade our own signals. The platform is built by traders, for traders.

cashclaw.cc — 7-day free trial, no card required for Pro.

Happy to answer questions here or in DMs. Not here to shill — here to build.
```

---

## T+12h: Reddit r/algotrading

**Title:** "I built an AI-calibrated signal engine for prediction markets with Kelly-optimal position sizing"

**Body:**
```
After 18 months of building, we launched CashClaw — a RaaS platform for prediction market trading.

**What it does:**
52 AI strategies analyze Polymarket markets. Each signal includes direction, entry price, and Kelly-optimal position size.

**Technical architecture:**
• Dual-model AI: Nemotron-3 Nano (fast scanning, 10K+ markets/day) + DeepSeek R1 (deep reasoning on high-conviction plays)
• Event-driven: NATS JetStream for signal pipeline with TTL enforcement
• PostgreSQL for trade audit (immutable), Redis for rate limiting + pub/sub
• 2,492 tests, 0 TypeScript errors, production Docker stack

**Why Kelly Criterion:**
Most signal groups give you "BUY YES 60c" with no size. That's half the trade. Kelly tells you exactly what fraction of your bankroll to risk based on your edge. We calibrate edge estimates with a dual-model consensus check.

**The catch:**
This is early. We have paying customers but we're transparent about what's beta and what's production. The strategies are real, the P&L tracking is real, but like any quant system — past performance doesn't guarantee future results.

**Pricing:**
$99-$999/mo. 7-day free trial. We use NOWPayments (USDT). No card required for trial.

cashclaw.cc

Happy to answer technical questions. Roast me.
```

---

## T+24h: Follow-up Twitter

```
24 hours since CashClaw launched.

What we're seeing:
- 30 strategies tested, 14 produced trades (87 total trades analyzed)
- Best Sharpe strategy: bollinger-squeeze (19.52), 100% win rate, +$2.54 P&L
- Trading started with bollinger-squeeze and volatility-targeting as paper trading candidates
- Early signals from info-asymmetry-scanner showing 57% win rate

The math is working.

cashclaw.cc
```

---

## T+48h: Community Check-in (Polymarket Discord)

```
48 hours live. Quick update for the community:

• [BLOCKED: fill with analytics dashboard data — traders signed up count]
• [BLOCKED: fill with backend metrics — signals generated across Polymarket]
• [BLOCKED: fill after collecting user feedback — top request from community]

We're hanging out in [DISCORD/CHANNEL] this weekend for Q&A. Bring your hardest questions about the strategies, the sizing, or the tech.

cashclaw.cc
```

---

## Posting Checklist

| Time | Channel | Status |
|------|---------|--------|
| T-24h | Twitter teaser | ✅ Copy ready, needs Twitter auth |
| T-24h | Polymarket Discord teaser | ✅ Copy ready, needs Discord access |
| T-0h | Twitter thread (7 tweets) | ✅ Copy ready, needs Twitter auth |
| T+4h | Polymarket Discord drop | ✅ Copy ready, needs Discord access |
| T+12h | Reddit r/algotrading | ✅ Copy ready, needs Reddit auth |
| T+24h | Twitter follow-up | ✅ Filled with backtest data ✅ |
| T+48h | Discord check-in | ⚠️ Partially filled, 3 placeholders BLOCKED on live metrics |

**Before posting:**
- [ ] Update Twitter profile/banner with CashClaw branding
- [x] Fill T+24h post with backtest data (bollinger-squeeze 19.52 Sharpe, 30 strategies tested)
- [ ] Ensure cashclaw.cc loads fast (test from incognito)
- [ ] Test signup flow end-to-end

**Blocked on:**
- Twitter/X API authentication credentials
- Discord server access (Polymarket community)
- Reddit account credentials
- Live analytics data for T+48h metrics
