# Sales Pipeline + Pricing 1-Pager: AlgoTrade Signals API Marketplace

**Date:** 2026-07-05
**Context:** BizPlan analysis for AlgoTrade -- pre-revenue, scale-up, $0 to $1M ARR target
**Based on:** Company profile, market intelligence report, BMC, PRD

---

## [Business] Sales Pipeline

### Current State: Pre-Revenue, Pre-Pipeline

- $0 revenue, first paying customer pending
- Billing infrastructure (NOWPayments, tier system) is fully built and tested
- Distribution pipeline auto-generates ~30 blog posts + ~30 social posts/month via LLM (SEO/social content ready, but no demand capture yet)
- @Sophia_Bbot Telegram bot has existing audience (3K+ users) -- no signal marketplace commands deployed yet

### Recommended Sales Pipeline: 4 Stages

| Stage | Definition | Trigger | Conversion Target |
|-------|------------|---------|-------------------|
| **1. Top-of-Funnel (Awareness)** | Developer lands on docs, reads OpenAPI spec, or discovers via MCP registry / Telegram / SEO | Subdomain visit, docs page view Telegram `/signals discover` | Page view -> signup >8% |
| **2. Free Activation** | Signs up (FREE tier), generates API key, makes first successful `GET /feed` call | Time-to-first-signal <2 min. 1K calls/mo, 1 provider, 2 signals/min | Signup -> API call >70% |
| **3. Paid Conversion** | Upgrades to PRO ($99/mo) after hitting free tier limits or seeing value | Usage alert at 80% cap. Dashboard shows delivered value signal. | Free -> PRO >8% (within 14 days) |
| **4. Expansion** | Upgrades to Enterprise ($299/mo) or adds x402 / fusion engine add-ons | Provider count, call volume, latency needs exceed PRO tier | PRO -> Enterprise >15% |

### Pipeline Mechanics by Tier

| Activity | Target Segment | Channel | Estimated Volume (Month 6) |
|----------|---------------|---------|---------------------------|
| Self-serve signups | Retail algo traders, bot devs | Developer portal, MCP registry, Telegram | 50+ signups/week |
| Community acquisition | Dev trading Discord/Telegram groups | Founder posts, affiliate revshare | 20-30 leads/week |
| Provider recruitment | Signal analysts, quant shops | Direct outreach, trading community cross-reference | 10-20 outreach/month |
| Enterprise outbound | Small funds (sub-$50M AUM) | Founder-led, inbound after PR traction | 2-5 contacts/month |

### Pipeline Metrics & Targets

| KPI | Target (Month 6) | Why |
|-----|------------------|-----|
| Signups/week | >50 | Validates TOP funnel is healthy |
| Free -> PRO conversion | >8% (14 days) | Price/WTP validation. Industry API benchmark: 5-15%. |
| Time-to-first-signal | <2 min | Onboarding friction gauge. >5 min = broken flow. |
| Monthly paid churn | <8% | SaaS healthy range <10%. >15% = PM mismatch. |
| Active providers | >5 by M6, >15 by M12 | Supply-side health. Seed with internal signals. |
| MRR target (Month 12) | $15K | Blended ARPU $75-100/mo across 150-200 paid users |
| Paying subscribers (M12) | 150-200 | At $29/$99/$299 + add-ons + x402 |

### Sales Process Flow (Self-Serve Dominant)

```
Doc → Sign up (FREE, no CC) → API key (3 clicks) → curl /feed (2 min) → 
BROWSE providers → HIT rate limit → UPGRADE prompt → 
NOWPayments checkout (crypto) → PRO activated → Webhook delivery → 
USAGE grows → Enterprise upsell or Add-ons
```

Zero-touch sales: No human interaction needed from discovery to paid conversion. Founder only intervenes for Enterprise ($499-1,999/mo) deals.

### Distribution Channels (Priority)

1. **Developer portal + MCP registry** (free, P0) -- Self-serve signups, agent discoverability
2. **Telegram bot @Sophia_Bbot** (free, P0) -- `/signals discover/subscribe/status` on existing audience
3. **Trading community Discord/Telegram** ($0-5 CAC, P1) -- Founder posts + affiliate revshare (10-15%)
4. **SEO blog content** ($200-500/mo, P2) -- Automated DeepSeek R1 content, comparison guides
5. **Affiliate/partner program** (revshare, P2) -- Provider referral fees
6. **Paid ads** ($5-20/CAC, P3) -- Reddit, X, Hacker News, only after PMF validation

---

## [Agentic] AI-Native Pipeline

### Agent Self-Onboarding (Zero-Touch)

| Step | Action | Mechanism |
|------|--------|-----------|
| 1. Discovery | Agent queries MCP registry | `/mcp describe` returns signal catalog |
| 2. Select | Agent reads schema, rate limits, pricing | Structured decision (not human browsing) |
| 3. Subscribe | Agent calls `/subscribe` with API key | Programmatic, no UI |
| 4. Consume | Agent polls `/feed` or registers webhook | Fully autonomous |

### Agent Referral Loop (Viral)

Satisfied agent discovers marketplace peer agent via tool-use ecosystem and recommends through MCP introspection. No human overhead. This is the only self-reinforcing growth loop available without manual marketing spend.

### Sales Channels for AI Agents

| Channel | Mechanism | Cost |
|---------|-----------|------|
| MCP registry listing | Auto-discoverable by any MCP client | Free |
| x402 pay-per-signal | HTTP 402 + USDC on Base. Agent pays per call, no subscription. | $0.01-0.05/call |
| Agent subscription pool | $99/10K calls shared across multi-agent operations at same firm | Per-quota |
| LLM function-calling catalogs | Partner with model providers to list signal feeds as pre-built tools | Partnership-based |

---

## [Governance] Sales Governance & Pricing Rules

### Pricing Tier Structure

Resolved from codebase audit ($49 vs $99 inconsistency fixed):

| Tier | Price | Signal Providers | Rate Limit | Delivery | Support | Target Buyer |
|------|-------|------------------|------------|----------|---------|--------------|
| **FREE** | $0 | 1 (preview) | 2/min, 1K/mo | REST only | Community | Evaluation, bot hobbyists |
| **PRO** | $99/mo | 5 | 30/min, 10K/mo | REST + Webhook | Email <4h | Retail algo traders |
| **ENTERPRISE** | $299/mo | 20 | 120/min, 100K/mo | REST + Webhook + SSE | Priority <1h | Small funds, power users |
| **MASTER** | Custom | Unlimited | Unlimited | All | Dedicated | Large funds ($200M+) |

### Add-On Pricing

| Add-On | Price | Notes |
|--------|-------|-------|
| x402 pay-per-signal | $0.01-0.05/call | No subscription. USDC on Base. For AI agents. |
| Fusion engine premium | $49/mo add-on | ML-weighted signal fusion, self-learning weights |
| Historical data bundle | $10-50/dataset | One-time purchase |
| Private MCP server | $99/mo | Dedicated server, no rate limits |
| Provider verification badge | $9.99/mo | Audited track record badge (provider-side) |

### Enterprise Pricing (Custom)

| Tier | Price | Typical User | SLA |
|------|-------|--------------|-----|
| Basic | $499/mo | Sub-$50M AUM fund, 3 seats | <4h response |
| Pro | $999/mo | $50-200M fund, 10 seats | <1h response |
| Premium | $1,999/mo | $200M+ fund, unlimited, white-label | <30min response, dedicated |

### Platform Commission (Supply Side)

| Category | Rate | Condition |
|----------|------|-----------|
| Standard provider | 15% of earnings | Default for all providers |
| Launch partner | 10% | First 10 providers (founding badge) |
| Enterprise referral | 10% | Provider brings own enterprise buyer |

### Sales Rules & Safeguards

| Rule | Rationale | Enforcement |
|------|-----------|-------------|
| **FREE tier has no credit card** | Remove signup friction. Direct buyers to value. | Stripe/NOWPayments gate only on PRO+ |
| **No annual prepay for MVP** | NOWPayments billing complexity. Defer to Phase 4. | Monthly-only billing at launch |
| **Tier upgrade prorated, downgrade end-of-cycle** | Standard SaaS fairness. Prevents gaming. | Billing system logic |
| **Cancel anytime, access through billing period** | Right to exit. Prevents chargeback disputes. | Subscription system |
| **No US retail until securities review** | TOS "signals are data, not advice" firewall + jurisdiction gating at signup | Gate: jurisdiction selector |
| **Usage alerts at 80%/100%** | Prevent surprise overage. Preemptive churn reduction. | Email + Telegram bot |

### Key Pricing Principles

1. **FREE exists for acquisition, not revenue.** Must demonstrate value within 3 API calls. Rate limits prevent abuse, not use.
2. **PRO ($99/mo) is the default paid tier.** Anchored to competitive signal APIs ($50-200/mo). At $49, unit economics become marginal after NOWPayments fees (0.5%) + platform commission (15%).
3. **ENTERPRISE ($299/mo) exists for power users.** Price anchoring makes PRO look affordable.
4. **x402 is complementary, not competitive**, to subscriptions. Low-volume AI agents pay per call; high-volume converts to subscription.
5. **Internal signals seed the marketplace.** Own algo-trader engine (52+ strategies, paper P&L +$2,251) provides initial supply. Third-party recruitment post-launch.

---

## Pipeline Status Summary

| Layer | Readiness | Gap | Owner |
|-------|-----------|-----|-------|
| [Business] Sales pipeline | Infrastructure built, no active pipeline | First paying customer needed. Zero demand capture running. SEO/Telegram distribution idle. | Founder |
| [Business] Pricing | Tiers resolved ($29/$99/$299), NOWPayments integrated, PRO unified at $99/mo | No paid users to validate WTP. $49 vs $99 inconsistency fixed in spec but code may still reference old pricing. ENTERPRISE and MASTER tiers untested in checkout flow. | Product + Engineering |
| [Agentic] Pipeline | MCP server not yet implemented. x402 not built. Agent discovery schema not published. | Phase 1-4 hardening sprint required before any AI-native pipeline goes live. | Engineering |
| [Governance] Rules | Securities law TOS written, jurisdiction gating planned | Not yet reviewed by counsel. US retail blocking not implemented. Jurisdiction selector not built. | Legal + Engineering |

## Unresolved Questions

1. **First paying customer:** Who is the first target, what is the offer, and what is the conversion mechanism? Is it one of the 3K+ @Sophia_Bbot users, a direct outreach to a known trader, or an invite-only developer preview?
2. **Signal supply for MVP:** Which internal algo-trader strategies (of 52+) are mature enough to expose as marketplace signals? Paper P&L is +$2,251 -- is this verifiable and presentable as a track record?
3. **ENTERPRISE tier checkout:** NOWPayments checkout for $299/mo tier is not yet tested in the billing flow. Does the IPN webhook handle all three signal tiers, or only the platform tiers (Starter/Pro/Enterprise/Master)?
4. **Annual prepay timing:** 20% annual discount exists as a pricing target but deferred. Is this a competitive disadvantage against TradingView ($12.95-199.95/mo annual) and 3Commas ($20-140/mo)? Should Phase 3 include annual billing?
5. **US retail access timeline:** Jurisdiction gating at signup blocks US retail until securities review. Realistic timeline for legal review completion? This directly affects TAM because US is the largest retail trader market.

---
*Report: sales-pipeline-pricing-brief for Signals API Marketplace GTM*
