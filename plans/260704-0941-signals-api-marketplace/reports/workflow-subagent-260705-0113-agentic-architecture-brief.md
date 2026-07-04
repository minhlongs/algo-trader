# AlgoTrade Signals API Marketplace -- Agentic Architecture 1-Pager

**Date:** 2026-07-05 | **Asset:** AlgoTrade (mekong/algo-trader) | **Stage:** Scale-Up / Pre-revenue

---

## [Business] Core Revenue Engine

**Dual-platform RaaS:** Bot subscriptions ($19-999/mo) + Signals API Marketplace ($29-299/mo) + Platform commission (10-15% on provider earnings). Target: $1M ARR within 12-18 months via crypto-native SaaS (NOWPayments), 4 bot tiers + 3 signal tiers, 20% annual prepay discount.

**TAM overlap:** Algorithmic trading $15.24B (11.7% CAGR), AI Trading Agents $7.63B (49.6% CAGR), Global prediction markets ~$240B (2026 projected, 20x from 2025). Signal API for prediction markets is underserved -- no polished product exists for the post-Feb-2026 maker-optimized regime.

**Pricing architecture:**
- FREE tier: $0 (1K calls/mo, 2/min, single provider REST preview)
- PRO: $99/mo (10K calls, 30/min, REST + Webhook, 5 providers)
- ENTERPRISE: $299/mo (100K calls, 120/min, SSE real-time, 20 providers)
- MASTER: Custom (unlimited, dedicated SLA)
- x402 add-on: $0.01-0.05/call (USDC on Base) for agent-only consumption

**Unit economics:** At $99/mo PRO: NOWPayments ~0.5% ($0.50), infra <$0.50/user, gross margin ~75-80%. 200 subscribers = $19.8K MRR. Solo founder -- zero payroll, total burn ~$100-1K/mo at MVP.

**Distribution (zero-CAC path):** Developer trading communities (Discord/Telegram), MCP ecosystem registries, @Sophia_Bbot existing 3K users, signal provider rev-share referrals. No paid marketing before Phase 3.

---

## [Agentic] AI-Native Operations & Architecture

**Solo-company orchestration (MekongMind harness):** 6 C-level agents (CEO, CTO, Product, Revenue, Marketing, Ops) route through department SOP gates. No human employees. Full SDLC: Specification -> Design -> Code -> Deploy, each phase with gate evidence.

**AI pipeline -- zero marginal cost content:**
- Blog posts: ~30/mo via DeepSeek R1 (fully automated)
- Twitter/X: ~30 posts/mo via API v2 auto-posting
- Telegram channel: bundled auto-distribution via grammy bot
- Email drip: SendGrid automated nurture sequences
- Referral program: auto-tracked viral loop

**Core technical moat -- AI Co-Pilot + Regime-adaptive signal fusion:**
- DeepSeek R1 (8-15 t/s) + Nemotron-3 Nano (35-50 t/s) via MLX on M1 Max (Metal GPU, bare metal -- no Docker)
- 52+ strategies across 5 prediction markets (Polymarket, Kalshi, BTC/USD, etc.)
- Ensemble voting + regime detection produces higher-quality signals than any single-model approach
- Paper trading P&L: +$2,251 (66.7% win rate), arbitrage edge 14.6%
- Fusion engine (planned add-on $49/mo): ML-weighted multi-provider signal fusion

**Agent-native distribution (MCP-first architecture):**
- Signal feeds exposed as MCP resources/tools for AI agent discovery
- x402 pay-per-signal (HTTP 402 + USDC on Base) -- agents self-subscribe without human touch
- Agent subscription pooling ($99/10K calls) -- shared quota across multi-agent firms
- MCP registries listed for organic zero-CAC agent discovery
- Self-learning weight optimization on agent consumption patterns

**Production infrastructure:**
| Layer | Stack | Latency |
|-------|-------|---------|
| API | Fastify 5 / Express 5 / Hono (Workers) | p95 ~45ms |
| WebSocket | WS / grammy | ~25ms |
| Database | PostgreSQL + Prisma ORM + Redis Cluster (6-node AOF+RDB) | -- |
| Blockchain | CCXT (Binance/OKX/Bybit), Polymarket CLOB v2, ethers.js, Jupiter (Solana) | -- |
| Monitoring | Prometheus + Grafana + Alertmanager + Sentry + OpenTelemetry | -- |
| Testing | Vitest (3194/3198), Playwright, k6 load (1K concurrent validated) | -- |

**Key observation:** The entire content marketing pipeline is already AI-automated at zero marginal cost. The bottleneck is not production but initial audience acquisition. MCP-native distribution sidesteps this by making agents the first customers -- no human discovery funnel needed.

---

## [Governance] Trust, Risk & Quality Infrastructure

**Trust architecture for signal marketplace:**
| Mechanism | Status | Detail |
|-----------|--------|--------|
| On-chain hash commitment | Phase 1 | Publish-time signal fingerprint on Base L2 |
| Provider bonding/slashing | Phase 2 | Collateral proportional to tier, slashing for misrepresentation |
| Burn-to-unlock dispute | Phase 2 | Stake tokens to trigger independent expert review |
| Transparency dashboard | Phase 1 | Real-time provider accuracy scoreboard |
| Standardized quality score | Phase 1 | Decay-weighted, 3-month window, verified accuracy |
| Privacy-scoped feed (ZK tier) | Phase 4+ | Encrypted payload, verified source |

**Risk register (top 5):**
| Risk | Severity | Mitigation |
|------|----------|------------|
| Securities law exposure (signals = investment advice) | High | TOS firewall ("signals are data, not advice"), jurisdiction gating at signup for US retail, legal review before paid tiers |
| No signal providers join marketplace | Critical | Seed with 52 internal algo-trader signals -- launch with supply before recruiting third parties |
| Zero-to-one adoption | Critical | Developer preview with 50 invited devs via existing Discord/Telegram relationships. FREE tier only, no credit card. |
| In-memory subscriber state lost on restart | Critical | D1 migration is Phase 0 hard requirement before any paid tier. Non-negotiable. |
| Pricing inconsistency ($49 vs $99) | High | Resolved: PRO unified to $99/mo (NOWPayments source of truth). All references audited. |

**Quality gates (verified):**
- 0 TypeScript errors (886 files, 842 TS sources, zero `any` types)
- 3,194/3,198 tests passing (~99.87%)
- Build time ~5s incremental
- Zod validation on all API inputs
- Tier enum: BASIC | PREMIUM | ENTERPRISE | MASTER (uppercase)
- Zero console.log in production (logger utility required)

**Key governance decisions:**
| Decision | Rationale |
|----------|-----------|
| Base (Coinbase L2) for on-chain commitments | Lower gas, consumer-friendly, USDC native. Solana if demand appears. |
| Subscription primary, x402 exploratory | NOWPayments already integrated. x402 adds complexity. Agent revenue deferred to Phase 3. |
| Internal signals seed marketplace | Faster to market. Recruit third-party providers post-launch. |
| Block US retail at signup | Until securities counsel reviews. Reversible. Safer than retroactive compliance. |
| Hardening sprint before GTM | 2-week dedicated debt remediation. D1 migration, route consolidation, OpenAPI spec, pricing finalization. |

---

## Summary: The Bet

AlgoTrade is **pre-revenue but revenue-ready** -- 32 of 37 roadmap phases complete, billing infrastructure built, content pipeline automated. The gating factor is not code but customers.

**The core insight:** Prediction markets are growing 20x/year. Signal infrastructure for this space is immature -- no polished "signals + execution" API product exists for the post-Feb-2026 maker-optimized regime. AlgoTrade's 52-strategy ensemble from local DeepSeek R1 + Nemotron on bare-metal M1 Max is a genuine technical edge that can be packaged and sold before any bot subscription revenue arrives.

**Next decision:** 2-week hardening sprint (D1, consolidation, OpenAPI, pricing final) vs immediate GTM with FREE tier. Recommendation: harden first.

---

*Report saved to: `/Users/macbook/algo-trader/plans/260704-0941-signals-api-marketplace/reports/workflow-subagent-260705-0113-agentic-architecture-brief.md`*
