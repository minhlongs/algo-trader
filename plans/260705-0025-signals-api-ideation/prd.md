# Product Requirements Document -- Signals API Marketplace

> **Date:** 2026-07-05
> **Stage:** Pre-Implementation (Ideation)
> **Vision:** "The Stripe of trading signals" -- single API, unified billing, built-in trust, agent-native access
> **Bilingual:** EN + VN

---

## 1. Product Vision (Tam Nhin San Pham)

**English:**
The Signals API Marketplace aims to become the standard platform for discovering, comparing, and consuming trading signals. Like Stripe standardized online payments, we standardize access to trading signals -- one API, unified billing across providers, built-in trust verification, and agent-native access via MCP and x402 micropayments.

No competitor systematically solves the aggregation + trust problem together. Existing solutions are either single-provider silos (altFINS, Whale Alert) or data feeds without trust infrastructure (Polygon.io, Finnhub). The marketplace model creates a network effect: more providers attract more subscribers, which attracts more providers.

**Vietnamese:**

Signals API Marketplace nham tro thanh nen tang tieu chuan cho viec kham pha, so sanh va nhan tin hieu giao dich. Giong nhu Stripe da chuan hoa thanh toan truc tuyen, chung toi chuan hoa truy cap tin hieu giao dich -- mot API duy nhat, thanh toan thong nhat cho nhieu nha cung cap, co che xac minh tin cay tich hop, va truy cap cho AI agent qua MCP va x402.

---

## 2. Target Users (Nguoi Dung Muc Tieu)

### Persona 1: Crypto Bot Carl (P0 Retail Algo Trader)

| Attribute | Detail |
|-----------|--------|
| **Role** | Individual crypto trader |
| **Portfolio** | $5K - $500K |
| **Current behavior** | Subscribes to 1-3 signal groups on Telegram/Discord, manually copies trades |
| **Pain points** | Trust (cherry-picked results), latency (manual execution), noise (20+ alerts/day) |
| **Technical level** | Can copy-paste a curl command, uses basic trading bots (3Commas, Cryptohopper) |
| **Willingness to pay** | $29-99/mo |
| **GTM channel** | Trading communities, Telegram bot, developer portal |
| **Success metric** | Time-to-first-signal <2 min |

### Persona 2: AI Agent Alice (P1 Agent Developer)

| Attribute | Detail |
|-----------|--------|
| **Role** | Developer building autonomous trading agents |
| **Current behavior** | Scrapes multiple sources, builds custom signal ingestion pipelines |
| **Pain points** | Fragmentation (different APIs for each source), no standardized format, no MCP support |
| **Technical level** | Proficient -- builds with LLM APIs, MCP, web3 |
| **Willingness to pay** | Pay-per-call ($0.01-0.05) or $99/mo subscription |
| **GTM channel** | MCP marketplace, OpenAPI docs, developer communities |
| **Success metric** | API response time <100ms, uptime 99.9% |

### Persona 3: Quant Quinn (P1 Power User)

| Attribute | Detail |
|-----------|--------|
| **Role** | Quantitative analyst / data scientist |
| **Current behavior** | Runs backtests, builds signal fusion models, needs historical data |
| **Pain points** | No standardized quality metrics, hard to compare signal providers objectively |
| **Technical level** | High -- Python, ML, statistical analysis |
| **Willingness to pay** | $99-299/mo + historical data bundles |
| **GTM channel** | OpenAPI docs, quality scoring dashboard, fusion engine |
| **Success metric** | Fusion engine accuracy improvement >10% vs single signals |

### Persona 4: Telegram Tom (P1 Signal Provider)

| Attribute | Detail |
|-----------|--------|
| **Role** | Signal creator with existing Telegram following |
| **Current behavior** | Manually posts signals in Telegram groups, uses spreadsheets for tracking |
| **Pain points** | No distribution beyond own group, no monetization infrastructure, no verifiable track record |
| **Technical level** | Low -- can use a web form, not an API |
| **Willingness to accept** | Free listing, 85-90% revenue share |
| **GTM channel** | Provider onboarding portal, Telegram outreach |
| **Success metric** | Active providers >5 by M6 |

---

## 3. MVP Feature Set (Tinh Nang MVP)

### 3.1 Landing Page and Marketing

| Feature | Priority | Description |
|---------|----------|-------------|
| Comparison table | P0 | Side-by-side comparison of signal providers with quality scores and pricing |
| Provider preview | P0 | Sample signals from each provider without subscription |
| Live status badge | P1 | Real-time platform uptime and signal freshness indicator |

### 3.2 Developer Onboarding

| Feature | Priority | Description |
|---------|----------|-------------|
| 3-click API key creation | P0 | Sign up -> verify email -> copy API key |
| Copy-paste curl examples | P0 | Every page shows executable examples with the user's key |
| Quickstart guide | P0 | "Get your first signal in 2 minutes" walkthrough |
| Multi-language SDK examples | P1 | Python, Node.js, Go, Rust |

### 3.3 API Surface

| Feature | Priority | Description |
|---------|----------|-------------|
| Public OpenAPI 3.1 spec | P0 | **GTM BLOCKER** -- machine-readable API documentation |
| Interactive Swagger UI | P0 | Try endpoints directly from browser |
| `GET /v1/signals` | P0 | Paginated signal feed, filtered by provider, market, tier |
| `GET /v1/signals/:id` | P0 | Single signal detail with reasoning |
| `POST /v1/subscribe` | P0 | Subscribe to signals (consolidated implementation) |
| `POST /v1/unsubscribe` | P0 | Unsubscribe from signals |
| `GET /v1/subscription` | P0 | View current subscriptions |
| `GET /v1/providers` | P0 | List available signal providers with quality scores |
| `GET /v1/stream` (SSE) | P1 | Real-time signal stream (ENTERPRISE tier) |
| `POST /v1/webhook` | P1 | Register webhook for signal delivery |
| `POST /v1/ingest` (internal) | P1 | Signal provider ingestion endpoint (HMAC-signed) |

### 3.4 MCP (Model Context Protocol)

| Feature | Priority | Description |
|---------|----------|-------------|
| MCP server endpoint | P1 | AI agent discovery of available signals |
| MCP tool definitions | P1 | `get_signals`, `subscribe`, `get_quality_scores` |
| Agent auto-registration | P2 | Agent discovers and consumes without human config |

### 3.5 Self-Serve Portal

| Feature | Priority | Description |
|---------|----------|-------------|
| API key management | P0 | Create, revoke, list keys |
| Subscription management | P0 | View active subscriptions, upgrade/downgrade |
| Usage dashboard | P0 | Real-time signal consumption, quota remaining |
| Billing history | P0 | Invoice history, payment method management |
| Provider browsing | P1 | Browse signal providers with comparison |
| Webhook configuration | P1 | Register test and manage delivery URLs |

### 3.6 Billing and Payments

| Feature | Priority | Description |
|---------|----------|-------------|
| NOWPayments checkout | P0 | $99 PRO / $299 ENTERPRISE subscription via NOWPayments |
| IPN webhook integration | P0 | Automated subscription activation on payment confirmation |
| Prorated upgrades | P1 | Upgrade mid-cycle with prorated billing |
| Cancellation flow | P0 | Cancel with prorated refund |
| x402 micropayments | P2 | Pay-per-signal for agentic consumption |

### 3.7 Telegram Integration

| Feature | Priority | Description |
|---------|----------|-------------|
| `/subscribe` command | P1 | Subscribe to signals via Telegram |
| `/status` command | P1 | Check subscription status and usage |
| `/providers` command | P1 | List available providers |
| Signal push notifications | P1 | Receive signals in Telegram based on tier throttling |

---

## 4. Success Metrics (Chi Do Thanh Cong)

### North Star Metric

**Monthly Active Signal Consumers (MASC)** -- number of unique subscribers consuming at least 1 signal in a 30-day window.

### Key Performance Indicators

| KPI | Target | Measurement Method |
|-----|--------|--------------------|
| Paid conversion rate | >8% | (Paid signups / total signups) x 100 |
| Time-to-first-signal | <2 min | Time from signup to first API call returning a signal |
| Active providers by M6 | >5 | Unique providers with signals in last 30 days |
| API uptime (paid tiers) | >99.5% | Successful responses / total requests (excl. auth failures) |
| Signal delivery latency (SSE) | <500ms | End-to-end from ingest to subscriber delivery |
| x402 transaction success | >95% | Successful micropayments / attempted micropayments |

### Financial Targets (Month 12)

| Metric | Target |
|--------|--------|
| MRR | $15K |
| Paying subscribers | 150-200 |
| Gross margin | >75% |
| CAC | <$100 |
| LTV (12-month) | >$600 |
| LTV/CAC ratio | >6:1 |

---

## 5. GTM Strategy (Chien Luoc Ra Mat Thi Truong)

### Phase 0: Infrastructure Hardening (Weeks 1-4)

**Goal:** Ship the codebase from prototype to production-ready.

| Week | Deliverables |
|------|-------------|
| Week 1 | Migrate subscriber state from in-memory to D1; consolidate 3 subscribe implementations into 1 |
| Week 2 | Write OpenAPI 3.1 spec; fix pricing inconsistency ($99 PRO final); remove dead feature-gate code |
| Week 3 | Build usage metering; fix tenant isolation in REST cache; build signal analytics endpoints |
| Week 4 | Legal review of disclaimers and compliance; document startup sequence; build deploy wiring |

**Definition of Done:** All 10 GTM gaps resolved; `npm run build` passes; tests pass.

### Phase 1: Developer Preview (Weeks 5-8)

**Goal:** Validate product-market fit with a small, engaged audience.

| Week | Deliverables |
|------|-------------|
| Week 5 | Invite-only developer preview; FREE tier only; landing page with comparison table |
| Week 6 | Seed with internal signals (Qwen-derived); collect feedback on API design and signal quality |
| Week 7 | Build quickstart guide; publish SDK examples (Node, Python); iterate on API based on feedback |
| Week 8 | Measure: conversion intent (FREE -> willingness to upgrade), time-to-first-signal, NPS |

**Definition of Done:** >20 active developers; >1,000 API calls/day; positive NPS.

### Phase 2: Paid Launch (Weeks 9-12)

**Goal:** Generate first revenue and recruit supply-side signal providers.

| Week | Deliverables |
|------|-------------|
| Week 9 | Launch PRO ($99/mo) tier; wire NOWPayments checkout; self-serve pricing page |
| Week 10 | Launch ENTERPRISE ($299/mo) tier; build provider onboarding flow |
| Week 11 | Telegram bot integration (subscribe, status, providers commands); provider recruitment outreach |
| Week 12 | Measure: paid conversion rate, MRR, active providers, churn rate |

**Definition of Done:** >10 paid subscribers; >5K MRR; >3 active providers.

### Phase 3: Agent-Native (Weeks 13-16)

**Goal:** Capture the growing AI agent market with differentiated agent-native features.

| Week | Deliverables |
|------|-------------|
| Week 13 | Build MCP server endpoint; register in MCP marketplace |
| Week 14 | Implement x402 micropayment handler; agent quota pooling |
| Week 15 | Production-harden fusion engine; add ML-based quality scoring |
| Week 16 | Measure: agent-originated API calls, x402 volume, fusion engine usage |

**Definition of Done:** >100 agent-originated calls/day; x402 processing live; fusion engine <100ms latency.

### Phase 4: Scale (Weeks 17+)

**Goal:** Scale demand generation, provider supply, and enterprise revenue.

| Milestone | Timeline | Target |
|-----------|----------|--------|
| Enterprise licensing ($499-1,999/mo) | Week 20 | >3 enterprise customers |
| Affiliate program launch | Week 22 | >10 active affiliates |
| SEO content strategy | Week 24 | Organic traffic >1K/mo |
| Provider self-service portal | Week 26 | >10 active providers |
| Break-even ($15K MRR) | Month 12 | Operational profitability |

---

## 6. Pricing Recommendation (De Xuat Dinh Gia)

### Resolved Pricing Table

| Tier | Price | Signals/mo | Providers | Support | Features |
|------|-------|------------|-----------|---------|----------|
| FREE | $0 | 1,000 | 1 | Community | 1 provider, polymarket only |
| PRO | **$99** | 10,000 | 5 | Email | All markets, webhooks, Telegram |
| ENTERPRISE | $299 | 100,000 | All | Dedicated | SSE stream, fusion engine, SLA |
| Enterprise Custom | $499-1,999 | Custom | All | Dedicated | Private MCP, on-prem, audit |

### Add-On Pricing

| Feature | Price | Description |
|---------|-------|-------------|
| x402 pay-per-signal | $0.01-0.05/call | Dynamic for agentic consumption |
| Fusion engine premium | $49/mo | Self-learning ML signal combination |
| Provider verification badge | $9.99/mo | Verified track record for provider pages |
| Historical data bundle (1yr) | $99-499 | Backfill signal data for backtesting |
| Private MCP server | $99/mo | Dedicated endpoint for enterprise agents |

### Pricing Rationale

| Decision | Rationale |
|----------|-----------|
| PRO at **$99** (not $49) | NOWPayments source of truth; $49 halves MRR and makes unit economics marginal |
| NO $29 tier | Avoid $29-99 confusion; FREE -> $99 is a clear value step |
| Platform commission 10-15% | Industry standard for marketplace platforms (Etsy 5%, Shopify 15-30%) |
| x402 as add-on (not primary) | Subscription recurring revenue is more predictable and higher LTV |

---

## 7. Risks and Mitigations (Rui Ro va Bien Phap)

### Pre-Launch Risks (Certain if not addressed)

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| In-memory subscriber state lost on restart | CERTAIN | Critical - data loss | D1 migration in Phase 0 (P0, 2-3 days) |
| Pricing inconsistency ($49 vs $99) | CERTAIN | High - revenue confusion | Resolve to $99 before Phase 2; remove $49 refs |
| No OpenAPI spec for external discovery | CERTAIN | Critical - GTM blocker | Write spec in Phase 0 (P0, 3-5 days) |
| Route duplication (3 subscribe implementations) | CERTAIN | High - maintenance burden | Consolidate in Phase 0 (P0, 1-2 days) |

### Post-Launch Business Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Provider acquisition (chicken-and-egg) | HIGH | Medium - slow supply growth | Seed with internal signals first |
| Low developer adoption | MEDIUM | High - revenue miss | Developer communities, copy-paste onboarding |
| Securities law exposure | MEDIUM | High - legal liability | Legal disclaimers, tier-based filters, Geo-block US retail | 
| Competitor enters with same model | MEDIUM | Medium - market share split | First-mover + trust infrastructure moat |
| x402 infrastructure immature | MEDIUM | Low - optional feature | Phase 3, not a GTM dependency |
| Subscription fraud via NOWPayments | LOW | Medium - chargebacks | IPN scoring, rate limiting, manual review flags |
| Single provider dominates supply | LOW | Medium - platform dependency | Cap any provider at 40% of signals |
| L2 gas spikes on Base/Solana | LOW | Low - cost pass-through | Pass through to consumer; cache signals to reduce calls |

### Unresolved Questions

| Question | Recommended Decision | Rationale |
|----------|---------------------|-----------|
| Seed with internal signals or recruit providers at launch? | **Internal signals first** | Delivers immediate value while provider network builds |
| x402 or subscription as primary GTM model? | **Subscription primary** | Recurring revenue more predictable; x402 is agent-native add-on |
| Single or multi-chain for hash commitments? | **Base-only initial** | Lower cost, faster deployment; add chains in Phase 4 |
| Hardening sprint timeline? | **2 weeks minimum** | Covers D1 migration, route consolidation, OpenAPI spec; add 2 weeks for billing + metering |
| Block US retail? | **Yes until legal review** | Securities compliance uncertainty warrants caution |

---

## 8. Definition of Done (Tieu Chi Hoan Thanh)

### Gate 1: Infrastructure Hardening Complete

- [ ] Subscriber state migrated from in-memory to D1/SQLite
- [ ] Single subscribe implementation replaces 3 overlapping ones
- [ ] OpenAPI 3.1 spec published and validated
- [ ] PRO pricing set at $99/mo (NOWPayments source of truth); no $49 refs remain
- [ ] Dead feature-gate code removed or properly wired
- [ ] Usage metering collecting signal consumption data
- [ ] REST cache has tenant isolation (subscriber-dimensioned keys)
- [ ] Startup/deploy sequence documented and health-checked
- [ ] `npm run build` passes with 0 errors
- [ ] `npm test` passes all tests

### Gate 2: Developer Preview Ready

- [ ] Landing page with provider comparison table and quality scores
- [ ] 3-click API key onboarding (signup -> verify -> copy)
- [ ] Copy-paste curl examples on every endpoint page
- [ ] Quickstart guide ("Get your first signal in 2 minutes")
- [ ] Internal Qwen signal pipeline producing signals
- [ ] Invite-only access control (can limit to approved developers)

### Gate 3: Paid Launch Ready

- [ ] NOWPayments checkout wired for $99 PRO and $299 ENTERPRISE
- [ ] IPN webhook -> subscription activation working end-to-end
- [ ] Self-serve pricing page published
- [ ] Provider onboarding flow (web form, not API)
- [ ] Telegram bot commands: /subscribe, /status, /providers
- [ ] Cancellation flow with prorated refund
- [ ] Payment failure handling (dunning, downgrade to FREE)

### Gate 4: Agent-Native Ready

- [ ] MCP server endpoint accepting agent discovery requests
- [ ] x402 micropayment handler processing USDC on Base
- [ ] Agent quota pooling ($99/10K calls)
- [ ] Fusion engine production-hardened (<100ms latency)
- [ ] Agent auto-registration (zero human touch)

---

## 9. Appendices (Phu Luc)

### A. GO/NO-GO Scorecard Reference

| Dimension | Score | Key Reason |
|-----------|-------|------------|
| Market Size | 5/5 | $21B TAM, no dominant aggregator |
| Problem Clarity | 4/5 | 5 validated pain points, trust is #1 |
| Differentiation | 3/5 | Good combo, not unique alone |
| Unit Economics | 3/5 | Strong revenue potential, pricing needs discipline |
| Execution Feasibility | 2/5 | 10 codebase gaps requiring hardening sprint |
| Agentic Fit | 4/5 | MCP, x402, fusion engine -- strong alignment |
| **Total** | **21/30** | **GO** |

### B. Key Assumptions to Validate

| Assumption | Invalidates If | Validation Method |
|------------|---------------|-------------------|
| Developers pay $99/mo for signal APIs | Conversion <3% at $99 | A/B test $49 vs $99 in Phase 1 |
| No aggregator will emerge before we launch | Another aggregator reaches 1K+ subscribers | Monitor competitive landscape monthly |
| Trust infrastructure is a buying factor | Users choose cheapest API without checking track record | Survey Phase 1 users |
| MCP/x402 drives meaningful adoption | <5% of API calls come from agents by month 12 | Usage analytics |
| Internal signals are good enough seed | Churn >20% in FREE tier with internal signals only | Measure retention in Phase 1 |

### C. Architecture Reference

```
                    ┌──────────────────┐
                    │  Signal Provider  │
                    │  (Qwen / External)│
                    └────────┬─────────┘
                             │ HMAC-SHA256
                             ▼
                    ┌──────────────────┐
                    │  Signal Publisher │
                    │  (desk/signal/)   │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
       ┌──────────┐  ┌──────────┐  ┌──────────┐
       │   D1     │  │   Cache  │  │   SSE    │
       │  Store   │  │  (Redis) │  │Broadcast │
       └──────────┘  └──────────┘  └──────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
       ┌──────────┐  ┌──────────┐  ┌──────────┐
       │  REST    │  │   MCP    │  │Telegram  │
       │  API     │  │  Server  │  │   Bot    │
       └──────────┘  └──────────┘  └──────────┘
              │              │
              ▼              ▼
       ┌──────────┐  ┌──────────┐
       │Subscriber│  │   AI     │
       │ (human)  │  │  Agent   │
       └──────────┘  └──────────┘
```
