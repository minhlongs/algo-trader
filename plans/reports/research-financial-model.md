# Financial Model Research — AlgoTrade RaaS + Signals API

**Date:** 2026-07-06 | **Agent:** Financial/Revenue Engine | **Status:** Research Complete

---







## 1. Pricing Model Comparison for Signals API

**Table:** Revenue potential, complexity, customer fit across 5 models

| Model | Revenue Potential | Implementation Complexity | Customer Preference | Verdict |
|-------|-------------------|---------------------------|---------------------|---------|
| **Usage-based (metered)** | High at scale, unpredictable early | High (metering infra, billing reconciliation, usage audit) | Developers prefer — pay for what they use | ⚠️ Best for Phase 2+ after base installed |
| **Tier subscription** | Predictable MRR, easy forecast | Low (existing NOWPayments + IPN webhook already built) | Most SaaS buyers default to this | ✅ **RECOMMEND for launch** |
| **Pay-per-signal (microtx)** | High per-event but friction kills conversion | Very High (x402 protocol, wallet signing, micropayment UX) | Niche — Web3-native traders only | ⚠️ Good add-on, not primary |
| **Revenue share (% of profits)** | Aligned incentives but legal/accounting nightmare | Very High (trade tracking, P&L attribution, audit, disengagement risk) | Attractive to traders, scary to operators | 🚫 Pre-revenue killer — avoid at launch |
| **Hybrid (tier + overage)** | Best of both worlds | Medium (caps + metering on top of subscription) | Power users prefer flexibility | ✅ **Phase 2 upgrade path** |

**Recommendation:** Launch with flat tier subscription (model #2). Add usage metering as a soft cap/warning layer before overage billing in Phase 2. Revenue share and pure per-signal models require legal structuring and accounting overhead not justified pre-revenue.

---







## 2. Competitor Pricing Benchmarks

*Note: Live web search unavailable — benchmarks derived from public knowledge as of 2025-2026. Verify at launch via direct competitor research.*

| Competitor | Model | Price Point | API Access | Target Customer |
|------------|-------|-------------|------------|-----------------|
| **TradingView** | Screener + alerts | $14.95-59.95/mo | Limited REST; primarily UI | Retail traders |
| **TradingView Premium+** | Real-time data + indicators | $59.95/mo | No public signals API | Active retail |
| **CryptoQuant** | On-chain analytics API | Free tier → $49-199/mo | Full REST API; rate-limited | Quant traders, funds |
| **Glassnode** | On-chain metrics API | Free tier → $99-999+/mo | REST + WebSocket; high limits | Institutional |
| **Messari** | Crypto research API | $100-1,000/mo tiers | Full API; screener + signals | Professional analysts |
| **Custom signal groups (Telegram)** | Per-group subscription | $50-500/mo per group | None (manual copy-paste) | Retail/semi-pro |
| **Perplexity API** | LLM usage pricing | $20/1M tokens (Sonar) | REST; pay-per-token | Developers (reference) |
| **OpenRouter** | LLM aggregator | $0.5-5/1M tokens | REST; model-agnostic | AI developers (reference) |

**Market positioning gap:** No dominant "signals aggregator API" exists at $29-99/mo with multi-strategy + REST + WebSocket. This is AlgoTrade's whitespace.

---







## 3. Unit Economics Model for AlgoTrade

### Fixed Costs (Monthly)

| Cost Item | Estimate | Notes |
|-----------|----------|-------|
| Cloudflare Workers compute | $0 | CF free tier covers to ~10M requests/day |
| D1 Database | $0-5 | Free tier: 5GB + 25M reads/day |
| Domain + DNS | $10 | algo-trader.workers.dev or custom |
| NATS JetStream (self-hosted) | $0 | Runs on same Workers container |
| Redis (Upstash free tier) | $0-10 | 10K commands/day free |
| LLM API (OpenRouter/DeepSeek) | $5-30 | Hybrid: local RTX 4090 (amortized $50/mo) + Claude API for complex signals |
| NOWPayments | $0 | No platform fee; withdraw USDT TRC20 (~$1/tx) |
| **Total fixed cost** | **$15-100/mo** | Realistic: ~$50/mo at scale |

*Note: Local RTX 4090 capital cost amortized: $1,800 ÷ 36 months = $50/mo. Already sunk cost — marginal cost $0 at launch.*

### Variable Costs Per Customer (Per Month)

| Cost Driver | Per Customer | Notes |
|-------------|-------------|-------|
| API compute (Workers) | ~$0.05 | 5K req/month ÷ CF free tier = $0 with buffer |
| DB reads per signal subscriber | ~$0.10 | ~500 reads/mo at 25M free threshold |
| LLM inference per signal | ~$0.30 | Hot path: Nemotron-3 Nano local (free) + DeepSeek API fallback |
| WebSocket connection per tenant | ~$0.02 | State kept in memory, minimal DB writes |
| **Total variable cost** | **~$0.50/customer/mo** | |

### Margin Calculation

| Tier Price | Variable Cost | Gross Margin |
|-----------|---------------|--------------|
| $29/mo (Basic) | $0.50 | **98%** |
| $99/mo (Pro) | $0.50 | **99.5%** |
| $299/mo (Enterprise) | $0.50 | **99.8%** |

**Target: 85%+ margin. Actual: 97-99.5%. Exceptional unit economics.**

### Break-Even Analysis

| Metric | Value |
|--------|-------|
| Monthly fixed cost | $50 |
| Break-even customers at $29 | **2 customers** ($58 MRR) |
| Break-even customers at $99 | **1 customer** ($99 MRR) |
| Customers for $10K MRR at $29 | **345 customers** |
| Customers for $10K MRR at $99 | **102 customers** |
| Customers for $1M ARR at $99 | **842 customers** |
| Customers for $1M ARR at $299 | **279 customers** |

---







## 4. Pricing Tiers Recommendation

**Recommended tier structure for AlgoTrade RaaS + Signals API:**

| Tier | Price | Signals Included | Strategies | API Access | Bot Access | Target Customer | Expected Mix |
|------|-------|-----------------|------------|-----------|------------|-----------------|-------------|
| **Free** | $0 | 5/day, 15min delayed | 1 (educational) | None | None | Lead gen, trial users | 60% of base |
| **Basic** | $29/mo | 50/day, real-time | 3 core strategies | REST read-only (100 req/hr) | Paper trading only | Retail trader | 25% of paying |
| **Pro** | $99/mo | Unlimited, real-time + WebSocket | All 52 strategies | Full REST + Webhook (1K req/hr) | Live + paper | Semi-pro / quant | 12% of paying |
| **Enterprise** | $299/mo | Unlimited, all feeds + custom | Custom strategies + white-label | Unlimited + SLA guarantee | Dedicated infra | Prop firm / fund | 3% of paying |

**Notes:**
- Free tier converts at ~5-8% typical for developer tools; aim for 10% with on-chain track record proof
- Pro tier is the anchor — 52 strategies + full API is the "aha" value moment
- Enterprise seat minimum: 5 licenses ($1,495/mo floor) — avoids scaling to $299 forever
- Add "Overage rate: $0.01/signal beyond Basic cap" as Phase 2 metering

| Tier Comparison vs Competitors | AlgoTrade Free | AlgoTrade Pro ($99) | CryptoQuant ($49-199) | Glassnode ($99-999+) |
|--------------------------------|---|----|---|----|
| Signals per month | 5 | Unlimited | Limited | Unlimited |
| Strategy count | 1 | 52+ | N/A (only on-chain) | N/A |
| REST API | No | Yes | Yes | Yes |
| Live bot execution | No | Yes | No | No |
| Prediction market coverage | No | Yes (Polymarket, Kalshi) | No | No |

**Key differentiator priced at $99:** Real bot execution + Polymarket signals — no competitor offers both.

---







## 5. Revenue Projections (Conservative)

*Assumptions:*
- Conversion: 5% free → paid
- Freemium pyramid: 10K free users by Month 6 (conservative Organic + SEO)
- Churn: 5% monthly (typical for SaaS)
- No enterprise deals in Months 1-3 (land and expand)
- No marketplace commission until Month 7 (Phase 2)

**Month-by-Month Conservative Projection:**

| Period | Free Users | Paying Customers | MRR (@avg $79) | Cumulative Revenue |
|--------|-----------|-----------------|----------------|-------------------|
| **M1** (Jul 2026) | 500 | 10 | $790 | $790 |
| **M2** (Aug 2026) | 1,000 | 20 | $1,580 | $2,370 |
| **M3** (Sep 2026) | 1,500 | 30 | $2,370 | $4,740 |
| **M4** (Oct 2026) | 2,500 | 50 | $3,950 | $8,690 |
| **M5** (Nov 2026) | 4,000 | 75 | $5,925 | $14,615 |
| **M6** (Dec 2026) | 6,000 | 110 | $8,690 | $23,305 |
| **M7** (Jan 2027) | 8,000 | 150 | $11,850 | $35,155 |
| **M8** (Feb 2027) | 10,000 | 200 | $15,800 | $50,955 |
| **M9** (Mar 2027) | 12,000 | 260 | $20,540 | $71,495 |
| **M10** (Apr 2027) | 15,000 | 330 | $26,070 | $97,565 |
| **M11** (May 2027) | 18,000 | 410 | $32,390 | $129,955 |
| **M12** (Jun 2027) | 20,000 | 500 | $39,500 | $169,455 |

| Summary Metrics | Value |
|-----------------|-------|
| **End of Year ARR** | **$474,000** |
| **MRR at Month 12** | **$39,500** |
| **Total paying customers (cumulative)** | 500 active |
| **Enterprise accounts (M7+)** | 3-5 @ $1,500 avg = $4,500/mo |
| **Platform commission (M7+, 20% signal provider take)** | $2,000-5,000/mo |

**Note:** This model assumes:
1. Signals API is live by M1 (July 2026) — no bot subscription revenue in Months 1-3
2. Organic growth via SEO + content (30 blog posts/mo staged)
3. No paid acquisition spend until MRR > $10K (bootstrap constraint)
4. First enterprise deal closes Month 7-8 (prop firm cold outreach)

---







## 6. Revenue Sensitivity Analysis

| Scenario | M6 MRR | M12 ARR | Assumptions |
|----------|--------|---------|-------------|
| **Pessimistic** | $3,000 | $120K | Slow SEO, 2% conversion, churn 8% |
| **Conservative** (base plan) | $8,700 | $474K | 5% conversion, 5% churn |
| **Optimistic** | $15,000 | $900K | 8% conversion, 3% churn, 2 enterprise |

**What drives the optimistic scenario:**
- Telegram/Discord community pulls in 5K signal group members → 3% convert = 150 new paying in M4-M6
- First API integration published (GitHub/RapidAPI) → viral developer adoption
- One prop firm deal at $3K/mo in M5

**Critical dependency:** Signals API must ship on time (currently M1 target). Every month of delay costs ~$3-5K in MRR trajectory.

---







## 7. Pricing Model Recommendation Queue

| Priority | Action | Timeline | Expected Impact |
|----------|--------|----------|----------------|
| **1** | Launch at $29/$99/$299 tiers with NOWPayments | M1 (Jul 2026) | Foundation revenue |
| **2** | Add Free tier (5 signals/day delayed) | M1 launch feature | Lead gen funnel |
| **3** | Implement soft usage cap warning at Basic tier | M2-M3 | Reduces support friction |
| **4** | Evaluate x402 micropay for signal-per-call | M4-M6 | Only if dev UX is blocking |
| **5** | Revenue share program for strategy providers | M7+ (Phase 2) | Network effects |
| **6** | Enterprise white-label pricing ($499-1,999) | M4 outreach | High-margin accounts |

---







## 8. Unresolved Questions

1. **NOWPayments volume limits:** Does the existing $49 PRO tier documentation conflict with $99 recommendation? Need to update `docs/api-subscription.md` and migration script.
2. **LLM cost validation:** RTX 4090 nominal capacity for 500 concurrent signal subscribers needs load testing — if inference queue saturates, Cloud API cost could spike from $30 → $200+/mo.
3. **Legal structure for revenue share:** Before implementing profit-sharing with signal providers, need securities counsel opinion on "signal data" vs "investment advice" boundary (flagged in PDR as pre-revenue blocker).
4. **Free tier convert rate baseline:** No historical data. A/B test free → Basic at $29 vs $49 to determine price elasticity.
5. **CF Workers compute ceiling:** Free tier (10M requests/day) may not cover 20K users × 500 signals/day = 10M requests. Need Upgrades plan or request limit strategy.

---

*Sources: Internal docs (docs/api-subscription.md, docs/cost-analysis-2026-api-vs-self-hosted.md, docs/project-overview-pdr.md), plans/260705-0025-signals-api-ideation/plan.md, public pricing references (TradingView, CryptoQuant, Glassnode, Messari knowledge base).*
