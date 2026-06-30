# Go-Live Launch Content — Ready to Post

> Copy-paste ready. All times in UTC.

---

## T+0h: Twitter Launch Thread (8 tweets)

### Tweet 1 — Hook
```
Prediction markets are the new alpha frontier.

Most traders lose because they bet blind — no sizing, no calibration, just vibes.

We fixed that. 🧵
```

### Tweet 2 — Problem
```
The problem with prediction markets:

• No position sizing discipline
• Signal quality is random  
• You're trading against pros who run models

You need edges. Plural. And math to size them right.
```

### Tweet 3 — What is CashClaw
```
CashClaw is a RaaS platform: Robot-as-a-Service.

52+ AI strategies scan prediction markets 24/7. Each signal comes with Kelly-optimal position sizing — the same math that made Ed Thorp a legend.

Subscribe. Get signals. Trade. No config needed.
```

### Tweet 4 — How It Works
```
How it works in 3 steps:

1. Subscribe — Starter ($49), Pro ($149), or Elite ($499)/mo
2. Get signals — via dashboard or Telegram bot
3. Trade — with mathematically-optimized position sizes

All payments in USDT via NOWPayments.
```

### Tweet 5 — The Math
```
Kelly Criterion: f* = (bp - q) / b

Translation: we calculate exactly how much of your bankroll to risk on each trade. Not too much (bust risk). Not too little (leaving money on the table).

Dual-model AI: one for market analysis, one for risk calibration.
```

### Tweet 6 — Trust
```
We don't ask you to trust us blind:

• 2,430+ tests pass before every deploy
• 0 TypeScript errors in production
• 52+ strategies across Polymarket, CEX, DEX
• Dual-model architecture with audit trail

Production-grade. Day one.
```

### Tweet 7 — Pricing
```
Simple tiers. No hidden fees.

Starter — $49/mo → Core signals + dashboard
Pro — $149/mo → Priority signals + advanced analytics  
Elite — $499/mo → Full strategy suite + direct support

All paid in USDT. Cancel anytime.
```

### Tweet 8 — CTA
```
Ready to trade with the math on your side?

→ https://cashclaw.cc

52 strategies. Kelly sizing. Subscribe and go.

#CashClaw #PredictionMarkets #Polymarket #AlgoTrading
```

---

## T+4h: Polymarket Discord

```
Hey everyone — we just launched CashClaw, an AI-calibrated signal platform for prediction markets.

What it does:
• 52+ strategies scanning Polymarket + CEX/DEX 24/7
• Kelly-optimal position sizing on every signal
• Dashboard + Telegram delivery

Quick facts:
• 2,430+ tests, production-grade from day one
• Dual-model AI: market scanner + risk calibrator
• $49-$499/mo, USDT via NOWPayments

We're not another alpha group or meme signal channel. This is a proper RaaS platform. Happy to answer questions.

→ https://cashclaw.cc
```

---

## T+12h: Reddit r/algotrading

**Title:** I built an AI-calibrated signal engine for prediction markets with Kelly-optimal position sizing

```
After months of development, I'm launching CashClaw — a RaaS platform for prediction market trading.

Technical details:
• 52+ strategies: 32 Polymarket, 12 CEX, 8 DEX  
• Dual-model AI architecture: Nemotron-3 Nano (scanner) + DeepSeek R1 (reasoner)
• Kelly Criterion position sizing with drawdown protection
• WebSocket real-time delivery + Telegram bot integration
• 2,430+ vitest tests, 0 TypeScript errors
• Built on TypeScript/Node.js, deployed to Cloudflare Workers

Architecture TL;DR:
- Desk (proprietary trading engine) → generates signals
- Platform (RaaS subscriber layer) → delivers to tenants  
- Shared kernel → types, DB, utilities

I'm sharing this because I want honest technical critique. The code is solid (2,430 tests, clean TS), but I'm a solo dev and there are blind spots.

Ask me anything about the architecture, the strategies, or the Kelly implementation.

→ https://cashclaw.cc
```

---

## T+24h: Twitter Follow-up

```
24 hours since launch. Here's what's happening:

• [INSERT REAL METRIC — first subscribers, signal count, etc.]
• API is live at api.cashclaw.cc  
• Dashboard is open at cashclaw.cc

What people are asking:
Q: "Why not a free tier?" → AI inference costs real money. But Starter is $49.
Q: "How is this different from signal groups?" → Kelly sizing + dual-model AI + production infra.

Questions? Drop them below. 👇

cashclaw.cc
```

---

## T+48h: Discord Check-in

```
48 hours post-launch update:

• [METRICS UPDATE]
• What we're fixing/improving based on early feedback
• Q&A session this weekend — drop questions in thread

Thanks for the support and the tough questions. Keep them coming.

cashclaw.cc
```

---

## Asset Checklist

| Asset | Status | Notes |
|-------|--------|-------|
| OG image (1200×630) | ✅ Done | `landing/src/og-image.png` |
| Twitter banner (1500×500) | ⬜ Needed | Use same design as OG image |
| Launch thread graphic | ⬜ Needed | Signal dashboard screenshot |
| Polymarket-style UI mockup | ⬜ Needed | Screenshot from dashboard |
| Discord server setup | ⬜ Needed | For community Q&A |
| Twitter profile update | ⬜ Needed | CashClaw branding + link |

---

## Before Posting Checklist

- [ ] Set `api.cashclaw.cc` DNS to gray cloud (DNS-only) in Cloudflare Dashboard
- [ ] Verify `https://api.cashclaw.cc/api/health` returns 200
- [ ] Verify `https://cashclaw.cc` loads with OG tags (social preview)
- [ ] Set COMMIT_SHA + DEPLOYED_AT wrangler secrets on `mekong-engine` worker
- [ ] Create at least 1 coupon code for launch discount (e.g. LAUNCH20)
- [ ] Test full signup flow: landing → NOWPayments → activation
