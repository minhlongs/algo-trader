# AlgoTrade -- Consolidated Company Architecture

**Date:** 2026-07-05 | **Stage:** Scale-Up / Pre-revenue | **Founder:** billwill (solo)
**Model:** Dual-platform RaaS (bot subscriptions + Signals API Marketplace)
**Target ARR:** $1M (12-18 months) | **Codebase:** 886 files, 842 TS sources, 731 commits

**Source reports:**
- `plans/260704-0941-signals-api-marketplace/reports/workflow-subagent-260705-0110-market-intelligence-report.md`
- `plans/260704-0941-signals-api-marketplace/reports/workflow-subagent-260705-0112-bizplan-analysis-report.md`
- `plans/260704-0941-signals-api-marketplace/reports/workflow-subagent-260705-0112-icp-validation-brief.md`
- `plans/260704-0941-signals-api-marketplace/reports/workflow-subagent-260705-0112-brand-positioning-content-strategy.md`
- `plans/260704-0941-signals-api-marketplace/reports/workflow-subagent-260705-0112-gtm-site-audit-report.md`
- `plans/260704-0941-signals-api-marketplace/reports/workflow-subagent-260705-0112-marketing-growth-gtm-brief-report.md`
- `plans/260704-0941-signals-api-marketplace/reports/workflow-subagent-260705-0112-sales-pipeline-pricing-brief.md`
- `plans/260704-0941-signals-api-marketplace/reports/workflow-subagent-260705-0112-aarrr-okr-framework-report.md`
- `plans/260704-0941-signals-api-marketplace/reports/workflow-subagent-260705-0112-fundraising-risk-brief.md`
- `plans/260704-0941-signals-api-marketplace/reports/workflow-subagent-260705-0113-talent-org-governance-brief.md`
- `plans/260704-0941-signals-api-marketplace/reports/workflow-subagent-260705-0113-legal-compliance-esg-brief.md`
- `plans/260704-0941-signals-api-marketplace/reports/workflow-subagent-260705-0113-agentic-architecture-brief.md`
- `plans/260704-0941-signals-api-marketplace/reports/workflow-subagent-260705-0113-crisis-ipo-readiness-brief.md`

---

## 1. Executive Summary

**1.1 Company Snapshot**
AlgoTrade (`@mekong/algo-trader`) is a pre-revenue, revenue-ready Signals API Marketplace + Robot-as-a-Service (RaaS) trading platform. 32 of 37 roadmap phases complete. Billing, content, distribution infrastructure fully built. Codebase runs 3,194/3,198 tests passing, zero `any` types, p95 API latency ~45ms. Operated solo via MekongMind AI agent orchestration -- 6 C-level agents, zero human employees, zero payroll.

**1.2 The Bet**
Prediction markets are growing 20x/year ($51B in 2025 to ~$240B projected for 2026). Signal infrastructure for this space is immature -- no polished API product exists for the post-Feb-2026 maker-optimized Polymarket regime. AlgoTrade's 52-strategy ensemble (DeepSeek R1 + Nemotron-3 Nano on bare-metal M1 Max) provides genuine technical edge that can be packaged and sold as a signals API before any bot subscription revenue arrives.

**1.3 State Summary**

| Layer | Status | Critical Gap |
|-------|--------|-------------|
| Business | Pre-revenue, revenue-ready. Billing, tier system, content pipeline built. | Zero paying customers. First sale needed. |
| Agentic | Solo-company via MekongMind with 6 C-level agents. 30 blog + 30 social posts/mo at $0 labor. | MCP server not live. x402 not built. |
| Governance | Strong engineering rigor (99.9% tests, 0 `any` types). TOS firewall written. | No corporate entity. No securities counsel review. No US retail gating. |

**1.4 Immediate Critical Path (Phase 0)**
1. Incorporate (Delaware C-Corp or Wyoming LLC) before first dollar of revenue
2. Engage securities counsel for TOS review (signal data vs investment advice)
3. Implement US retail jurisdiction gating at signup
4. Migrate in-memory subscriber state to D1 (non-negotiable before paid tiers)
5. Consolidate 3 overlapping subscribe implementations into single router
6. Generate OpenAPI spec from code and publish
7. Define Solo Succession Protocol (encrypted offline doc)

---

## 2. Business Model & Revenue

**2.1 Dual-Platform RaaS Architecture**

| Stream | Model | Price Range | Margin | Maturity |
|--------|-------|-------------|--------|----------|
| Bot subscriptions (Starter/Pro/Enterprise/Master) | Monthly crypto prepay (NOWPayments) | $19-999/mo | 70-80% | Built, pre-revenue |
| Signals API subscriptions (Basic/Pro/Enterprise) | Monthly REST/Webhook/SSE | $29-299/mo | 70-80% | Phase 1-4 in progress |
| Platform commission (signal providers) | 10-15% rev share on provider earnings | Variable | 90%+ | Post-MVP (Phase 2+) |
| Enterprise licensing (white-label, dedicated infra) | Custom SLA | $499-1,999/mo | 80-85% | Post-MVP (Phase 4+) |
| Historical data bundles | One-time / add-on | $10-50/dataset | 85% | Post-MVP |
| Annual prepay discount | 20% off prepay | Neutral margin | Neutral | Tied to NOWPayments |

**2.2 Pricing Tiers**

| Tier | Price | Providers | Rate Limit | Delivery | Target |
|------|-------|-----------|------------|----------|--------|
| FREE | $0 | 1 (preview) | 2/min, 1K/mo | REST | Evaluation |
| PRO | $99/mo | 5 | 30/min, 10K/mo | REST + Webhook | Retail algo traders |
| ENTERPRISE | $299/mo | 20 | 120/min, 100K/mo | REST + Webhook + SSE | Small funds |
| MASTER | Custom | Unlimited | Unlimited | All | Large funds ($200M+) |

**Add-ons:** x402 ($0.01-0.05/call, USDC on Base), Fusion engine ($49/mo), Historical data ($10-50), Private MCP ($99/mo), Provider badge ($9.99/mo).

**2.3 Unit Economics**
At $99/mo PRO: NOWPayments ~0.5% ($0.50), Cloudflare Workers/D1 <$0.50/active user, delivery cost negligible. Gross margin ~75-80%. At 200 subscribers = $19.8K MRR, infrastructure cost <$500/mo.

**2.4 Cost Structure (MVP Scale)**

| Category | Monthly | Notes |
|----------|---------|-------|
| Cloudflare (Workers + D1 + R2) | $20-200 | Scales with request volume |
| NOWPayments | ~0.5% per tx | Variable |
| MCP server hosting | $20-100 | Stateless, scales horizontally |
| Fusion engine compute | $50-500 | ML batch jobs, not real-time |
| Domain + DNS | $15-30 | Static |
| Legal (one-time) | $2,000-5,000 | TOS, securities firewall |
| On-chain commit storage (Base L2) | $5-50 | Gas costs |

Total operating burn: ~$100-1,000/mo at MVP. Zero payroll.

---

## 3. Customer & Market

**3.1 TAM/SAM/SOM**

| Layer | Size | Source |
|-------|------|--------|
| TAM -- Prediction market industry (2026) | ~$240B | Polymarket $10.6-25.7B/mo, Bernstein $1T-by-2030 |
| TAM -- Algo trading signals (broad) | $15.24B (11.7% CAGR) | Market reports |
| TAM -- AI Trading Agents | $7.63B (49.6% CAGR) | Fastest-growing subsegment |
| SAM -- Prediction market signal consumers | ~$2-5B | Inference: 10-20% of Polymarket power users |
| SOM -- Realistic 12-month capture | $60K-180K ARR | 5-15 customers at $99-299/mo, solo-founder |

**3.2 ICPs Ranked by Revenue Potential**

| # | ICP | Product | WTP | Conviction |
|---|-----|---------|-----|------------|
| 1 | Prediction market power trader (maker-specialist) | Pro/Enterprise RaaS ($99-299/mo) | $89-254/mo benchmark (Trade Ideas) | HIGH -- Feb 2026 Polymarket rule change created unmet maker-optimized signal demand |
| 2 | Solo quant / prop dev building auto-strategies | Signals API Enterprise ($299/mo) | $300-699/mo benchmark (Whale Alert) | MED-HIGH -- API-first fits workflow, low switching cost |
| 3 | Crypto-retail trader seeking AI edge (hobbyist) | Starter RaaS ($19/mo) or Basic ($29/mo) | $4.99-29/mo benchmark (CryptoSignal) | MED -- Price aligned but undifferentiated from indie tools |
| 4 | AI agent / MCP consumer (emerging) | Basic/Pro ($29-99/mo) | $0.01/signal benchmark (sml-x402) | LOW -- Tiny market, 49.6% CAGR trajectory |

**3.3 Market Dynamics**
- Polymarket monthly volume: $1.2B (early 2025) to $10.6-25.7B (2026) -- 17-20x growth
- Kalshi annualized volume: $178B as of May 2026 (3.4x in 6 months)
- Polymarket Feb 2026 dynamic taker fees (up to 1.56%) killed taker arbitrage; maker strategies with rebates are the new meta
- Signal accuracy paradox: PredictIt (93%) > Kalshi (78%) > Polymarket (67%) -- volume does not equal signal quality, creating opportunity for quality-filtered signals
- No standalone "trading signal API" market segment exists -- AlgoTrade is defining it

**3.4 Competitive Positioning**

| Against | We Win On | We Lose On |
|---------|-----------|------------|
| Individual signal providers (Telegram groups) | Aggregation + verifiable track records + API-native delivery | Less community feel |
| Data platforms (Polygon, CoinGecko) | Trading-specific signals, execution bridge, MCP-native | Less data breadth |
| Broker-integrated research (TradingView, 3Commas) | No broker lock-in, agent-native, multi-provider fusion | Smaller existing user base |
| Other unified APIs (SimpleFunctions, Tatum) | Trust infrastructure is unique -- no competitor systematically solves signal verification | Earlier stage, less brand recognition |

**Critical insight:** ICPs are validated on paper but unvalidated by actual customer data. Zero paying customers means every WTP estimate is a hypothesis. First 5 customer interviews are the single highest-leverage action.

---

## 4. Product & Tech

**4.1 Tech Stack**

| Layer | Stack |
|-------|-------|
| Runtime | TypeScript (Node.js) |
| API Framework | Fastify 5, Express 5, Hono (Cloudflare Workers) |
| Frontend | React 19 (Vite SPA), TradingView Lightweight Charts, CashClaw dashboard |
| Database | PostgreSQL + Prisma ORM + Redis Cluster (6-node, AOF+RDB) |
| Primary DB (Cloud) | Cloudflare D1 via `createServerClient()` |
| AI/LLM | DeepSeek R1 (8-15 t/s) + Nemotron-3 Nano (35-50 t/s) via MLX on M1 Max; TensorFlow.js; Kronos Python OHLCV |
| Exchanges/Blockchain | CCXT (Binance, OKX, Bybit), Polymarket CLOB v2, ethers.js, Jupiter (Solana) |
| Infrastructure | Docker (multi-stage), Kubernetes, Caddy SSL, Cloudflare Workers, Cloudflare Pages |
| Monitoring | Prometheus + Grafana + Alertmanager + Sentry + OpenTelemetry |
| Messaging | BullMQ, NATS, WebSocket, Telegram (grammy), Twilio |
| Testing | Vitest (3,194/3,598), Playwright, k6 load (1K concurrent validated) |

**4.2 AI Co-Pilot -- Technical Moat**

DeepSeek R1 + Nemotron-3 Nano ensemble via MLX on M1 Max (bare metal, not Docker -- Metal GPU required). 52+ strategies across 5 prediction markets. Ensemble voting + regime-adaptive signal fusion produces higher-quality signals than any single-model approach. Paper trading P&L: +$2,251 (66.7% win rate). Arbitrage edge: 14.6%.

**4.3 Product Maturity**
- 32 of 37 roadmap phases complete
- Remaining phases (33-37): performance tuning, content personalization, compliance/KYC, marketplace monetization, advanced risk management
- Live trading: paper-gate passed (2026-05-17), keys not configured
- Build time: ~5s incremental
- 0 `any` types in 842 TypeScript source files

**4.4 Platform Features Built**

| Feature | Status | Notes |
|---------|--------|-------|
| Setup Wizard (BYOK API keys) | Built | OpenRouter, ElevenLabs, D-ID onboarding |
| Telegram bot (@Sophia_Bbot) | Built | /campaign, /status, /results commands live |
| NOWPayments billing | Built | 4 bot tiers + 3 signal tiers, IPN webhook |
| 52-strategy fusion engine | Built | DeepSeek R1 + Nemotron ensemble, regime detection |
| Paper trading engine | Built | +$2,251 P&L, 66.7% win rate |
| Blog auto-generation | Built | DeepSeek R1, ~30 posts/mo |
| Twitter/X auto-posting | Built | API v2, ~30 posts/mo |
| Compliance rules engine | Built | Position limits, sanctions, jurisdiction, volume |
| KYC routes | Built | BYOK Persona integration, basic/advanced/full tiers |
| Dashboard (React SPA) | Built | 19 pages behind auth, 30,205 lines TS |

**4.5 Product Gaps (Phase 0-1 Priority)**

| Gap | Severity | Phase |
|-----|----------|-------|
| In-memory subscriber state (not D1-backed) | CRITICAL -- state lost on restart | Phase 0 |
| 3 overlapping subscribe implementations | HIGH -- integration errors | Phase 0 |
| No OpenAPI spec | HIGH -- blocks dev adoption | Phase 0 |
| Landing page vs company profile pricing mismatch ($49 vs $99) | HIGH -- resolved internally, code may still have old refs | Phase 0 |
| MCP server not implemented | MEDIUM -- blocks agent-native pipeline | Phase 1 |
| Signals API feed endpoints not exposed | MEDIUM -- signals marketplace invisible | Phase 1 |
| No public paper-trading P&L dashboard | MEDIUM -- trust-building missing | Phase 1 |
| CashClaw brand vs AlgoTrade brand split | MEDIUM -- two GTM narratives | Needs decision |

---

## 5. Marketing & GTM

**5.1 Brand Positioning**

Positioning statement: "One API key. Every market signal. Built-in trust."

AlgoTrade is the unified API layer for algorithmic trading signals -- platform where any trader, bot, or AI agent discovers, subscribes to, and consumes signals from multiple providers through a single API key, single billing relationship, and single trust infrastructure.

Brand voice: Technical but accessible. Developer-first, not crypto-bro.

**5.2 GTM Channels (Priority Ranked)**

| Rank | Channel | Est. Cost | First Customer Timeline |
|------|---------|-----------|------------------------|
| 1 | Polymarket Discord + Telegram communities | $0 (organic) | 2-4 weeks |
| 2 | Twitter/X @AlgoTrade automated signal posting | $0 (infra built) | 4-6 weeks |
| 3 | Crypto Twitter influencer affiliates (20-25% revshare) | $0 upfront | 6-8 weeks |
| 4 | SEO content hub (30 posts/mo, long-tail keywords) | $0 (LLM-generated) | 8-12 weeks |
| 5 | Telegram bot distribution (@Sophia_Bbot pattern) | $0 (bot built) | Immediate |
| 6 | Product Hunt + BetaList launch | $0 | Week 1 burst |
| 7 | Polymarket ambassador program (refer 3 = 1 free month) | $0 (discount-based) | Ongoing |

**5.3 Content Pillars**

| Pillar | Frequency | Target Persona |
|--------|-----------|----------------|
| Signal Quality & Trust | 2x/week | Carl (retail), Farah (fund) |
| Bot Building Tutorials | 1x/week | Alice (developer) |
| Prediction Market Intelligence | 2x/month | All personas |
| Agent-Native Trading (MCP/x402) | 1x/week | Alice (developer) |
| Signal Provider Spotlights | 2x/month | Providers, all buyers |

**5.4 Growth Experiments**

| Experiment | Hypothesis | Metric | Threshold | Duration |
|------------|-----------|--------|-----------|----------|
| A: Free tier signal preview (5/wk) | Converts 5% to paid | Free->paid conversion | >3% | 30d |
| B: Referral program | Referral signups 2x paid CAC | Referral % of total paid | >15% | 60d |
| C: Polymarket maker-rebate signals | Post-Feb 2026 regime creates demand | Starter signups | >20 | 45d |
| D: Weekly accuracy leaderboard | Transparency drives trust | Trial->paid conversion | +10% | 30d |
| E: SendGrid 5-email drip | Sample -> case study -> pricing -> social proof -> urgency | Open/click rate | >25%/3% | 14d |

**5.5 90-Day KPI Targets**

| KPI | Target | Owner |
|-----|--------|-------|
| Paying subscribers | 50 | Revenue Agent |
| MRR | $2,000-3,500 | Revenue Agent |
| Free trial signups | 500+ | CMO Agent |
| Free -> paid conversion | >5% | CMO Agent |
| Published signal accuracy | >65% win rate | Product Agent |
| Twitter followers | +500 | CMO Agent |
| Telegram members | +300 | CMO Agent |

---

## 6. Sales & Pricing

**6.1 Sales Pipeline: 4-Stage Self-Serve**

| Stage | Definition | Trigger | Conversion Target |
|-------|------------|---------|-------------------|
| 1. Awareness | Developer lands on docs, discovers via MCP/Telegram/SEO | Subdomain visit, docs view | Page -> signup >8% |
| 2. Free Activation | Signs up FREE tier, makes first GET /feed | Time-to-first-signal <2 min | Signup -> API call >70% |
| 3. Paid Conversion | Upgrades to PRO after hitting free tier limits | Usage alert at 80% cap | Free -> PRO >8% (14d) |
| 4. Expansion | Upgrades to Enterprise or adds add-ons | Call volume and latency needs exceed PRO | PRO -> Enterprise >15% |

**6.2 Pipeline Mechanics (Month 6 Target)**

| Activity | Channel | Volume |
|----------|---------|--------|
| Self-serve signups | Developer portal, MCP, Telegram | 50+/week |
| Community acquisition | Trading Discord/Telegram, founder posts | 20-30 leads/week |
| Provider recruitment | Direct outreach, cross-reference | 10-20 outreach/month |
| Enterprise outbound | Founder-led, inbound after PR | 2-5 contacts/month |

**6.3 Sales Process Flow (Zero-Touch)**

Doc -> Sign up (FREE, no CC) -> API key (3 clicks) -> curl /feed (2 min) -> BROWSE providers -> HIT rate limit -> UPGRADE prompt -> NOWPayments checkout -> PRO activated -> Webhook delivery -> USAGE grows -> Enterprise upsell or Add-ons

**6.4 Sales Rules & Safeguards**

| Rule | Rationale | Enforcement |
|------|-----------|-------------|
| FREE tier has no credit card | Remove signup friction | NOWPayments gate only on PRO+ |
| No annual prepay for MVP | NOWPayments billing complexity. Defer to Phase 4. | Monthly-only at launch |
| Tier upgrades prorated, downgrades end-of-cycle | Standard SaaS fairness | Billing system logic |
| Cancel anytime, access through billing period | Right to exit, prevents chargebacks | Subscription system |
| No US retail until securities review | TOS firewall + jurisdiction gating at signup | Gate: jurisdiction selector |
| Usage alerts at 80%/100% | Prevent surprise overage, reduce churn | Email + Telegram bot |

**6.5 Enterprise Pricing (Custom)**

| Tier | Price | Typical User | SLA |
|------|-------|--------------|-----|
| Basic | $499/mo | Sub-$50M AUM fund, 3 seats | <4h response |
| Pro | $999/mo | $50-200M fund, 10 seats | <1h response |
| Premium | $1,999/mo | $200M+ fund, unlimited, white-label | <30min, dedicated |

**6.6 Platform Commission (Supply Side)**

| Category | Rate | Condition |
|----------|------|-----------|
| Standard provider | 15% of earnings | Default |
| Launch partner | 10% | First 10 providers (founding badge) |
| Enterprise referral | 10% | Provider brings own enterprise buyer |

---

## 7. Operations & Team

**7.1 Team Structure**

Solo founder/operator + 6 C-level AI agents via MekongMind orchestration. Zero human employees. Zero payroll.

| Role | Domain | Gate |
|------|--------|------|
| CEO Agent | Vision, portfolio, biz model, 5-year view | idea-intake -> company-blueprint |
| CTO Agent | Architecture, code quality, tech debt, infra | mvp-live -> post-mvp |
| COO Agent | Daily ops, monitoring, incidents, capacity | first-revenue |
| CMO Agent | Brand, community, growth, revenue channels | repeatable-channel |
| CDO Agent | Data quality, feeds, analytics, backtest integrity | scale-ready |
| CFO Agent | P&L, cost modeling, revenue ops | first-revenue |

12 subordinate specialists defined via SOPs but not independently instantiated: Quant Researcher, Risk Analyst, Market Analyst, ML Engineer, Backend Engineer, SRE Engineer, Data Engineer, Security Analyst, Financial Analyst, Growth Hacker, Product Analyst, Execution Specialist.

**7.2 Talent Acquisition Triggers**

| Role | Trigger |
|------|---------|
| Quant Analyst | Revenue >$5K/month (~50 Pro subscribers) |
| DevOps | 3+ exchanges live |
| Risk Manager | Portfolio >$50K |
| Trader Ops | 24/7 trading |

None triggered yet. First human hire is post-PMF.

**7.3 MekongMind Harness**

Integration via me-deep-wrapper: hooks inject goal/gate/bottleneck on session start, verify gate pre-work, record artifacts post-work. 8-gate progression: idea-intake -> company-blueprint -> offer-validated -> mvp-live -> first-revenue -> repeatable-channel -> fulfillment-stable -> scale-ready -> first-1m-mrr.

**7.4 Operations Infrastructure**

| Workflow | Automation | Volume | Stack |
|----------|-----------|--------|-------|
| Blog posts | Fully automated (LLM) | ~30/mo | DeepSeek R1 |
| Twitter/X posting | Auto-posted | ~30/mo | Twitter API v2 |
| Telegram channel posts | Auto-posted | Bundled | grammy bot |
| Email drip campaigns | Automated | Nurture sequences | SendGrid |
| Referral program | Auto-tracked | Viral loop | Custom |
| Incident response | P0-P4 escalation | On-demand | Prometheus + Grafana + Sentry |

**7.5 Incident Response (P0-P4)**

| Priority | Definition | Response Time | Escalation |
|----------|-----------|---------------|------------|
| P0 | Capital at risk | Immediate | CEO Agent |
| P1 | Exchange down, strategy failing | <15 min | Founder |
| P2 | Performance degraded | <1 hour | Self-resolve |
| P3 | Minor issue | <24 hours | Self-resolve |

---

## 8. Finance & Fundraising

**8.1 Current Cap Table**

| Holder | Stake | Basis |
|--------|-------|-------|
| billwill (founder) | 100% | Sweat equity: 731 commits, 886 files, 52+ strategies, 3,194 tests |
| Option pool | 0% (unallocated) | Carve 10% post-money post-close |
| Total | 100% | $0 capital raised, $0 revenue, $0 burn |

**8.2 Fundraising Ask (Recommended Pre-Seed)**

| Parameter | Proposed | Rationale |
|-----------|----------|-----------|
| Round | Pre-seed (Friends & Family / Angel) | No institutional traction, pre-revenue |
| Target | $50K-$150K | 12-18 months solo-operator runway |
| Post-money valuation | $1.5M-$3M | Solo developer platform with production codebase |
| Dilution at $100K | 3.3%-6.7% | Founder retains control |
| Option pool | 10% post-money | Reserved for future hires, advisors |
| Instrument | SAFE with MFN | Simple, standard, no maturity risk |

**8.3 Use of Funds ($100K Scenario)**

| Use | Amount | Detail |
|-----|--------|--------|
| Infrastructure hardening (Phase 0) | $15K | D1 migration, API consolidation, OpenAPI spec, legal review |
| Developer portal + docs | $20K | Self-serve onboarding, interactive API docs, MCP server |
| Marketing GTM | $25K | Community seeding, SEO, trading community sponsorships, referral incentives (6 months) |
| Compliance & legal | $10K | Securities law firewall review, jurisdiction gating, TOS, provider agreements |
| Solo operator runway | $30K | 6 months at $5K/mo. Extends to 12mo if burn optimized. |

**8.4 Financial Projections (3 Scenarios)**

| Metric | Bear (30%) | Base (50%) | Bull (20%) |
|--------|-----------|-----------|------------|
| Month 6 MRR | $500 | $3,000 | $12,000 |
| Month 12 MRR | $2,000 | $15,000 | $50,000 |
| Month 12 ARR | $24K | $180K | $600K |
| Paying subscribers (M12) | 15-25 | 150-200 | 400-600 |
| Path to $1M ARR | Unlikely (<10%) | 24-30 months | 12-18 months |
| Runway consumed | $60K (12mo) | $60K (12mo) | $60K (12mo; revenue-positive by M9) |

**Key variable:** Single largest factor is not product quality but customer acquisition cost and channel leverage. If signups >50/week by Phase 2 and free-to-paid >8%, the $1M ARR path is reachable in 24 months.

**8.5 AARRR + OKR Framework**

| AARRR Stage | Key Metric | Target (M6) | Owner |
|-------------|------------|-------------|-------|
| Acquisition | Signups/week | >50 | CMO Agent |
| Activation | Time-to-first-signal | <2 min median | Product Agent |
| Retention | Weekly Active API Keys | >60% of signups | Product Agent |
| Revenue | MRR | $5K+ | Revenue Agent |
| Referral | Invite signups/total | >15% | CMO Agent |

**North Star Metric:** Monthly Active Signal Consumers (MASC) -- count of unique API keys (human + agent) with successful signal requests trailing 30d.

**8.6 Kill Criterion**
Month 9 MRR < $1K AND burn > $5K/mo AND no strategic partnership in pipeline -> pivot to open-source + enterprise licensing for signal fusion IP.

---

## 9. Legal & Risk

**9.1 Risk Register (Consolidated, Ranked)**

| # | Risk | Layer | Prob | Impact | Status | Mitigation |
|---|------|-------|------|--------|--------|------------|
| R1 | In-memory subscriber state lost on restart | Codebase | Certain | Critical | ACTIVE -- P0 | Migrate to D1 before any paid tier |
| R2 | 3 overlapping subscribe implementations | Codebase | Certain | High | ACTIVE -- P0 | Consolidate to single router |
| R3 | No OpenAPI spec blocks dev adoption | GTM | Certain | High | ACTIVE -- P0 | Generate from code, public before Phase 1 |
| R4 | Securities law exposure (US retail) | Legal | Low-Med | Critical | ACTIVE -- P0 | Legal review, jurisdiction gating, TOS firewall |
| R5 | Zero-to-one adoption failure | GTM | Medium | Critical | MONITOR | Seed with 50 invited devs, Telegram existing base |
| R6 | Key-person dependency (solo founder) | People | High | Critical | ACCEPTED | Document SOPs, automate, hire post-$200K MRR |
| R7 | No third-party signal providers | Marketplace | Medium | Critical | MONITOR | Internal signals seed marketplace |
| R8 | Free tier cannibalizes paid | Revenue | Medium | Medium | ACCEPTED | Aggressive rate limits on free |
| R9 | Prediction market accuracy ceiling (67%) | Product | Low-Med | High | MONITOR | Cross-venue filtering, multi-provider fusion |
| R10 | x402 adoption too slow | Revenue | Low | Low | ACCEPTED | Subscription is primary model |
| R11 | API abuse / credential sharing | Security | Medium | Medium | MONITOR | Rate limits per key, anomaly detection |
| R12 | LLM inference cost creep | Cost | Low-Med | Medium | MONITOR | Batch-oriented fusion, MLX on M1 Max = $0 inference |
| R13 | Agent quality failure affects customers | Ops | Medium | Medium | MONITOR | Human-in-the-loop for payment/support/legal actions |
| R14 | Competitor copies MCP + x402 model | Market | Medium | Medium | ACCEPTED | First-mover in prediction market signals |
| R15 | Polymarket rule changes break pipeline | Regulatory | Medium | High | MONITOR | Multi-venue architecture absorbs exchange-specific logic |

**9.2 Immediate Legal Actions (Pre-Revenue Window)**

| Priority | Action | Cost | Due |
|----------|--------|------|-----|
| P0 | Incorporate (Delaware C-Corp or Wyoming LLC) | $300-1K | Before first paid subscriber |
| P0 | Engage securities counsel for TOS review | $2-5K | Before paid tier launch |
| P0 | Implement US retail jurisdiction gating at signup | Dev time (0.5 sprint) | Before paid tier launch |
| P0 | Define Solo Succession Protocol (encrypted offline doc) | Free | This week |
| P1 | File USPTO trademark "AlgoTrade" | $250-350 | This quarter |
| P1 | Integrate QuickBooks/Xero from NOWPayments IPN logs | 1 sprint | Before $1K MRR |
| P2 | Patent signal fusion methodology | $5-15K | Pre-Series A |
| P2 | Appoint advisory board (2 members, 0.5-1% equity) | Equity | Pre-Seed round |

**9.3 Securities Law Exposure (Signal-as-a-Service)**

Core question: Do trading signals constitute "investment advice" (regulated) or "data products" (unregulated)?

AlgoTrade's position: Signals are probabilitistic model outputs presented as `{direction: "long"|"short"|"neutral", confidence: 0.67, reason: "regime_detection:trend_following"}`. NOT buy/sell recommendations. TOS states: "AlgoTrade Signals are data outputs. Not investment advice. Not a recommendation to buy/sell."

| Exposure | Severity | Action Required |
|----------|----------|-----------------|
| SEC -- signal = investment advice | HIGH | Securities counsel pre-Phase 2. No performance-based pricing (triggers Howey). |
| CFTC -- prediction market signals | MEDIUM | Separate TOS sections for Polymarket (non-US) vs Kalshi (CFTC). |
| EU/AU -- regulatory divergence | LOW | Geo-block EU during MVP. |

**9.4 Compliance Infrastructure**

| Capability | Status | Gap |
|------------|--------|-----|
| Sanctions screening (`SANCTIONS_001`) | Built | Sanctions list is empty -- needs OFAC SDN list API integration |
| Position limits (`POSITION_001`) | Built | $1M hardcoded -- needs tier-configurable limits |
| Jurisdiction gating (`JURISDICTION_001`) | Built | Blocks KP/IR/SY/CU -- needs US-based detection for retail gating |
| Volume limits (`VOLUME_001`) | Built | $100K single trade -- needs per-tier config |
| KYC routes | Built | BYOK Persona -- basic/advanced/full tiers. No proof-of-personhood. |
| Privacy Policy | Missing | Draft before paid tiers |
| `DELETE /api/v1/account` | Not built | GDPR right-to-deletion endpoint needed |

**9.5 ESG Assessment**

| Dimension | Assessment | Action |
|-----------|-----------|--------|
| Environmental | Low impact. Cloud Workers + D1 are negligible. ML on M1 Max (65W TDP), not datacenter GPU. | Offset compute at >$5K/mo cloud spend threshold. |
| Social | Crypto trading is high-risk. AlgoTrade bears no fiduciary duty but should not gamify risk. | No "double or nothing" language. Risk disclaimer on every dashboard and API response. |
| Governance | Solo founder + 6 AI agents. No board, no independent directors. Centralized decision-making. | Document decision authority. Agent SOPs must include escalation rules. |

---

## 10. Agentic & AI Architecture

**10.1 MekongMind Solo-Company Orchestration**

AlgoTrade operates as a solo-company via MekongMind (me-deep-wrapper) harness with 6 C-level agents. No human employees. Full SDLC: Specification -> Design -> Code -> Deploy, each phase with gate evidence.

**Key stat:** 6 C-level departments at $0 salary. 30 blog posts + 30 social posts/mo auto-generated at zero marginal cost. Effective team-of-5 output at solo-operator burn.

**10.2 AI Co-Pilot (Technical Moat)**

| Component | Role | Performance |
|-----------|------|-------------|
| DeepSeek R1 (local, MLX) | Primary signal reasoning engine | 8-15 tokens/s |
| Nemotron-3 Nano (local, MLX) | Fast ensemble validation | 35-50 tokens/s |
| Regime detection | Market state classification (trending, ranging, volatile) | Adaptive weight adjustment |
| Ensemble voting | Cross-validates signals across 52+ strategies | Eliminates single-model hallucination |
| Paper trading engine | Simulated P&L tracking | +$2,251, 66.7% win rate, 14.6% arbitrage edge |

**Critical:** Runs on M1 Max bare metal (Metal GPU) -- NOT in Docker. Docker cannot access Metal GPU.

**10.3 AI-Native Product Features (Planned)**

| Feature | Phase | Revenue Model | Status |
|---------|-------|--------------|--------|
| MCP server for signal discovery | 1 | Free discovery, paid consumption | Planned |
| x402 pay-per-signal (HTTP 402 + USDC on Base) | 3 | $0.01-0.05/call | Planned |
| Agent self-onboarding (zero human touch) | 3 | Unlocks autonomous agent market | Planned |
| Fusion engine (ML-weighted multi-provider) | 3 | $49/mo add-on | Planned |
| Agent subscription pooling (multi-agent quota) | 3 | $99/10K calls | Planned |
| Self-learning weight optimization | 3 | Included in fusion premium | Planned |

**10.4 Content Automation Pipeline**

1. DeepSeek R1 generates prediction market analysis + trade signal copy (30 posts/month)
2. Twitter/X API v2 auto-posts signal content with link to signup landing page
3. Telegram bot distributes daily picks, handles /subscribe -> NOWPayments
4. SendGrid email drip triggers on free-tier trial signup (5-email sequence)
5. SEO content hub publishes blog posts to capture long-tail keyword traffic

**10.5 Trust Architecture (for Marketplace)**

| Mechanism | Phase | Purpose |
|-----------|-------|---------|
| On-chain hash commitment | 1 | Publish-time signal fingerprint on Base L2. Immutable audit trail. |
| Provider bonding + slashing | 2 | Collateral proportional to tier, slashing for misrepresentation |
| Burn-to-unlock dispute | 2 | Stake tokens to trigger independent expert review |
| Transparency dashboard | 1 | Real-time provider accuracy scoreboard |
| Standardized quality score | 1 | Decay-weighted, 3-month window, verified accuracy |
| Privacy-scoped feed (ZK tier) | 4+ | Encrypted payload, verified source |

**10.6 Agentic Risks**

| Risk | Severity | Mitigation |
|------|----------|------------|
| Key-person dependency on billwill | Critical | Agent SOPs document knowledge, but no human backup for strategic decisions. Accept pre-revenue. |
| Agent orchestration quality variability | Medium | MekongMind harness stable (731 commits), but LLM quality fluctuates. Human-in-the-loop for payment/support/legal. |
| Autonomous spending risk | Low-Med | No agent has spending keys currently. Budget controls needed if x402 goes live. |
| A2A protocol fragility | Low | MCP tools reliable in testing, untested under production load. |

**10.7 Cap Table Guidance (Agentic)**

No equity carve for agent roles. Agents are tools, not stakeholders. The department SOPs in `sops/departments/` are proprietary operational IP that should be treated as an asset in acquisition diligence. First human hire recommended only after $200K+ MRR justifies salary.

---

## Key Unresolved Questions

1. **Brand identity:** Should the landing page rebrand from CashClaw to AlgoTrade, or keep CashClaw as product brand under AlgoTrade company?
2. **Revenue priority:** Does Signals API ($29/mo BASIC) launch before Starter bot tier ($19/mo), or simultaneously?
3. **First customer:** Which specific trading community gets the inaugural invite? Need a named Discord/Telegram group.
4. **Annual billing:** NOWPayments 20% prepay discount is deferred. Is this a competitive disadvantage against TradingView and 3Commas annual pricing?
5. **Jurisdiction gating precision:** Geo-IP blocking US at signup is coarse but safe. Does the cost (losing US devs for Beta) justify the SEC risk? Recommended: block for Phase 1, revisit post-counsel.
6. **US securities review timeline:** Who engages counsel, and how long does TOS review take? Phase 2 (paid tiers) cannot launch without it.
7. **MCP-first or REST-first for GTM:** Research says MCP is table-stakes for 2026. Is MCP a launch requirement or Phase 2 feature?
8. **Content separation:** Should blog content stream be dedicated to signals marketplace or shared with existing algo-trader feed? Repurposing is zero-cost but dilutes positioning.
9. **Vietnamese content scope:** Do all signals marketplace docs need bilingual (Sophia Handover Rules), or only dashboard/billing? API docs in English only?
10. **Agent vs human attribution:** Can we reliably distinguish API calls from AI agents vs human developers for OKR tracking?
11. **Patent vs trade secret:** Patent publishes fusion methodology (competitive transparency) but creates IP asset. Trade secret keeps method hidden. Trade-off depends on exit strategy.
12. **Advisory board timing:** Appoint advisors now (pre-revenue) for guidance, or post-PMF when there is something concrete to advise on?
