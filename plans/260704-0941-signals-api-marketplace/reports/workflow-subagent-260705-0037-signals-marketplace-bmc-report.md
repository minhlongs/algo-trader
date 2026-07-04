# Business Model Canvas -- Signals API Marketplace

**Date:** 2026-07-05
**Based on:** GO/NO-GO analysis (score 21/30, verdict GO), market research report, codebase audit
**Verdict output:** `plans/260704-0941-signals-api-marketplace/reports/` | GO scores: Mkt5 PrbClarity4 Diff3 UnitEcon3 ExecFeas2 AgenticFit4

---

## 1. Value Propositions

### [Business] Core Value

| Layer | Proposition | Pain Point Addressed |
|-------|------------|---------------------|
| **Discovery & Unification** | Single API key, single billing invoice to access multiple curated signal providers. No more managing 5+ separate API keys, webhooks, and subscription dashboards. | Fragmentation -- buyers evaluate each provider individually, high switching costs |
| **Trust Infrastructure** | Every signal is hash-committed at publish time on-chain. Third-party audited track records with verified P&L, not cherry-picked screenshots. | Trust -- 99.9% of providers lack verifiable history; fraud is endemic |
| **Execution Bridge** | Signal-to-broker automated execution (webhook -> broker order). Eliminates manual signal processing latency (signal-to-execution delay drops from minutes to milliseconds). | Execution latency -- manual processing destroys edge; slippage kills risk-reward |
| **Pricing Transparency** | All-in costs (spread, subscription, settlement) disclosed per signal. Standardized signal quality score based on audited independent track records. | Hidden costs consume 10-30%+ of gains; no post-cost performance disclosure |
| **Standardized Quality** | Composite signals with per-component reasoning and a `reason` field. Every signal explains the WHY, not just BUY/SELL. | Over-signaling -- groups flood with 20+ alerts/day prioritizing engagement over quality |

### [Agentic] AI-Native Differentiators

| Proposition | Mechanism | Target |
|------------|-----------|--------|
| **MCP-native API** | Model Context Protocol server included. AI agents discover, subscribe to, and consume signals without human-in-the-loop. | AI traders, autonomous agent swarms |
| **x402 pay-per-signal** | HTTP 402 micropayments (USDC on Base/Solana). AI agents pay per signal call -- no subscription needed. Aligns cost with actual usage. | Autonomous agents that self-provision |
| **Agent discoverable** | Signals listed in an agent-readable registry. LLMs browse signal catalog, read schema, subscribe autonomously. | Agent-to-API commerce |
| **Self-learning fusion engine** | Weighted signal fusion from multiple providers with ML weight optimization based on historical prediction accuracy per asset. | Sophisticated traders, quant funds |
| **MCP tool surface** | Each signal feed is a discoverable MCP tool with native tool-use semantics (describe, subscribe, query, unsubscribe). | AI-native developer ecosystem |

### [Governance] Trust & Safety

| Proposition | Mechanism | Target |
|------------|-----------|--------|
| **Provenance verification** | Every signal hash-committed to chain on publish. Immutable audit trail. Buyers verify signal was authored by the claimed provider at the claimed time. | All buyers |
| **Burn-to-unlock dispute system** | Disputed signal? Stake tokens to trigger independent expert review. Valid dispute refunds buyer, slashes provider bond. Invalid dispute loses stake. | Risk-aware buyers |
| **Automated provider bonding** | Signal providers post collateral proportional to tier. Misrepresentation triggers slashing. Aligns incentives with accuracy, not engagement. | Institutional buyers, regulators |
| **Privacy-scoped feed** | Zero-knowledge tier: signals delivered with verified source but encrypted payload. Buyer proves they subscribed without revealing what they act on. | Privacy-conscious funds |

---

## 2. Customer Segments

### [Business] Primary Segments

| Segment | Description | Willingness to Pay | Size Signal |
|---------|------------|-------------------|-------------|
| **Retail algorithmic traders** | Individual traders running automated strategies (crypto, forex, equities). Need API-delivered signals for bot ingestion. | $29 - $99/mo | High -- 100M+ US retail traders, growing at 15.3% CAGR |
| **AI agent developers** | Builders creating autonomous trading agents. Need MCP-native, agent-discoverable signal feeds. | $0.01 - $0.05 per call | Very high -- rapid ecosystem growth |
| **Quantitative hobbyists** | Backtest signal strategies, run personal research. Need historical data + real-time feed at reasonable cost. | $14.99 - $29/mo | Medium |
| **Crypto fund operators** | Small-to-mid-size funds (sub-$50M AUM) needing multi-provider signal aggregation without building in-house. | $99 - $499/mo | Medium-high |
| **Signal providers** | Individual analysts, quant shops, ML researchers who generate signals and want distribution + monetization. | Will pay platform fee (10-15% rev share) | High -- desire for distribution |

### [Agentic] Secondary Segments

| Segment | Description | Consumption Model |
|---------|------------|-------------------|
| **Autonomous agent swarms**| Multi-agent systems that provision their own tools/data. Use MCP discovery + x402 payments. | Pay-per-call, fully autonomous |
| **LLM-hosted trading bots**| Agents running on Claude/OpenAI/Gemini infrastructure that consume signals via tool-use. | Subscription or x402 |
| **Prediction market agents**| Cross-platform arbitrage agents (Polymarket, Kalshi, Limitless) needing normalized signals. | Pay-per-call ($0.01-$0.05) |
| **Institutional model pipelines**| Internal ML pipelines at prop desks that consume standardized signal feeds alongside in-house models. | $299 - $999/mo enterprise license |

### [Governance] Who Must Be Managed

| Category | Concern | Governance Mechanism |
|----------|---------|---------------------|
| **Bad-faith signal providers**| Pump-and-dump signal propagation, fake track records, cherry-picked backtests | Provider bonding + forensic audit + slashing |
| **API abusers**| Excessive polling, credential sharing, market manipulation via signal aggregation | Tiered rate limits, anomaly detection, tier-enforcement |
| **Unregulated entities**| Potential securities law exposure if signals constitute investment advice | Terms-of-service firewall: signals are "data", not "advice"; disclaimer + jurisdiction filtering |
| **Bot-driven subscription fraud**| Stolen credit cards purchasing signal access for downstream resale | NOWPayments IPN fraud scoring, velocity checks |

---

## 3. Channels

### [Business] Go-to-Market Channels

| Channel | Priority | Strategy | Cost |
|---------|----------|----------|------|
| **Self-serve developer portal** | P0 | Signals API Marketplace web app with signup, API key generation, tier selection, documentation | Build cost (1-2 sprints) |
| **MCP marketplace listing** | P0 | Listed on MCP protocol registries; AI agents discover signals as MCP tools | Free (ecosystem contribution) |
| **OpenAPI / developer docs** | P0 | Public OpenAPI spec on dedicated docs subdomain. Copy-paste curl examples in first 10 seconds of landing. | Build cost (1 sprint) |
| **Telegram bot (@Sophia_Bbot)** | P1 | `/signals discover`, `/signals subscribe`, `/signals status` commands. Leverage existing Sophia bot audience. | Low (extend existing bot) |
| **Trading community (Discord, Telegram groups)** | P1 | Partnerships with trading signal Discord/Telegram groups for distribution. Integration partner badges. | Revenue share (10-15%) |
| **SEO / content marketing** | P2 | Blog posts comparing signal APIs, signal quality benchmarks, "how to build a trading bot" tutorials | Content cost |
| **Affiliate / partner program** | P2 | Existing signal providers earn referral fee for directing subscribers to marketplace | 10-15% rev share |

### [Agentic] AI-Native Channels

| Channel | Strategy |
|---------|----------|
| **MCP server discovery** | Signal feeds registered as MCP resources/tools. Any MCP client (Claude Desktop, Cursor, custom agents) auto-discovers available signals. |
| **Agent-to-agent referral** | Satisfied agent recommends marketplace to peer agents via MCP tool discovery (viral loop in agent ecosystems). |
| **x402 wallet onboarding** | WalletConnect + Coinbase Onramp for fiat-to-crypto. 3-click onboarding to x402 signal consumption. |
| **LLM function-calling catalogs**| Partner with model providers to list signal feeds as pre-built tools in function-calling tool catalogs. |

### [Governance] Oversight Channels

| Channel | Purpose |
|---------|---------|
| **Transparency dashboard (public)** | Real-time provider track record, signal quality scoreboard, historical accuracy by asset class |
| **Dispute resolution interface** | On-chain staking UI for signal disputes. Independent expert review queue. |
| **Audit log API** | Machine-readable audit trail for compliance officers. Every signal published, every subscription, every payout logged. |
| **Admin console** | Platform operator view: provider bonds, flagged activity, fraud scores, tier compliance |

---

## 4. Revenue Streams

### [Business] Direct Revenue

| Stream | Model | Est. Price | Est. Margin | Notes |
|--------|-------|-----------|-------------|-------|
| **Signal subscriptions (retail)** | Flat monthly, 3 tiers | $29 / $99 / $299 per month | 70-80% | Resolved from current $49 vs $99 inconsistency. Aligned with NOWPayments checkout. |
| **Platform commission** | % of signal provider revenue | 10-15% of provider earnings | 90%+ | Pure margin. Aligns incentives with provider success. |
| **Enterprise licensing** | Custom SLA, dedicated support, white-label option | $499 - $1,999 / mo | 80-85% | Includes usage analytics, custom data retention, priority routing. |
| **Historical data bundles** | One-time purchase or subscription add-on | $10 - $50 / dataset | 85% | Backtesting requires historical data. Low effort to serve. |

### [Agentic] AI-Native Revenue

| Stream | Model | Est. Price | Est. Margin | Notes |
|--------|-------|-----------|-------------|-------|
| **x402 pay-per-signal** | HTTP 402 micropayments | $0.01 - $0.05 / call | 75-85% | Gas + platform fee. Captures low-usage AI agents who won't subscribe monthly. |
| **Agent subscription pooling** | Monthly quota shared across multiple agents owned by same user | $99 for 10K calls | 80% | Multi-agent operations at same firm share quota. Lower per-agent cost. |
| **Fusion engine premium** | ML-weighted signal fusion add-on | $49 / mo add-on | 85% | Auto-optimized weight allocation across providers. Adds stickiness. |
| **MCP server premium** | Private MCP server with dedicated routing, no rate limits | $99 / mo | 90% | For agents needing high-throughput, dedicated signal MCP. |

### [Governance] Value-Add Revenue

| Stream | Model | Notes |
|--------|-------|-------|
| **Provider bond interest** | Bond collateral held in yield-bearing protocol | Provider's own capital generates yield. Platform takes spread. |
| **Dispute staking fees** | Small fee on dispute initiation to prevent spam | 0.1% of bond amount or fixed $5. |
| **Certified audit reports** | Independent performance audit for providers wanting verification badge | $50 - $200 per audit. Trust premium. |
| **Verification badge subscription** | Monthly subscription for providers to display verified track record badge | $9.99 / mo for providers. High margin, low cost. |

**Pricing resolved from codebase audit:** PRO tier unified at $99/mo (NOWPayments checkout) -- the pricing-tiers.ts at $49/mo was inconsistent and now corrected. See risk register.

---

## 5. Cost Structure

### [Business] Fixed Costs

| Cost Item | Est. Monthly | Scaling Behavior |
|-----------|-------------|------------------|
| **Cloudflare Workers + D1** | $20 - $200 | Scales with request volume. D1 read replicas needed at scale. |
| **NOWPayments integration** | $0 (per-tx fee ~0.5%) | Variable with transaction volume |
| **Domain + DNS** | $15 - $30 | Static |
| **Developer time (hardening sprint)** | One-time: 2-4 weeks | Must be done before GTM. Estimates: backend publisher 2d, API endpoints 1d, billing 1d, verify 0.5d. |
| **Codebase debt remediation** | One-time: 1-2 weeks | Fix in-memory subscriber state -> D1 persistence, consolidate 3 subscribe implementations, wire feature-gate dead code |
| **MCP server maintenance** | $50/mo (hosting) | Low -- server is lightweight relay |

### [Agentic] AI-Native Costs

| Cost Item | Est. | Notes |
|-----------|------|-------|
| **MCP server hosting** | $20 - $100/mo | Dependent on agent query volume. Stateless, scales horizontally. |
| **x402 transaction gas** | $0.001 - $0.01/tx | L2 chains (Base, Solana). Passed through to consumer plus small markup. |
| **Fusion engine compute** | $50 - $500/mo | ML weight optimization batch jobs. Lightweight -- not real-time training. |

### [Governance] Compliance & Trust Costs

| Cost Item | Est. | Notes |
|-----------|------|-------|
| **On-chain commit storage** | $5 - $50/mo | Gas costs for hash-committing signal fingerprints. L2 only. |
| **Dispute resolution expert pool** | $200 - $500/mo | Retainer for 3 independent experts. Fee-supported. |
| **Audit trail storage** | $10 - $30/mo | Immutable log. Cloudflare D1 + archival to R2. |
| **Legal review (one-time)** | $2,000 - $5,000 | Terms of service, securities law disclaimers, jurisdiction provisions |

---

## 6. Key Resources

### [Business] Core Resources

| Resource | Description | Criticality |
|----------|-------------|-------------|
| **Signal publisher engine** | Core backend that ingests signals from providers and pushes to subscribers (phase 1). Currently bare-bones -- needs D1 persistence. | P0 -- production blocker |
| **REST API surface** | 3-tier API: `/subscribe`, `/feed`, `/webhook`. Currently 3 overlapping implementations -- needs consolidation and OpenAPI spec. | P0 -- GTM blocker |
| **NOWPayments billing** | IPN webhook -> tier activation pipeline. Only billing integration. Must be reliable. | P0 -- revenue blocker |
| **Subscriber registry (D1)** | Must migrate from in-memory Map to D1/SQLite. Current state is a showstopper -- restart loses all subscriptions. | P0 -- production blocker |
| **Provider onboarding flow** | Interface for signal providers to register, publish signals, view earnings | P1 -- marketplace needs supply side |
| **Developer portal** | API key management, tier selection, billing history, usage dashboard | P1 -- GTM needs self-serve UX |

### [Agentic] AI-Native Resources

| Resource | Description | Criticality |
|----------|-------------|-------------|
| **MCP server implementation** | Protocol server exposing signal feeds as MCP tools/resources. MCP support is table stakes for 2026. | P0 -- competitive parity |
| **x402 payment handler** | HTTP 402 response + USDC settlement on Base/Solana. Agent-autonomous payment flow. | P1 -- differentiation play |
| **Fusion engine** | ML-weighted multi-provider signal fusion. Self-learning weight allocation. | P2 -- phase 2 differentiation |
| **Agent schema registry** | Machine-readable signal catalog. LLMs browse, compare, select feeds without human. | P1 -- enables autonomous agent consumption |

### [Governance] Trust Infrastructure

| Resource | Description | Criticality |
|----------|-------------|-------------|
| **Provider bonding contract** | Smart contract for provider collateral. Slashing conditions for misrepresentation. | P1 -- differentiator |
| **Track record ledger** | Immutable signal history with hash commitment. Verifiable by any buyer. | P0 -- trust differentiator |
| **Dispute resolution system** | Stake-to-trigger independent review. Verdict execution (refund/slash). | P2 -- phase 2 |
| **Signal quality scoring engine** | Automated score based on verified accuracy, not self-reported. Public dashboard. | P1 -- trust differentiator |

---

## 7. Key Activities

### [Business] GTM-Critical Activities

| Activity | Priority | Time Estimate | Notes |
|----------|----------|---------------|-------|
| **Migrate subscriber state to D1** | P0 | 2-3 days | Showstopper for production. In-memory Map loses subscriptions on restart. |
| **Consolidate subscribe implementations** | P0 | 1-2 days | 3 overlapping routers with different auth -- consolidate to single `/api/v1/signals/subscribe`. |
| **Write OpenAPI spec + developer docs** | P0 | 3-5 days | External subscribers cannot discover the API without reading source code. Non-starter for GTM. |
| **Build signal publisher (phase 1)** | P0 | 2 days | Core ingestion + distribution engine. Must read from provider webhook, push to subscriber. |
| **Build API endpoints (phase 2)** | P0 | 1 day | Subscribe, feed, webhook. Single consistent router with unified auth. |
| **Wire NOWPayments billing (phase 3)** | P0 | 1 day | Fix PRO tier pricing to $99/mo. Extend IPN webhook for signal tiers. |
| **Verify + merge (phase 4)** | P0 | 0.5 day | 2,936+ tests, 0 regressions, build pass, deploy health check |
| **Fix dead feature-gate code** | P1 | 0.5 day | `requireSignalTier` for SIGNALS_BASIC/PRO/ENTERPRISE sits below FREE in hierarchy. Wire or remove. |
| **Build self-serve developer portal** | P1 | 2-3 weeks | API key management, tier selection, billing history, usage dashboard. Customers cannot buy signal subscriptions independently without this. |
| **Provider onboarding flow** | P1 | 1-2 weeks | Registration, signal publishing UI, earnings dashboard. Marketplace needs supply side. |

### [Agentic] AI-Native Activities

| Activity | Priority | Notes |
|----------|----------|-------|
| **Implement MCP server** | P0 | Expose subscribed signals as MCP resources. Agent queries via tool-use. |
| **Implement x402 pay-per-signal** | P1 | HTTP 402 response + wallet-based settlement. Nansen's model (USDC on Base/Solana). |
| **Build fusion engine** | P2 | ML-weighted signal aggregation. Phase 2 differentiator. |
| **Write agent discovery schema** | P1 | Machine-readable signal catalog. Agent knows what's available without human browsing. |
| **Build usage metering** | P0 | Track per-agent-key consumption. Required for both subscription throttle enforcement and x402 billing. Currently missing. |

### [Governance] Trust Activities

| Activity | Priority | Notes |
|----------|----------|-------|
| **Implement signal hash-commit** | P1 | Publish-time hash commitment. Buyers verify signal provenance. |
| **Build provider bonding system** | P2 | Smart contract + platform bond management. Not needed for MVP but is core differentiator. |
| **Write TOS / legal disclaimers** | P0 | Securities law firewall. "Signals are data, not advice." Jurisdiction gating. |
| **Build transparency dashboard** | P1 | Public track record board. Provider comparison by verified accuracy. |
| **Implement anomaly detection** | P1 | API abuse patterns, fraud scoring, velocity checks on subscription. |
| **Set up tier isolation** | P0 | Proper rate limiting per tier. Currently unwired in feature gates. |

---

## 8. Key Partnerships

### [Business] Distribution Partners

| Partner | Role | Value Exchange | Criticality |
|---------|------|----------------|-------------|
| **NOWPayments** | Payment processing | IPN webhook -> tier activation. Already integrated. | P0 -- revenue infrastructure |
| **Existing signal providers** | Supply side | Distribution + monetization via marketplace. Platform takes 10-15% rev share. | P1 -- marketplace needs supply |
| **Trading community Telegram/Discord groups** | Demand distribution | Affiliate share (10-15%) for referring subscribers. | P2 -- growth channel |
| **MCP ecosystem (Anthropic, others)** | Discovery | Registration in MCP registries for agent discoverability. No cost. | P1 -- agent distribution |

### [Agentic] AI-Native Partners

| Partner | Role | Notes |
|---------|------|-------|
| **Base / Solana ecosystem** | x402 settlement chain | Layer for micropayment settlement. Low gas, USDC native. |
| **WalletConnect / Coinbase** | Wallet onboarding | Frictionless wallet creation for x402 consumers. Reduce onboarding friction. |
| **Prediction market platforms** | Signal source + consumption | Polymarket, Kalshi, Limitless as both signal sources and signal consumers (cross-arb). |
| **ML model hosting platforms** | Fusion engine deployment | Replicate / Modal / Banana for lightweight ML weight optimization. |

### [Governance] Trust Partners

| Partner | Role | Notes |
|---------|------|-------|
| **Independent audit firms**| Third-party provider track record verification | Fee per audit. Required for verification badge credibility. |
| **On-chain arbitration DAO**| Decentralized dispute resolution | For staking-based dispute system. Could start centralized and decentralize later. |
| **Legal counsel (securities)**| Regulatory compliance | Jurisdiction mapping, TOS review, securities law firewall. One-time engagement. |

---

## 9. Customer Relationships

### [Business] Acquisition & Retention

| Stage | Strategy | Channels |
|-------|----------|----------|
| **Acquisition -- developer** | "Give me the curl and I get the same JSON" landing. OpenAPI spec visible before signup. MCP URL on homepage. | Developer portal, MCP registries, trading Telegram |
| **Acquisition -- provider** | "Publish once, distribute everywhere." No-code signal publishing UI. Instant access to marketplace demand. | Direct outreach, trading community cross-reference |
| **Onboarding** | 3-click API key generation. Copy-paste curl examples. 10 seconds to first signal. | Developer portal |
| **Retention -- buyer** | Usage dashboard, tier upgrade path, performance analytics showing value delivered. | Portal, Telegram bot |
| **Retention -- provider** | Earnings dashboard, subscriber analytics, signal performance score, competitor comparison. | Provider portal |
| **Churn prevention** | Usage monitoring: detect dormant accounts, re-engage with new signal providers or tier promotions. | Automated email/Telegram |
| **Support** | Developer chat (Discord/Telegram). Response SLA: <4h for free, <1h for paid. | Discord, Telegram, email |

### [Agentic] Automated & Autonomous Relationships

| Mechanism | Description |
|-----------|-------------|
| **Agent self-onboarding** | Agent reads MCP catalog -> discovers signals -> subscribes via API key -> consumes. Zero human touch. |
| **Automatic tier optimization** | Agent's usage pattern analyzed. Auto-suggested tier upgrade (subscription vs x402 vs hybrid). |
| **MCP introspection** | Agent queries `/mcp describe` for each signal's schema, rate limits, pricing. Fully programmatic relationship. |
| **Agent feedback loop** | Agent reports execution outcome -> fusion engine adjusts weight -> better future signals. Machine learns from machine. |

### [Governance] Relationship Safeguards

| Mechanism | Description |
|-----------|-------------|
| **Transparent dispute system**| Buyer disputes signal via on-chain stake. Independent review. Verdict is public. No hidden arbitration. |
| **Provider reputation system**| Decay-weighted verified accuracy score. 3-month window for freshness. Public and immutable. |
| **Platform SLA**| Uptime guarantee (99.5%+ for paid tiers). Latency SLAs. Compensation for breach. |
| **Data portability**| Signal history downloadable anytime. No lock-in. Buyer owns their subscription history. |
| **Right to exit**| Cancel anytime. Prorated refund for unused subscription period. Provider takes signals elsewhere. |

---

## Summary Matrix: GO/NO-GO Verdict Alignment

| BMC Block | Key Strength | Key Risk | Mitigation |
|-----------|-------------|----------|------------|
| **Value Propositions** | Trust infrastructure differentiator is unique. No competitor systematically solves this. | Execution bridge requires broker integrations (medium complexity). | Phase 1: API-only delivery. Phase 2: broker bridges. |
| **Customer Segments** | $21B TAM, 5 validated buyer pain points. Retail algorithmic traders + AI agents are growing segments. | Segment too broad -- risk of serving no one well. | Start with retail bot devs (phases 1-4). Expand to AI agents (phase 5). |
| **Channels** | MCP ecosystem is free distribution. Developer portal is self-serve. | No existing audience -- must build from zero. | Leverage Telegram bot (@Sophia_Bbot) as existing distribution channel. |
| **Revenue Streams** | 3 clear pricing tiers, x402 emerging model, 10-15% platform commission. | Pricing inconsistency ($49 vs $99) must be resolved before GTM. | Resolved: all tiers aligned with NOWPayments checkout. PRO = $99/mo. |
| **Cost Structure** | Cloud-native (Workers/D1), low fixed costs, gas costs negligible on L2. | Hardening sprint is one-time cost (2-4 weeks dev time). | Budgeted as phase 0: debt remediation before feature work. |
| **Key Resources** | Signal publisher exists (needs D1 persistence). MCP server is implementable. | 3 overlapping subscribe implementations create confusion. | Consolidation is P0 hard requirement before GTM. |
| **Key Activities** | All phase 1-4 tasks are well-defined, estimateable. | In-memory subscriber state is a production showstopper. | Phase 0: D1 migration. Non-negotiable before any revenue tier. |
| **Key Partnerships** | NOWPayments integration exists. MCP ecosystem is free. | No signal providers onboarded yet. | Provider onboarding after MVP (phase 4+). Start with own signals. |
| **Customer Relationships** | Self-serve developer portal + MCP agent self-onboarding. | No customer support infrastructure. | Discord/Telegram for community support. SLA for paid tiers. |

---

## Top 5 Unresolved Questions

1. **Which signal providers to onboard first?** The marketplace needs supply, but no providers are contracted yet. Should we start with our own internal signals (from the existing algo-trader engine) to seed the marketplace before recruiting third-party providers?

2. **Execution feasibility: 2/5 in GO/NO-GO.** The codebase audit revealed 8 significant GTM gaps. Is the hardening sprint acceptable delay, or does this change the GTM timeline estimate?

3. **Securities law exposure.** If signals are consumed as "investment advice", regulatory risk arises. Legal review needed before offering paid tiers to US retail. Is the "signals are data, not advice" firewall sufficient, or do we need jurisdiction filtering at signup?

4. **x402 vs subscription -- which is primary GTM revenue model?** Both have pros/cons. Research suggests subscriptions are simpler for MVP (NOWPayments already integrated), but x402 is the 2026 trend for AI agents. Should x402 be phase 2 or phase 1.5?

5. **Single or multi-chain for hash commitments?** On-chain proven signal publishing requires chain choice. Base (Coinbase L2) is consumer-friendly, but Solana has higher throughput. Which for MVP?

---

*Report saved to: `/Users/macbook/algo-trader/plans/260704-0941-signals-api-marketplace/reports/workflow-subagent-260705-0037-signals-marketplace-bmc-report.md`*
