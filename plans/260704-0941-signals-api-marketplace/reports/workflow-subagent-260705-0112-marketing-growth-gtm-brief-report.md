# Marketing + Growth GTM Brief: AlgoTrade Signals API Marketplace

**Date:** 2026-07-03 | **Author:** workflow-subagent

---

## [Business] Layer

### Core GTM Channels (Priority Ranked)

| Rank | Channel | Rationale | Est. Monthly Cost | First Customer Timeline |
|------|---------|-----------|-------------------|------------------------|
| **1** | Polymarket Discord + Telegram Communities | Signal accuracy edge (67% market avg) + maker-optimized regime creates immediate value prop for active bettors | $0 (organic) | 2-4 weeks |
| **2** | Twitter/X @AlgoTrade (automated signal posting) | Auto-generated trade signals = live social proof; 30 posts/mo already pipeline-ready | $0 (infra built) | 4-6 weeks |
| **3** | Crypto Twitter (CT) Influencer Affiliates | Performance-based rev share (20-25% of first 3 months) on referral sales | $0 upfront / ~25% rev share | 6-8 weeks |
| **4** | SEO Content Hub (Prediction Market Analysis) | Long-tail query capture: "best polymarket signal API", "prediction market trading bot" | $0 (LLM-generated content, 30 posts/mo) | 8-12 weeks |
| **5** | Telegram Bot Distribution (@Sophia_Bbot pattern) | /signals command delivers daily picks; /subscribe triggers NOWPayments checkout | $0 (bot built) | Immediate |
| **6** | Product Hunt + BetaList Launch | One-shot traffic spike for Signal API tier; target "AI Trading" category | $0 | Week 1 burst |
| **7** | Polymarket Bounties / Ambassador Program | Community members who recruit 3+ paying subscribers get 1 free month | $0 (discount-based) | Ongoing |

### Growth Experiments (Hypothesis-Driven)

| Experiment | Hypothesis | Metric | Success Threshold | Duration |
|------------|-----------|--------|-------------------|----------|
| **A: Free tier signal preview** | Giving 5 free signals/week converts 5% to paid | Conversion rate (free -> Starter tier) | >3% | 30 days |
| **B: Referral program** | Crypto traders are community-driven; referral signups convert at 2x paid CAC | Referral signups / total signups | >15% of new paid | 60 days |
| **C: Polymarket-specific maker rebate signals** | Traders will pay for strategies optimized for the new fee regime (post-Feb 2026) | Starter signups | >20 signups | 45 days |
| **D: Weekly "Signal Accuracy Leaderboard"** | Public transparency drives trust and reduces sales cycle | Trial-to-paid conversion | >10% improvement | 30 days |
| **E: Email drip (SendGrid)** | 5-email sequence: signal sample -> case study -> pricing -> social proof -> urgency | Open rate / CTA click | >25% open, >3% click | 14-day sequence |

### Pricing & Packaging (for GTM)

| Signal Tier | Price/mo | GTM Angle |
|-------------|----------|-----------|
| Signals Basic | $29 | "Individual bettor -- 10 signals/day, Polymarket + Kalshi" |
| Signals Pro | $99 | "Active trader -- 50 signals/day, all prediction markets + regime data" |
| Signals Enterprise | $299 | "Fund API -- unlimited, webhook delivery, multi-account" |

**Launch promo:** First 50 subscribers get locked-in Starter ($19) pricing for life. Scarcity + CTA.

### Budget Allocation (First 90 Days)

- **$0** -- All current channels are organic/auto-generated (infra already built)
- **$500-1,000** -- Optional: Polymarket Discord ads, Twitter premium
- **Opportunity cost** -- Founder time split between product (phases 33-37) vs. community engagement

**Key insight:** AlgoTrade's distribution infra is already built (Telegram bot, Twitter auto-poster, blog content pipeline, NOWPayments billing). GTM cost is effectively zero marginal -- the unlock is community activation, not infrastructure.

---

## [Agentic] Layer

### MekongMind Agent Orchestration for GTM

| Agent Role | GTM Responsibility | Automation |
|------------|-------------------|------------|
| **CEO Agent** | Approves pricing/experiment decisions, reviews weekly KPI dashboard | Weekly synthesis report |
| **CMO Agent** | Owns channel mix, experiment design, conversion funnel optimization, copywriting | Daily: signal post generation (DeepSeek R1) + blog content (30/mo) + Twitter posting |
| **Revenue Agent** | Tracks signups, MRR, churn, referral conversions, revenue per channel | Real-time: NOWPayments webhook -> MRR dashboard |
| **Product Agent** | Adjusts free tier signal quality based on conversion data; routes feature requests | Weekly: retention/engagement report |
| **Operations Agent** | Manages Telegram bot health, billing webhook uptime, alerting | Monitored via existing Prometheus/Grafana/Sentry stack |

### Automated Marketing Pipeline (Already Built)

1. **DeepSeek R1** generates prediction market analysis + trade signal copy (30 posts/month)
2. **Twitter/X API v2** auto-posts signal content with link to signup landing page
3. **Telegram bot** distributes daily picks, handles /subscribe -> NOWPayments
4. **SendGrid email drip** triggers on free-tier trial signup (5-email sequence)
5. **SEOHub** publishes blog posts to capture long-tail keyword traffic

### What Needs to Be Built

| Item | Effort | Priority |
|------|--------|----------|
| Referral tracking (affiliate link generation + cookie) | Medium | High (Experiment B) |
| Signal accuracy public leaderboard page | Small | High (Experiment D) |
| Product Hunt launch kit (screenshots, description, demo) | Small | Medium (Week 1 burst) |
| Free tier -> paid conversion email automation | Medium | High (Experiment A) |
| Channel-level attribution tracking | Medium | Medium (for ROI data) |

---

## [Governance] Layer

### Quality Gates for GTM Content

| Gate | Standard | Enforcement |
|------|----------|-------------|
| Signal accuracy reporting | Published accuracy must match internal tracking within 2% | Weekly revenue agent audit |
| Marketing copy truth-in-advertising | No unsubstantiated ROI claims; "past performance not indicative" disclaimer | Pre-launch review + template |
| Pricing consistency | Promo pricing must not conflict with existing tier config in DB | Revenue agent validates against TIER_CONFIGS |
| Experiment isolation | Only one variable changed per experiment; control group maintained | CMO agent logs experiment design before launch |

### Experiment Protocol

```
Phase 1: Design (CMO Agent) -- hypothesis, duration, metric, success threshold
Phase 2: Approve (CEO Agent)   -- must pass: no brand risk, no billing conflict, measurable
Phase 3: Launch (Ops Agent)    -- deploy feature flag or marketing automation
Phase 4: Measure (Revenue Agent) -- daily KPI dashboard, end-of-experiment report
Phase 5: Decide (CEO + CMO)    -- scale, iterate, or kill; documented decision
```

### Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Signal quality drop triggers churn before 30-day lock-in | Low | High | Start with best-performing strategies only; freeze strategy set during first 60 days |
| Crypto market downturn reduces prediction market volume | Medium | Medium | Signal API works across Polymarket + Kalshi + TradFi; diversification built in |
| Competitor launches prediction-market-specific API | Medium | Medium | AlgoTrade's differentiators (52 strategies, regime detection, local LLM inference) are hard to replicate quickly |
| Free tier cannibalizes paid tier | Low | Medium | Free tier limited to 5 low-frequency signals/week; paid gets real-time, multi-market, regime data |
| Community spam in Telegram/Discord hurts brand | Low | Low | Moderation via Telegram bot admin commands; existing infra from Sophia_Bbot pattern |

### KPIs & Tracking (First 90 Days)

| KPI | Target (Day 90) | Owner |
|-----|-----------------|-------|
| Paying subscribers | 50 (Starter + signals tiers combined) | Revenue Agent |
| MRR | $2,000-3,500 (mix of plans) | Revenue Agent |
| Free trial signups | 500+ | CMO Agent |
| Free -> paid conversion | >5% | CMO Agent |
| Signal accuracy published (monthly) | >65% win rate across all signals | Product Agent |
| Waitlist signups (pre-PH launch) | 200+ | CMO Agent |
| Twitter followers | +500 organic | CMO Agent |
| Telegram channel members | +300 | CMO Agent |

### Unresolved Questions

1. **First customer activation** -- Who specifically has the highest conversion probability: Polymarket power bettors, Kalshi-regulated traders, or Twitter/X algorithmic traders? Each requires slightly different positioning.
2. **Referral economics** -- Is 20-25% lifetime rev share sustainable, or should it be first-3-months only to keep LTV/CAC healthy at $29-99 price points?
3. **Product Hunt category** -- "AI Trading" or "Prediction Markets" for PH launch? The former has more traffic, the latter is more targeted.
4. **Free tier signal quality vs. paid tier** -- How much signal degradation between free and Starter? Too little = no conversion; too much = no trust building.
5. **Content differentiation** -- With 30 auto-generated blog posts/month, how much editorial review is needed before publishing to avoid Google algorithm penalties?
