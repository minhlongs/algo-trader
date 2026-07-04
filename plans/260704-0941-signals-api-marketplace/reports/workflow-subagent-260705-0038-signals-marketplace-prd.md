# Product Requirements Document: Signals API Marketplace GTM

**Date:** 2026-07-05
**Status:** Draft v1
**Verdict:** GO (21/30 -- GO/NO-GO)
**Based on:** GO/NO-GO analysis, tri-layer Business Model Canvas, codebase audit

---

## 1. Vision Statement

Become the unified API layer for algorithmic trading signals -- the platform where any trader, bot, or AI agent discovers, subscribes to, and consumes signals from multiple providers through a single API key, single billing relationship, and single trust infrastructure.

We do not compete with signal providers. We aggregate them, verify them, and make them accessible to both human developers and autonomous agents.

**One-sentence vision:**
> The Stripe of trading signals -- one API that unlocks every market signal, with baked-in trust, unified billing, and agent-native access.

---

## 2. Target Users

### 2.1 Primary ICP: Retail Algorithmic Trader (Individual)

**Demographics:**
- Age 25-45, self-taught or CS-background trader
- Runs automated strategies via Python/Node.js bots or premade trading frameworks (Freqtrade, Hummingbot, Gekko)
- Manages $5K-$500K in crypto or prediction market capital
- Currently subscribes to 1-3 signal providers individually (paying $30-150/mo total)
- Pain: managing multiple API keys, inconsistent data formats, no way to compare provider performance

**Behavioral traits:**
- Reads API docs before signing up
- Wants "give me the curl" onboarding
- Tests before committing to paid tier
- Active in Discord/Telegram trading communities

**WTP:** $29-99/mo for aggregated signal access from 3+ providers

### 2.2 Secondary ICP: AI Agent / Trading Bot Developer

**Demographics:**
- Developer building autonomous trading agents (Claude/GPT/Gemini tool-use agents)
- Uses MCP protocol for tool discovery
- Wants pay-per-call (not subscription) for experimental or low-volume agents
- Pain: agents cannot self-discover or self-subscribe to signal feeds; requires human key management

**Behavioral traits:**
- Wants MCP-native API discovery
- Prefers x402 micropayments over monthly billing for agent operations
- Values schema visibility (agent-readable catalog)
- Expects zero human touch for agent onboarding

**WTP:** $0.01-0.05/call (x402) or $99/10K calls (agent subscription pool)

### 2.3 Supply Side: Signal Providers

**Demographics:**
- Individual analysts, quant shops, ML researchers generating trading signals
- Currently distribute via Telegram/Discord groups, email newsletters, or private APIs
- Pain: no distribution channel, no monetization infrastructure, no reputation system to differentiate from scammers

**Motivation:**
- Access to aggregated buyer demand
- Platform handles billing, delivery, and trust verification
- Verifiable track record builds credibility over time

**Platform economics:** 10-15% commission on provider earnings

### 2.4 Addressable Personas

| Persona | Description | Segment | GTM Priority |
|---------|-------------|---------|--------------|
| **Crypto Bot Carl** | Runs Freqtrade on a VPS, trades Polymarket/Kalshi with 3-5 strategies. Currently copy-pastes signals from 2 Telegram groups. | Retail algo trader | P0 -- largest segment, quickest to convert |
| **AI Agent Alice** | Building a Claude-based agent that arbitrages prediction markets. Needs MCP-native signal feed. | AI agent developer | P1 -- growing fast, needs MCP before GTM |
| **Quant Quinn** | Full-time algo trader with $200K AUM. Needs multi-provider aggregation, historical backtest data, enterprise latency. | Power user / small fund | P1 -- higher ARPU, harder to acquire |
| **Telegram Tom** | Runs a trading signal group with 500 members. Generates 3-5 signals/day. Wants monetization + verified track record. | Signal provider | P1 -- marketplace needs supply |
| **Fund Manager Farah** | $30M crypto fund. Needs audited provider track records, SLA guarantees, and custom integration. | Enterprise | P2 -- long sales cycle, highest ARPU ($499-1,999/mo) |

---

## 3. MVP Features for GTM

These are **not** engineering features. These are the customer-facing touchpoints, marketing assets, onboarding flows, and documentation required for a successful external launch.

### 3.1 Landing Page & Marketing Site

| Asset | Priority | Description | Success Criteria |
|-------|----------|-------------|------------------|
| **Developer landing page** | P0 | Single-page site at `signals.sophia.agencyos.network` or dedicated subdomain. Hero: "One API. Every Signal. Built-in Trust." Three-tier cards. OpenAPI link. 10-second "get the curl" demo. | <3s load, above-fold CTA conversion >5% |
| **Comparison table** | P0 | Side-by-side: our platform vs. managing 5 individual providers. Price, formats, trust, latency, ecosystem. | Reduces time-to-signup decision |
| **Provider preview** | P0 | Public list of available signal providers with accuracy scores, asset coverage, subscription price. No login required to browse. | Browse-to-signup >10% |
| **Use case pages** | P1 | "For Trading Bots" / "For AI Agents" / "For Quant Funds" landing variants with relevant messaging. | Segment-specific conversion lift |
| **Transparency dashboard** | P1 | Public provider track record board. Verifiable accuracy scores, not self-reported. | Builds trust. Measured: time-on-page >60s |

### 3.2 Developer Onboarding

| Flow | Priority | Description | Success Criteria |
|------|----------|-------------|------------------|
| **3-click API key generation** | P0 | Sign up -> verify email -> generate API key. No credit card for FREE tier. Total clicks: 3. | Time-to-first-signal <2 minutes |
| **Copy-paste curl examples** | P0 | Onboarding page shows `curl -H "X-API-Key: $KEY" https://api.sophia.agencyos.network/api/v1/signals/feed` that returns JSON immediately. | First curl success rate >90% |
| **Quickstart guide** | P0 | 5-step guide: "Get your API key" / "Subscribe to a signal" / "Read the feed" / "Set up a webhook" / "Monitor usage" | Completion rate >60% |
| **SDK snippets (Python, Node.js, curl)** | P0 | Copy-paste code blocks for top 3 languages. No SDK install required -- raw HTTP examples. | Code copy rate >70% |
| **Webhook tester** | P1 | In-browser webhook endpoint tester. Send test signal payload to user's URL. | Reduces webhook setup time |

### 3.3 API Documentation

| Asset | Priority | Description | Success Criteria |
|-------|----------|-------------|------------------|
| **OpenAPI 3.1 spec** | P0 | Public OpenAPI spec at `https://api.sophia.agencyos.network/openapi.json`. All endpoints documented with request/response schemas, auth, error codes. | Spec passes validator; no documented endpoint differs from code |
| **Interactive API reference** | P0 | Hosted SwaggerUI or Scalar docs page. Try-it-in-browser for GET endpoints. | Docs-to-API-key conversion >40% |
| **Authentication guide** | P0 | How to generate and use API keys. Key rotation. Rate limit headers. | Auth error rate <5% of first requests |
| **Webhook reference** | P0 | Signal event schema, delivery guarantees (at-least-once), retry policy, security (HMAC signature verification). | Webhook integration time <30min |
| **Tier comparison page** | P0 | What each tier gets: signals/min, providers, markets, latency, support SLA. | Tier upgrade rate >15% |
| **Error code reference** | P1 | Every 4xx/5xx error with meaning, cause, fix. | Reduces support tickets by 30% |
| **Rate limit docs** | P1 | Explicit rate limits per tier. How headers work (X-RateLimit-Remaining, X-RateLimit-Reset). Backoff strategy. | Rate limit violations <5% after docs read |

### 3.4 MCP Server

| Asset | Priority | Description | Success Criteria |
|-------|----------|-------------|------------------|
| **MCP server endpoint** | P0 | Expose signal feeds as MCP resources/tools. Agent discovery via MCP protocol. | MCP discovery returns correct schema |
| **MCP registration** | P0 | Listed in MCP registries (Anthropic, community directories). | Agent discoverable without manual config |
| **Agent schema** | P1 | Machine-readable catalog: available signals, pricing, rate limits. Agents self-decide before subscribing. | Agent auto-subscription rate >50% of MCP discovery |

### 3.5 Self-Serve Portal (Developer Dashboard)

| Feature | Priority | Description |
|---------|----------|-------------|
| **API key management** | P0 | Generate, revoke, rename keys. Multiple keys per account. |
| **Subscription management** | P0 | Browse available signals, subscribe/unsubscribe, view active subscriptions, change tier |
| **Usage dashboard** | P0 | Real-time API call count, signals delivered, rate limit usage. Last 7/30 days. |
| **Billing history** | P0 | Invoice list, payment status, next billing date. NOWPayments reference. |
| **Webhook management** | P0 | Register webhook URL, test delivery, view delivery log (status, timestamp, payload preview) |
| **Signal performance** | P1 | Per-signal accuracy, PnL attribution (if user provides trade data), win rate. ROI dashboard. |
| **Provider ratings** | P1 | User ratings + verified track record for each provider |

### 3.6 Billing & Payments

| Feature | Priority | Description |
|---------|----------|-------------|
| **Free tier signup** | P0 | No credit card. 1,000 calls/mo, 2 signals/min, single provider preview |
| **NOWPayments checkout** | P0 | Dynamic invoice generation per tier. Crypto + fiat via NOWPayments. |
| **Tier upgrade/downgrade** | P0 | Self-serve tier change. Prorated billing on upgrade. End-of-cycle on downgrade. |
| **Invoice receipts** | P0 | Email + dashboard receipt after each payment. NOWPayments TX ID reference. |
| **Cancellation** | P0 | Cancel anytime. Access continues through billing period. No lock-in. |
| **Usage alerts** | P1 | Email/Telegram alert at 80%/100% of tier limit. Prevents surprise overage. |

### 3.7 Telegram Bot (@Sophia_Bbot)

| Command | Priority | Description |
|---------|----------|-------------|
| `/signals discover` | P1 | Browse available signal providers and their stats |
| `/signals subscribe <name>` | P1 | Subscribe to a signal provider via Telegram |
| `/signals status` | P1 | View active subscriptions and remaining usage |
| `/signals alert <on/off>` | P1 | Toggle Telegram delivery of signal events |

---

## 4. Success Metrics

### 4.1 North Star Metric

**Monthly Active Signal Consumers (MASC)**
Count of unique API keys that made at least one successful signal request in the trailing 30 days.

This captures the core value exchange: developers/agents actively consuming marketplace signals. It is a leading indicator of both demand validation and recurring revenue potential because active consumers are far more likely to convert to paid.

### 4.2 Key Performance Indicators

| KPI | Metric | Target (Month 6) | Why |
|-----|--------|-------------------|-----|
| **KP-1: Paid conversion** | % of signups that reach paid tier (PRO or higher) within 14 days | >8% | Validates that free-tier users see enough value to pay. Industry benchmark for API products: 5-15%. |
| **KP-2: Time-to-first-signal** | Median minutes from signup to first successful `GET /feed` response | <2 minutes | Measures onboarding friction. If >5 minutes, onboarding flow is broken. |
| **KP-3: Provider availability** | Number of active signal providers on the marketplace | >5 by M6, >15 by M12 | Measures supply-side health. Marketplaces die without supply. Internal signals count for seeding. |
| **KPI-4 (guardrail): Churn rate** | Monthly paid subscriber churn | <8%/mo | For SaaS API products, <5% is great, <10% is healthy. >15% indicates product-market mismatch. |

### 4.3 Leading Indicators (Weekly pulse)

| Indicator | Good | Warning | Critical |
|-----------|------|---------|----------|
| Signups/week | >50 | 20-50 | <20 |
| Free-to-paid conversion | >8% | 3-8% | <3% |
| API call success rate | >99% | 97-99% | <97% |
| Docs page views/signup | >5 | 3-5 | <3 |
| Active signal providers | >3 | 1-2 | 0 |
| Avg signals delivered/day | >10K | 1K-10K | <1K |

### 4.4 Financial Targets (Month 12)

| Metric | Target | Notes |
|--------|--------|-------|
| Monthly Recurring Revenue | $15,000 | Blend of subscriptions + x402 + platform commissions |
| Paying subscribers | 150-200 | At blended ARPU of $75-100/mo |
| Platform commission revenue | $1,500/mo | 10-15% of provider earnings |
| Average Revenue Per Paying User | $75-100 | Mix of $29/$99/$299 tiers + add-ons |
| Gross margin | >75% | Cloud infrastructure cost: <$500/mo at MVP scale |

---

## 5. GTM Strategy

### 5.1 Launch Phases

#### Phase 0: Infrastructure Hardening (Weeks 1-4)
**Before anyone sees the marketplace, fix the foundation.**

- D1 migration (in-memory subscriber state -- production showstopper)
- Consolidate 3 overlapping subscribe implementations into single router
- Write OpenAPI spec (GTM blocker -- no one can sign up without docs)
- Fix pricing inconsistency ($49 vs $99 PRO tier)
- Wire feature-gate dead code
- Write TOS/legal disclaimers (securities law firewall)

**Gate:** OpenAPI spec published, D1 persistence verified, single subscribe router live, pricing finalized.

#### Phase 1: Soft Launch / Developer Preview (Weeks 5-8)
**Marketplace is live but invite-only. Seed with internal signals from algo-trader engine.**

- Deploy developer landing page + docs site
- OpenAPI spec published on public URL
- Developer portal (API key management, basic subscription, usage dashboard)
- FREE tier only (no payment required -- reduce friction for early feedback)
- MCP server endpoint live
- Seed marketplace with 3-5 internal signal feeds (from existing algo-trader pipelines)
- Invite 50-100 developers from trading Discord/Telegram communities
- **NO paid tiers yet** -- validate demand signal before asking for money

**Gate:** 50 active developers, <2min time-to-first-signal, error rate <1%, NPS >30.

#### Phase 2: Paid Tier Launch (Weeks 9-12)
**Open paid tiers. Begin provider recruitment.**

- Enable NOWPayments checkout at $29/$99/$299
- Launch PRO and ENTERPRISE tiers
- Activate webhook delivery (ENTERPRISE: SSE real-time)
- Launch Telegram bot commands (`/signals discover`, `/subscribe`, `/status`)
- Begin provider onboarding (outreach to 10-20 potential signal providers)
- Publish transparency dashboard (provider accuracy scores)
- First affiliate/partner deals with trading communities

**Gate:** 20+ paid subscribers, $2K+ MRR, 5+ active providers (including internal signals).

#### Phase 3: AI Agent Launch (Weeks 13-16)
**Agent-native consumption layer.**

- Activate x402 pay-per-signal (HTTP 402 + USDC on Base)
- Publish agent discovery schema
- MCP marketplace listing published
- Agent self-onboarding flow (no human touch)
- Fusion engine premium add-on ($49/mo)
- Partner with 1-2 AI agent developer communities for beta

**Gate:** 10+ agent-only subscribers, x402 revenue >$500/mo, fusion engine active.

#### Phase 4: Scale (Weeks 17+)
**Growth engine.**

- Enterprise licensing ($499-1,999/mo)
- Signal provider self-serve onboarding portal
- Affiliate program (15% rev share)
- SEO content marketing: comparison guides, tutorial series
- Provider verification badge subscriptions
- Dispute resolution system

### 5.2 Distribution Channels (Priority Order)

| Priority | Channel | Launch Phase | Est. CAC | Effort |
|----------|---------|-------------|----------|--------|
| 1 | Developer trading communities (Discord, Telegram) | Phase 1 | $0-5 | Low -- founder posts on existing channels |
| 2 | MCP ecosystem / registries | Phase 1 | $0 | Low -- free listing |
| 3 | @Sophia_Bbot existing user base | Phase 2 | $0 | Low -- add /signals commands |
| 4 | Signal provider referrals | Phase 2 | $0 (rev share) | Medium -- provider incentives |
| 5 | SEO content (tutorials, comparisons) | Phase 3 | $200-500/mo | High -- content production |
| 6 | Paid ads (Reddit, X, Hacker News) | Phase 4 | $5-20/CAC | Medium-high -- requires budget |

### 5.3 Launch Narrative

The story we tell at launch:

> **"You shouldn't need 5 API keys, 3 Telegram groups, and a spreadsheet to get good trading signals."**
>
> Signals API Marketplace is the first unified API for trading signals. One key, one bill, one consistent data format. Every signal includes a reason field (not just BUY/SELL), hash-committed provenance, and standardized quality scores.
>
> For developers: `curl -H "X-API-Key: $KEY" https://api.sophia.agencyos.network/api/v1/signals/feed`
>
> For AI agents: discover and subscribe via MCP protocol. Pay per signal with crypto. No human needed.

### 5.4 Competitive Positioning

| Competitor Type | How We Beat Them | Our Vulnerability |
|-----------------|------------------|-------------------|
| Individual signal providers | Aggregation + trust infrastructure + single billing | No exclusive signals -- same providers may sell directly |
| Data aggregation platforms (e.g., Polygon, CoinGecko) | Trading-specific signals (not just price data), execution bridge, MCP-native | Less data breadth |
| Telegram signal groups | API-native, verifiable track records, no spam | Less community feel |
| Broker-integrated research (e.g., TradingView) | No broker lock-in, agent-native, multi-provider fusion | Smaller existing user base |

---

## 6. Risks & Mitigations

### 6.1 Critical Risks (Pre-Launch)

| Risk | Severity | Likelihood | Mitigation | Owner |
|------|----------|------------|------------|-------|
| **In-memory subscriber state lost on restart** | Critical | Certain | P0: migrate to D1 before any paid tier goes live. Phase 0 hard requirement. | Engineering |
| **Pricing inconsistency ($49 vs $99) confuses early adopters** | High | Certain | Resolve to $99/mo (NOWPayments source of truth). Update all pricing references. Document in changelog. | Product |
| **No OpenAPI spec blocks developer adoption** | High | Certain | Phase 1 non-negotiable. Generate from code, publish before inviting external users. | Engineering |
| **Three overlapping subscribe implementations cause integration errors** | High | Certain | Consolidate to single router in Phase 0. Remove dead routes. | Engineering |
| **Securities law exposure for US retail signals** | High | Medium | Phase 0: legal review + TOS with "signals are data, not advice" firewall. Consider jurisdiction gating for high-risk segments. | Legal |

### 6.2 Business Risks (Post-Launch)

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| **No signal providers join marketplace** | Critical | Medium | Seed with internal signals from algo-trader engine. Do not launch marketplace empty. |
| **Zero-to-one adoption: no one signs up** | Critical | Low | Leverage existing @Sophia_Bbot user base (3K+ users). Developer preview with 50 invited devs before open launch. |
| **Free tier cannibalizes paid conversion** | Medium | Medium | Free tier is rate-limited (2 signals/min, 1K/mo, 1 provider). Value gap to PRO is obvious. |
| **x402 micropayment adoption too slow** | Low | Medium | Subscription is primary revenue model. x402 is exploratory -- no revenue dependency on it. |
| **Signal quality fraud (provider fakes track record)** | Medium | Medium | On-chain hash commitment at publish time. Verification badge requires third-party audit. Bonding/slashing for serious cases. |
| **API abuse / credential sharing** | Medium | Medium | Rate limits per API key. Anomaly detection on unusual call patterns. Tier enforcement on subscription endpoints. |
| **Churn due to provider quality variance** | Medium | Medium | Standardized quality scores let users compare. Fusion engine provides multi-provider diversification. Automatic worst-performer throttling. |

### 6.3 Risk Register -- Unresolved (Decision Needed)

| Question | Options | Impact | Recommended Decision |
|----------|---------|--------|---------------------|
| Seed with internal signals or wait for third-party providers? | (A) Internal signals only for Phase 1-2, recruit providers in Phase 3. (B) Recruit providers before launch. | A: faster to market, but less variety. B: slower launch, more supply. | **A.** Internal signals from existing algo-trader engine for MVP. Recruit providers post-launch. |
| x402 vs subscription as primary revenue model? | (A) Dual-track from launch. (B) Subscription only MVP, x402 Phase 2. | A: more complex billing, more options. B: simpler MVP, defers agent revenue. | **B.** Subscription primary. x402 is differentiation, not revenue dependency. |
| Single-chain or multi-chain for hash commitments? | (A) Base only (Coinbase L2). (B) Base + Solana. | A: simpler, lower cost. B: more discoverable, higher complexity. | **A.** Base only for MVP. Solana if demand appears. |
| Hardening sprint timeline? | (A) 2 weeks focused. (B) 4 weeks alongside feature work. | A: faster launch, higher dev concentration risk. B: slower but safer. | **A.** 2-week dedicated sprint. This is debt, not new feature work. |
| Jurisdiction gating at signup? | (A) Global access with TOS firewall. (B) Restrict US retail until legal review. | A: faster growth, higher legal risk. B: slower growth, safer. | **B.** Block US retail at signup with jurisdiction selector until securities counsel reviews. Reversible. |

---

## 7. Pricing Recommendation

### 7.1 Tier Structure (Resolved)

Based on codebase audit that found $49 (pricing-tiers.ts) vs $99 (NOWPayments) inconsistency, and BMC analysis, the recommended pricing is:

| Tier | Price | Signal Providers | Markets | API Calls/mo | Rate Limit | Delivery | Support |
|------|-------|------------------|---------|-------------|------------|----------|---------|
| **FREE** | $0 | 1 (preview) | polymarket | 1,000 | 2/min | REST only | Community |
| **PRO** | $99 | 5 | polymarket, kalshi, limitless | 10,000 | 30/min | REST + Webhook | Email (<4h) |
| **ENTERPRISE** | $299 | 20 | all | 100,000 | 120/min | REST + Webhook + SSE (real-time) | Priority (<1h) |
| **MASTER** | Custom | Unlimited | all | Unlimited | Unlimited | All | Dedicated |

**Rationale for $99 PRO (not $49):**
1. NOWPayments checkout already emits $99 invoices -- changing to $49 would require billing code change and reduce MRR by 50%
2. At $49, unit economics become marginal after 15% platform commission and $0.50/tx NOWPayments fees
3. Competitor signal APIs charge $50-200/mo for equivalent quality. $99 is mid-market.
4. The $29 introductory tier is future addition for budget-conscious buyers who value only 1-2 providers

### 7.2 Add-On Pricing

| Add-On | Price | Notes |
|--------|-------|-------|
| x402 pay-per-signal | $0.01-0.05/call | For AI agents. No subscription needed. USDC on Base. |
| Agent subscription pool | $99/10K calls | Shared quota across multiple agents at same firm |
| Fusion engine premium | $49/mo add-on | ML-weighted signal fusion, self-learning weights |
| Historical data bundle | $10-50/dataset | One-time purchase. Backtesting data. |
| Private MCP server | $99/mo | Dedicated server, no rate limits, custom routing |
| Provider verification badge | $9.99/mo | Verified audited track record badge for providers |

### 7.3 Enterprise Pricing

| Tier | Price | Typical Use Case |
|------|-------|------------------|
| Enterprise Basic | $499/mo | Small fund (sub-$50M AUM), 3 seats, custom SLA |
| Enterprise Pro | $999/mo | Mid fund ($50-200M AUM), 10 seats, dedicated support |
| Enterprise Premium | $1,999/mo | Large fund ($200M+ AUM), unlimited seats, white-label option, on-premise deploy |

All enterprise tiers include: priority support SLA (<30min response), custom data retention, usage analytics, dedicated onboarding.

### 7.4 Platform Commission (Provider Side)

- **Standard:** 15% of provider earnings on marketplace
- **Launch partner discount:** 10% for first 10 providers (founding provider badge)
- **Enterprise channel:** 10% for providers who bring their own enterprise buyers

### 7.5 Pricing Principles

1. **FREE tier exists for acquisition, not revenue.** It must demonstrate value within 3 API calls. Rate limits prevent abuse, not use.
2. **PRO is the default paid tier.** Most users should land here. $99/mo is within WTP range for retail algo traders based on BMC research.
3. **ENTERPRISE exists for power users and small funds.** Price anchors PRO as "affordable" by comparison.
4. **x402 is complementary, not competitive**, to subscriptions. Low-volume experimental users pay per call; high-volume users convert to subscription.
5. **No annual discount for MVP.** Annual plans add billing complexity (NOWPayments limitations). Add in Phase 4.

---

## 8. Definition of Done (GTM Checklist)

### Gate 1: Phase 0 Complete (Hardening)
- [ ] In-memory subscriber state migrated to D1
- [ ] Single `/api/v1/signals/subscribe` router live (3 old implementations removed)
- [ ] OpenAPI spec published at `https://api.sophia.agencyos.network/openapi.json`
- [ ] PRO pricing finalized at $99/mo across all references
- [ ] requireSignalTier feature gate wired or removed
- [ ] TOS/legal disclaimers reviewed by counsel
- [ ] `npm run build` passes with 0 errors
- [ ] `npm test` passes all tests

### Gate 2: Phase 1 Complete (Developer Preview)
- [ ] Landing page live at signals subdomain
- [ ] Developer portal with API key management + usage dashboard
- [ ] OpenAPI spec + interactive docs on public URL
- [ ] MCP server endpoint live, tested with MCP client
- [ ] 3-5 internal signal feeds active
- [ ] 50 invited developers active
- [ ] Time-to-first-signal <2 minutes
- [ ] API error rate <1%

### Gate 3: Phase 2 Complete (Paid Launch)
- [ ] NOWPayments checkout live at $99/$299
- [ ] Webhook delivery active for PRO/ENTERPRISE
- [ ] SSE delivery active for ENTERPRISE
- [ ] Telegram bot `/signals` commands live
- [ ] 20+ paid subscribers
- [ ] $2K+ MRR
- [ ] Transparency dashboard public

### Gate 4: Phase 3 Complete (Agent Launch)
- [ ] x402 pay-per-signal live
- [ ] Agent discovery schema published
- [ ] MCP marketplace listing published
- [ ] Fusion engine premium add-on live
- [ ] 10+ agent-only subscribers
- [ ] x402 revenue >$500/mo

---

## 9. Appendices

### A. GO/NO-GO Scorecard

| Dimension | Score (1-5) | Assessment |
|-----------|-------------|------------|
| Market Size | 5 | $21B TAM with no dominant aggregator |
| Problem Clarity | 4 | Trust is #1 unsolved problem across 5 validated pain points |
| Differentiation | 3 | Aggregation + MCP + hash-commit + fusion -- unique combination, but individual features exist elsewhere |
| Unit Economics | 3 | $99/mo ARPU, 70-80% margins, BUT enterprise is lumpy, x402 is untested |
| Execution Feasibility | 2 | 10 significant GTM gaps in codebase. Hardening sprint required before launch. |
| Agentic Fit | 4 | MCP-native + x402 + fusion engine + agent self-onboarding is genuinely differentiated for AI agent market |
| **Total** | **21/30** | **GO** (threshold: 18, consistent with BMC findings) |

### B. Key Assumptions to Validate

| Assumption | Test | When | Invalidates If |
|------------|------|------|----------------|
| Developers will pay for aggregated signal access | Free tier -> PRO conversion rate | Phase 2 (Week 9) | <3% conversion after 100 free-tier signups |
| Internal signals are sufficient to seed marketplace | Active developer count after Phase 1 | Phase 1 (Week 5) | <30 active developers after 50 invites |
| MCP-native access drives significant agent adoption | Agent subscriber count | Phase 3 (Week 13) | <5 agent subscribers in first month |
| $99/mo PRO is within WTP for retail traders | Paid subscriber acquisition cost | Phase 2 (Week 10) | CAC >$99 (meaning unit economics negative) |
| x402 micropayments produce meaningful revenue | x402 revenue as % of total | Phase 3 (Week 16) | <10% of MRR from x402 after 3 months |

### C. Report Output

**Report saved to:** `/Users/macbook/algo-trader/plans/260704-0941-signals-api-marketplace/reports/workflow-subagent-260705-0038-signals-marketplace-prd.md`
