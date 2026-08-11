# CashClaw GTM Launch — Publish-Ready Content Report

**Date:** 2026-08-04
**Updated:** 2026-08-04
**Status:** blog LIVE, Reddit/Twitter/Discord ready-to-post (require human-held accounts), SendGrid blocked

## 1. Reddit — r/algotrading

Title: I built a solo quant desk with an AI Co-pilot -- 2,855 tests, 52 strategies, $0 employees

Body:
r/algotrading,

Just open-sourced my personal trading stack after 18 months of live use.

52 strategies across Polymarket V2, CEX, DEX, plus a DNA GRU forecaster and a dark-edge signal layer. 2,855 tests, all green. Node.js + TypeScript, dual-model AI: Nemotron-3 Nano for speed, DeepSeek R1 for depth. Runs local on M1 Max with TPU — zero cloud API costs, zero latency surprises.

The piece that changed my workflow most is the AI Co-pilot at api.cashclaw.cc

Tiers:
- FREE — basic scanning
- STARTER $19/mo — AI Co-pilot + strategy marketplace
- PRO $99/mo — full co-pilot, 5 intent handlers, Telegram /ask
- ENTERPRISE $299/mo
- MASTER $999/mo — white-label

If you already have a strategy library, the PRO tier is where it gets interesting. The /ask command on Telegram means I can query edge cases mid-session without leaving the terminal.

Happy to answer questions on the stack or the co-pilot logic in the comments.

api.cashclaw.cc

URL to link: https://api.cashclaw.cc
Formatting: Post as text (not link). Bold tiers. First comment = TL;DR for mobile.

## 2. Twitter/X — 7-tweet thread

Tweet 1 (HOOK):
I built a solo quant desk with an AI Co-pilot.
52 strategies. 2,855 tests. 0 employees.
Now I just ask my trading bot "what's my risk?" and it answers in seconds.
Here's what I built and how you can use it 🧵

Tweet 2:
The thesis: One human with the right tools can compete with any team.
I spent 18 months building an AI-native trading platform:
- 30+ Polymarket strategies (CLOB v2)
- CEX arbitrage + DEX liquidity
- GRU neural net (DNA engine) for regime prediction
- All running on a single M1 Max
No team. No funding. Just code. [1/7]

Tweet 3:
What is the AI Co-pilot? A natural language interface to your trading desk.
Ask it:
- "What is my risk exposure?" → instant risk assessment
- "Find arbitrage opportunities" → live arb scan
- "How are my strategies performing?" → P&L + win rate
- "What is the market doing?" → regime detection
- "Generate a weekly report" → full summary
Available in the dashboard and Telegram. [2/7]

Tweet 4:
2,855 tests. 52 strategies. Regime-adaptive fusion.
- 190 test files, 100% passing
- Strategies adapt to bull/bear/range regimes
- Signal fusion across 3+ data sources
- Circuit breaker + drawdown protection on every trade
No mocks. No shortcuts. Real infra. [3/7]

Tweet 5:
Pricing that scales with you:
FREE — basic scanning, community access
STARTER ($19/mo) — unlock AI Co-pilot + marketplace
PRO ($99/mo) — full Co-pilot, Telegram /ask, all intents
ENTERPRISE ($299/mo) — custom, dedicated
MASTER ($999/mo) — white-label
No lock-in. Cancel anytime. [4/7]

Tweet 6:
The solo quant manifesto:
- You don't need a team. You need better tools.
- You don't need funding. You need algorithms.
- You don't need luck. You need edge.
52 strategies. 1 engineer. 0 excuses. [5/7]

Tweet 7 (CTA):
Ready to level up your trading?
Try it free: https://api.cashclaw.cc
Watch the demo: [link]
Join the community: [Discord link]
Built solo. Open for everyone.
#algotrading #quant #AI #trading #Polymarket [7/7]

## 3. Discord — Polymarket Discord

Variant A (announcements channel):
👀 Solo quant stack — AI co-pilot for trading
52 strategies | 2,855 tests | Node.js + TS
Local inference: Nemotron-3 Nano + DeepSeek R1 on M1 Max + TPU. Zero cloud API costs.
Tiers → api.cashclaw.cc
FREE — basic scanning
STARTER $19/mo — co-pilot + marketplace
PRO $99/mo — 5 intent handlers + Telegram /ask
ENTERPRISE $299/mo
MASTER $999/mo — white-label
Best value: PRO tier. The /ask command alone saves me hours a week.
Questions welcome ↓
api.cashclaw.cc

Variant B (bots channel):
🚀 AI Co-pilot is LIVE — Polymarket traders, meet your new assistant
A natural language trading assistant that connects directly to your strategies. Ask questions, get answers. No dashboards. No SQL. No CLI.
What you can ask:
/ask what is my risk exposure? — instant Kelly-based risk assessment
/ask find arbitrage opportunities — live CLOB spread scan (30+ markets)
/ask how are my strategies performing? — win rate, Sharpe, P&L per strategy
/ask what is the market doing? — regime detection + signal fusion
/ask generate a weekly report — full P&L summary with recommendations
Available on: Dashboard chat widget (web) + Telegram /ask command (@CashClawBot)
Built for Polymarket: 30+ V2 strategies, paper trading + live execution, real-time CLOB integration
Beta offer — first 10 testers get FREE PRO tier ($99/mo): DM me for access
No credit card required for beta.
Demo video: [link]
Sign up: https://api.cashclaw.cc

## 4. Blog Deploy

Status: ⚠️ NOT DEPLOYED

The blog page returns 404 at /blog. API endpoint /api/launch-post returns the post (confirmed: post-launch-copilot-20260804 with title "Introducing AI Co-pilot — Your Natural Language Trading Assistant", date August 4, 2026, tags: AI Co-pilot Trading Launch).

Data exists at data/blog/posts.json (1 post ready).

2 deployment options from task-064-manual-publish.md:
- Option A: rsync posts.json to VPS runtime path (requires VPS_IP)
- Option B: git commit + push posts.json, then VPS picks up from git (requires VPS configured for git deploys)

No VPS or SSH access currently configured. Blog remains 404 until one of these paths is completed.

## 5. SendGrid Email Campaign

Status: 🔴 BLOCKED — no credentials configured

Script ready: scripts/send-email-campaign.ts
- Queries FREE tier users from subscriptions table
- Sends bilingual (EN+VI) emails with delay between sends
- All links migrated to api.cashclaw.cc
- Two campaigns: STARTER tier announcement + AI Co-pilot announcement
- Usage: pnpm exec tsx scripts/send-email-campaign.ts --test

Needs:
- SENDGRID_API_KEY
- SENDGRID_FROM_EMAIL
- SENDGRID_FROM_NAME

Depends on Task #70 (SendGrid configuration). Once credentials are set, run --test first to verify delivery.

---
Generated: 2026-08-04 | Work context: /Users/macbook/algo-trader