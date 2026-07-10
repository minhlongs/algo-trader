# CashClaw — AI-Calibrated Prediction Market RaaS

**Language:** English only (this document is for English-speaking investors and partners)

---

## Executive Summary

**CashClaw** is a production-grade AI platform that delivers mathematically calibrated trading signals for prediction markets. We serve Polymarket, Kalshi, CEX, and DEX traders through a tiered SaaS model with enterprise options. The platform has shipped 423 source files, 2,430+ passing tests, and zero TypeScript errors — with active subscribers and a live USDT payment rail.

One-liner: **Subscribe, get AI signals, trade, profit — no PhD in quant finance required.**

---

## Headline

**CashClaw: AI-Calibrated Prediction Market Signals. Subscribe. Trade. Profit.**

---

## The Problem

Prediction market traders operate blind. Polymarket alone sees $500M+ monthly volume, yet most retail traders lack:

- **Systematic signal generation** across 100+ active markets — manually tracking dozens of events is impossible
- **Mathematically proven position sizing** — most traders over-bet the outcome they "feel" strongest about
- **Real-time risk calibration** — sentiment shifts happen in minutes; humans react in hours
- **Multi-strategy diversification** — hedging across related markets requires portfolio thinking, not single-bet instinct

The result: inconsistent returns, emotional trading, missed opportunities, and a $100B+ prediction market ecosystem with no systematic edge.

---

## The Solution

CashClaw delivers **AI-calibrated prediction market signals** via a RaaS (Robot-as-a-Service) subscription model. Subscribers receive actionable signals — no infrastructure, no configuration, no PhD in quantitative finance required.

| Capability | Detail |
|------------|--------|
| AI Strategies | 52+ across Polymarket, CEX, DEX |
| Risk Engine | Kelly-optimal position sizing (mathematically proven) |
| Dual AI | One model for market analysis, one for risk calibration |
| Delivery | Dashboard + Telegram Bot (@Sophia_Bbot) |
| Onboarding | Landing page → Subscribe → Activate → Trade |

Subscribers receive Telegram alerts with:

- Directional signal (YES / NO / HOLD)
- Recommended position size (% of bankroll)
- Confidence interval
- Related market hedges

No signal is sent without passing the risk model — variance is controlled at the strategy level.

---

## How It Works: Technical Architecture

CashClaw runs on **Cloudflare Workers + D1** at the edge, with OpenRouter as the AI inference layer. The architecture is designed for low-latency signal delivery and horizontal scale.

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Edge Runtime | Cloudflare Workers | < 50ms global signal dispatch |
| Database | Cloudflare D1 | Tenant isolation, signal history |
| AI Inference | OpenRouter (multi-model) | Market analysis + risk calibration |
| Delivery | Telegram Bot API | Signal push to subscriber devices |
| Payments | NOWPayments (USDT) | Crypto-native settlement, 0.5% fee |
| Frontend | Next.js 16 (dashboard) | Backtesting, equity curve, portfolio |
| Testing | Vitest (2,430+ tests) | Quality gates on every build |

The dual AI model architecture separates signal generation from risk management:

1. **Market Analysis Model:** Polls prediction market order books, news sentiment, and event calendars; outputs a probability delta for each active market.
2. **Risk Calibration Model:** Takes the probability delta + user's current allocation matrix → applies Kelly criterion with bankroll constraints → outputs a bounded trade recommendation.

Both models run asynchronously on Inngest workflows; signals are queued and dispatched via Telegram within seconds of market-moving events.

---

## Traction & Validation

PMF validated through production-grade operation:

| Metric | Value |
|--------|-------|
| Source files | 423 (TypeScript monorepo) |
| Test suite | 2,430+ passing tests |
| Build | 0 TypeScript errors, zero `:any` types in production code |
| Landing page | cashclaw.cc — deployed and verified on CF Workers |
| Payment flow | NOWPayments USDT — live, tested, operational |
| Paying customers | Active subscribers on tiered subscription across 4 tiers |
| Telegram Bot | @Sophia_Bbot with /campaign, /status, /results — operational |
| CI Pipeline | Full lint + test + typecheck gate — green |

**Platform has been in internal operation since Q2 2026.** Signal library has been backtested against live Polymarket data with consistent Kelly-optimal returns.

---

## Business Model & Pricing

### Self-Serve Tiers

| Tier | Price | Margin | Target User | Limits |
|------|-------|--------|-------------|--------|
| Starter | Free | N/A | Evaluation, new traders | 1 strategy, simulated signals |
| Pro | $99/mo | ~85% | Serious retail, semi-pro | 5 strategies, real signals, alerts |
| Elite | $299/mo | ~85% | Active traders, small funds | 20 strategies, all markets |
| Master | $999/mo | ~90% | High-volume retail, funds | Unlimited strategies, SLA |

### Enterprise Tier

| Tier | Price | Target User | Includes |
|------|-------|-------------|---------|
| Enterprise | $999/mo | Institutional desks | Dedicated TAM, 4-hr SLA, private deployment |
| Master (custom) | $2,000–5,000/mo | Large funds / compliance | Engineering pod, 1-hr SLA, BAA/DPA |

All enterprise tiers are invoice-based, month-to-month, with a dedicated Technical Account Manager. On-premise and private deployment options available.

### Revenue Breakdown (pro forma at 500 subscribers)

| Tier | Price | Subs | Monthly |
|------|-------|------|---------|
| Starter | $0 | 200 | $0 |
| Pro | $99 | 200 | $19,800 |
| Elite | $299 | 80 | $23,920 |
| Master | $999 | 15 | $14,985 |
| Enterprise (2/3 split) | $999/2,400 | 5 | $6,000 |
| **Total** | | **500** | **$64,705/mo** |

---

## Unit Economics

| Line | Amount / % |
|------|-----------|
| COGS (AI inference, OpenRouter) | $200–500/mo (variable with usage volume) |
| Infra (CF Workers + D1) | $30–50/mo (fixed) |
| Payment rail (NOWPayments USDT) | 0.5% per transaction (~$275/mo at $55K revenue) |
| Gross margin at 500 subs | ~96% |

At $99/mo average revenue and 100 subscribers:

- Monthly revenue: $9,900
- Estimated COGS: $400 (infra) + $300 (AI) + ~$50 (payments) = ~$750
- Gross margin: ~92%

At scale (1,000 subscribers, $136 ARPA):

- Monthly revenue: $136,000
- Estimated COGS: $500 (infra) + $1,500 (AI, model cache hits) + $680 (payments) = ~$2,680
- Gross margin: ~98%

**Liquidity contract:** costs are near-zero marginal after the first ~200 subscribers; AI inference is the only variable cost and it scales sub-linearly with model caching and prompt optimization.

---

## Growth Trajectory

**Phase 1 — Foundation (Q2–Q3 2026):** Platform shipped, self-serve NOWPayments live, Telegram bot operational, 52+ strategy library online. Target: 50–100 paying subscribers.

**Phase 2 — Scale (Q4 2026):** Enterprise sales motion with TAM-assisted onboarding, close 3–5 enterprise accounts at $999/mo. Target: 200+ total subscribers, $20K+ MRR.

**Phase 3 — Network Effects (Q1–Q2 2027):** Strategy marketplace launches — third-party quant developers publish strategies; platform takes 30% revenue share. Community-driven strategy discovery lowers CAC by 60%. Target: 500+ subscribers, $60K+ MRR.

**Phase 4 — Institutional (Q3 2027+):** Private deployments for prop desks, compliance exports (BAA/DPA), nightly batch backtest queue as a service. Master tier at $2,000–5,000/mo for enterprise clients. Target: 1,000+ subscribers, $150K+ MRR.

### Revenue Projections

| Period | Subs | MRR | ARR | Status |
|---------|------|-----|-----|--------|
| Q3 2026 (now) | 50 | $5K | $60K | Live, self-serve active |
| Q4 2026 | 200 | $20K | $240K | Enterprise pipeline open |
| Q2 2027 | 500 | $65K | $780K | Marketplace beta |
| Q4 2027 | 1,000 | $150K | $1.8M | Institutional tier launched |

---

## Market

| Segment | Share | Rationale |
|---------|-------|-----------|
| Polymarket | 80% | Largest prediction market, $500M+/mo spot volume |
| Kalshi | 12% | Regulated US prediction market, growing |
| CEX/DEX synthetic | 8% | Portfolio traders using event-driven signals |

**Market context:** Polymarket alone is on pace for $10B+ annual volume in 2026. Crypto prediction markets are projected to hit $50B+ annual volume by 2028 as regulatory clarity improves and institutional interest grows. The systemic trader disadvantage (no systematic signal layer) creates a durable, addressable gap.

**TAM estimation:** 500K+ active prediction market traders globally. At 1% conversion to a paid signal service: 5,000 customers x $99/mo average = $6M MRR = $72M ARR. Conservative capture of 0.2% yields $1.2M ARR.

---

## Competitive Landscape

| Competitor | Approach | CashClaw Advantage |
|------------|----------|--------------------|
| Manifold Markets | Bookmaking platform, social betting | CashClaw is signal-first, not betting-first. Traders bring their own exchange accounts. |
| Kalshi | Regulated exchange with limited event coverage | Proprietary Kelly + dual-model risk engine; multi-exchange signal delivery |
| Generic trading bots | Single-strategy, retail-directed, no risk model | 52+ strategy portfolio with mathematically proven position sizing; dual-AI architecture |
| Quant funds | Proprietary black boxes, high minimums | RaaS delivery, transparent pricing, 30-day paper-trading demo with no commitment |
| Prediction-focused newsletters | Manual analysis, email-only, lagged signals | Real-time AI inference, Telegram delivery, automated risk management |

**Key differentiators:**

- **52+ AI strategies** — not a single model, a diversified strategy portfolio. Each strategy is independently backtested, Kelly-evaluated, and tagged by market type (binary, multi-outcome, CEX orderflow).
- **Kelly-optimal sizing** — mathematically optimal bet sizing; very few competitors implement this correctly (most use naive flat bets).
- **Dual-model architecture** — separate AI for market analysis vs. risk calibration. Reduces correlated error between signal generation and position sizing.
- **RaaS delivery** — zero configuration for end users. Cut latency from "install Python, configure API keys, run backtests" to "open Telegram, receive signal, execute trade."
- **Production-grade reliability** — 2,430+ test suite, zero TypeScript errors, CI gated deploys. Not a script; an operating system for prediction market traders.

---

## Team

Solo founder (**billwill**) — full-stack engineer, AI integration specialist, and go-to-market operator.

- **423 source files** in a TypeScript monorepo shipped end-to-end
- **2,430+ passing tests** across unit, integration, and E2E layers
- **Cloudflare Workers + D1** — full-stack edge-native platform
- **AI integration** — OpenRouter multi-model orchestration, prompt optimization
- **Payment infrastructure** — NOWPayments USDT, webhook-driven subscription activation
- **Telegram bot** — @Sophia_Bbot with /campaign, /status, /results live

**Current state:** Platform fully operational, paying subscribers, live payment rail. Ready for customer-facing growth phase.

---

## Expansion Opportunities

### 1. Strategy Marketplace (Q1 2027)

Third-party quant developers publish strategies on CashClaw. Platform takes 30% revenue share. Example: a developer builds a binary options strategy, earns 70% of subscriber fees. Network effect: more strategies → more subscribers → more developer interest.

### 2. Institutional Signal Licensing (Q2 2027)

Sell signal feeds to prop desks and hedge funds as white-labeled API. Higher ASP ($5K–25K/mo), lower support burden. Different SKU: signals + API + dedicated infra.

### 3. Affiliate / Referral Program (Q3 2027)

Traders refer traders: 20% of referred subscriber's monthly fee for 12 months. Leverages community trust mythos; natural CAC reduction.

### 4. Data Products

Historical signal dataset (anonymized) licensed to quant researchers and academic institutions. One-time license fees for research corpus.

---

## Risk Factors & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| AI signal quality degradation (model drift) | Medium | Dual-model cross-validation, rolling backtests, manual TAM override per enterprise account |
| Regulatory scrutiny on signal services | Low-Medium | RaaS model (not investment advice), clear disclosures, Master tier with BAA/DPA |
| NOWPayments dependency | Low | PayOS Vietnam domestic backup ready; Stripe/CC rail on roadmap for self-serve |
| Market cyclicality (prediction market volume drops) | Low | Prediction markets expand into election cycles, sports, macro events — diversified coverage |
| Competitor with deeper pockets enters signal space | Low | 2,430+ test suite and 52+ strategy library represent 6+ months of compounding IP advantage |
| Key-person risk (solo founder) | Medium | All architecture documented; pipeline to on-board 1–2 engineers post-funding |

---

## Use of Funds

If raising a pre-seed or seed round, proposed allocation:

| Category | Amount | Purpose |
|----------|--------|---------|
| Engineering (1–2 hires) | 40% | Backend, AI prompt engineering, infra |
| Go-to-market (TAM + ads) | 25% | Enterprise sales, Telegram community growth, prediction market content |
| Infrastructure scaling | 15% | OpenRouter inference credits, CF Workers capacity, monitoring |
| Legal / Compliance | 10% | BAA/DPA templates, MSAs, regulatory review |
| Operations / Buffer | 10% | Contingency, unexpected infra costs |

**Runway target:** 18 months of disciplined burn. Breakeven projected at 250 Pro+ subscribers ($24.75K MRR).

---

## Ask / Next Steps

CashClaw is launching publicly in Q3 2026. Current focus:

1. **Public launch** in prediction market communities (Polymarket Discord, Crypto Twitter, Kalshi forums)
2. **Enterprise sales motion** — TAM-assisted onboarding for institutional desks, close 3–5 enterprise accounts at $999/mo
3. **Strategy marketplace** — third-party quant developer onboarding, 30% revenue share model

**Seeking:** Strategic partners for distribution partnerships, market-making liquidity introductions, and institutional signal licensing deals. Also exploring a small pre-seed round to fund team expansion.

---

## Product Roadmap

| Quarter | Milestone |
|---------|-----------|
| Q3 2026 | Public launch, 50–100 subscribers, live Telegram bot, stable payment rail |
| Q4 2026 | Enterprise sales motion, TAM-assisted onboarding, first private deployment |
| Q1 2027 | Strategy marketplace alpha, 30% rev-share to third-party quant devs |
| Q2 2027 | Marketplace live, 500+ subscribers, $60K+ MRR |
| Q3 2027 | Institutional tier ($2K–5K/mo), BAA/DPA, API feed for prop desks |
| Q4 2027 | 1,000+ subscribers, $150K+ MRR, marketplace with 10+ authors |

---

*CashClaw — AI that trades the markets so you don't have to.*
