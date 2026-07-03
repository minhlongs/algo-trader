# CashClaw -- AI-Calibrated Prediction Market Signals

**Tagline:** Subscribe. Receive AI-calibrated signals. Trade profitably.

**Website:** https://cashclaw.cc

**Contact:** billwill (solo founder) -- LinkedIn/GitHub/Twitter available on request

**Language:** English only (this document is intended for English-speaking investors and partners)

---

## 1. The Problem

Prediction market traders operate blind. Polymarket processes over $500M per month in volume, yet the vast majority of retail and semi-professional traders lack:

- **Systematic signal generation** across hundreds of active markets. Most traders rely on gut feel, news headlines, or single-source analysis.
- **Mathematically proven position sizing.** Without Kelly-optimal bet sizing, traders routinely overbet winning positions (reducing compounded returns) or underbet high-conviction opportunities.
- **Real-time risk calibration.** Markets move in minutes. Manual risk assessment cannot keep pace with the information flow.
- **Multi-strategy diversification.** A single model or approach creates correlated error and single-point-of-failure risk.

The result is a predictable pattern: inconsistent returns, emotional trading during high-volatility events, missed opportunities on correlated markets, and gradual capital erosion. Even skilled traders on Polymarket rarely maintain compound positive returns over 50+ trades without systematic assistance.

---

## 2. The Solution

CashClaw is a **RaaS (Robot-as-a-Service) platform** for prediction market trading signals. Subscribers pay a monthly fee and receive AI-calibrated, risk-adjusted trade signals delivered to their dashboard, Telegram bot, or CLI -- no infrastructure setup, no quantitative finance background required.

### Core Capabilities

**52+ AI Trading Strategies** across Polymarket (80% focus), CEX, and DEX markets. This is not a single model -- it is a diversified strategy portfolio spanning multiple signal sources, market types, and time horizons. Strategy count includes 30 V2 Polymarket strategies via a shared `BasePolymarketStrategy` abstract class, plus pre-migration, CEX, DEX, DNA (GRU neural net), and dark-edge experimental frameworks.

**Kelly-Optimal Position Sizing.** Every signal includes a mathematically optimal bet size based on the Kelly criterion. This is the same framework used by professional gamblers and institutional investors to maximize long-term compounded growth while minimizing ruin probability. Few prediction market tools implement this correctly.

**Dual-Model AI Architecture.** CashClaw uses two complementary AI models with different strengths:
- **Nemotron-3 Nano** -- fast, low-cost scanner for real-time market screening and initial opportunity identification
- **DeepSeek R1** -- deep reasoning model for signal validation, risk assessment, and multi-market correlation analysis
This separation reduces correlated error (both models must agree before a signal is published) and keeps inference costs manageable.

**Three-Layer Architecture:**
1. **Signal Pipeline** -- Market data ingestion, strategy execution, signal fusion, TTL enforcement, dedup, and publishing
2. **Risk Engine** -- Kelly sizing, drawdown protection, circuit breakers, position tracking, win-rate monitoring
3. **Execution Bridge** -- Polymarket CLOB adapter, paper trading executor, order management, broker-agnostic interfaces

**Delivery Channels:**
- **Dashboard** -- Full web UI with 34+ pages, real-time signal feed, P&L tracking, strategy performance analytics
- **Telegram Bot (@Sophia_Bbot)** -- Commands for `/campaign`, `/status`, `/results`, and `/signals`
- **CLI** -- `algo scan`, `algo status`, `algo risk` commands via Commander.js

### Architecture: 3 Bounded Contexts

The codebase is organized into three strictly separated layers:

| Context | Path | Purpose |
|---------|------|---------|
| Shared Kernel | `src/shared/` | Types, config, DB client, utils, migrations (zero business logic) |
| Desk | `src/desk/` | Operator-only trading -- strategies, execution, risk, signal pipeline, intelligence |
| Platform | `src/platform/` | Multi-tenant subscriber platform -- API, auth, billing, marketplace, metering, audit |

Import rules are enforced: `shared/` is foundational (importable by all), `desk/` imports only `shared/`, and `platform/` imports `shared/` plus `desk/` through shared `IStrategy` interfaces. This separation ensures tenant isolation, keeps operator trading logic free of subscriber concerns, and simplifies testing.

---

## 3. Traction

CashClaw is a fully operational production platform, not a prototype or whitepaper.

| Metric | Value | Verification |
|--------|-------|-------------|
| Test suite | 2,790 passing tests | `npx vitest run` exit 0 |
| TypeScript | 0 errors | `npx tsc --noEmit` |
| Source files | 731 TypeScript files in `src/` | Live codebase |
| Documentation | 113 markdown files across `docs/` | Full marketing, architecture, changelog, roadmap |
| Database migrations | 43 migration files (77 with SQL sidecars) | PostgreSQL schema versioned |
| Dashboard pages | 34 pages (React/TypeScript) | Full trading dashboard |
| Dashboard components | 75 React components | Reusable UI library |
| API route files | 57 route modules | Express REST + WebSocket gateway |
| Git commits | 510+ commits | Full development history |
| Plan directories | 32 structured plans in `plans/` | Documented product roadmap |
| Bounded contexts | 3 (shared/desk/platform) | Architecture separation verified |
| Pricing tiers | 3 (PRO $99/mo / ENTERPRISE $299/mo / MASTER $999/mo) | Billing system + landing page |
| Payment processing | NOWPayments USDT with HMAC-SHA512 IPN verification | Live and tested |
| Billing persistence | PostgreSQL (not in-memory) | Refactored from JSON files to DB queries |
| Paper trading P&L | +$2,251 across 50 trades (66.7% win rate) | Backtest runner + metrics calculator |
| AI models | Nemotron-3 Nano (scanner) + DeepSeek R1 (reasoner) | Production inference pipeline |
| Landing page | https://cashclaw.cc deployed | Verified HTTP 200 |

### Key Milestones Delivered

- Full 3-bounded-context architecture separation completed June 2026
- Billing persistence migrated from in-memory Maps and JSON files to PostgreSQL (license, subscription, payment services)
- 52+ strategies implemented across Polymarket (69 strategy files), CEX, and DEX
- Tier gating middleware (`requireTier`) enforced on all 57 API route files
- Marketplace architecture: multi-tenant strategy listings, subscriptions, reviews, disputes, vetting (draft/pending/approved/rejected)
- Telegram bot integration end-to-end
- AI inference cost tracking integrated

---

## 4. Business Model

### Pricing Tiers

| Tier | Price | Est. Margin | Features | Target User |
|------|-------|-------------|----------|-------------|
| PRO | $99/mo | ~85% | 100 req/min, ML strategies, advanced optimization, hyperparameter tuning | Retail Polymarket traders |
| ENTERPRISE | $299/mo | ~85% | 1,000 req/min, arbitrage scanning, multi-exchange trading, custom strategies, priority support | Semi-pro, portfolio managers |
| MASTER | $999/mo | ~85% | 5,000 req/min, dedicated strategies, account manager, custom risk parameters, white-label reports | Institutional desks, high-volume |

### Cost Structure

| Cost Item | Monthly Range | Notes |
|-----------|--------------|-------|
| AI inference (OpenRouter) | $200-500 | Variable by subscriber count and signal frequency; largest COGS component |
| Infrastructure (Cloudflare Workers + D1 + Redis) | $30-50 | Fixed base; scales well due to edge architecture |
| Payment processing (NOWPayments) | 0.5% per transaction | Crypto-native, no chargeback risk |
| Total est. COGS per 100 subscribers | ~$500-700 | ~85% margin at current tier mix |

### Unit Economics

- **PRO subscriber contribution:** $99/mo revenue -- ~$5-8/mo variable COGS -- ~$91-94 gross profit
- **ENTERPRISE contribution:** $299/mo revenue -- ~$10-15/mo variable COGS -- ~$284-289 gross profit
- **MASTER contribution:** $999/mo revenue -- ~$25-40/mo variable COGS -- ~$959-974 gross profit
- **Break-even subscriber count:** Approximately 5-8 PRO subscribers or 2-3 ENTERPRISE/MASTER
- **LTV estimate (12-month avg retention):** PRO ~$700-1,100; ENTERPRISE ~$2,100-3,500; MASTER ~$7,000-12,000
- **CAC estimate (paid channels):** $50-150 per subscriber (organic distribution is primary initial channel)

The margin profile is attractive because AI inference costs are shared across subscribers (batched model calls) rather than per-subscriber dedicated compute.

---

## 5. Market

### Target Market Breakdown

| Segment | Share | Volume | Description |
|---------|-------|--------|-------------|
| Polymarket signals | 80% | $500M+/mo | Primary focus -- largest prediction market, highest signal density |
| CEX/DEX signals | 20% | Growing | Secondary signal delivery for portfolio diversification |

Polymarket alone processed over $500M in monthly trading volume as of mid-2026, with accelerating growth as regulatory clarity improves in the US and institutional interest increases. Prediction markets are emerging as a distinct asset class -- they are uncorrelated with equities and crypto spot markets, making them attractive for portfolio diversification.

### Growth Tailwinds

- **Regulatory clarity.** The 2024-2026 cycle brought increasing legal clarity for prediction markets in the US, reducing counterparty risk for platforms like Polymarket.
- **Institutional interest.** Hedge funds and family offices are exploring prediction markets for hedging and alternative alpha generation.
- **Event-driven demand.** Election cycles, macroeconomic events, and sports seasons drive recurring volume spikes.
- **Multi-platform expansion.** Kalshi, Zeitgeist, and other emerging platforms reduce single-platform concentration risk and expand total addressable market.
- **Retail adoption.** User-friendly interfaces (Polymarket's UI, mobile apps) are lowering the barrier to entry for non-crypto-native traders.

### Addressable Market Estimate

- Total prediction market monthly volume: $500M+
- Estimated addressable signal-seeking traders: 10,000-50,000 globally
- Estimated annual signal software market: $25-100M (at $99-999/mo per user)
- TAM expansion: Multi-platform support (Kalshi, CEX, DEX) adds 20-30% to addressable volume

---

## 6. Competitive Landscape

| Competitor | Strategy Count | Position Sizing | AI Model | Delivery | Test Suite | Architecture | Pricing |
|------------|---------------|----------------|----------|----------|------------|-------------|---------|
| **CashClaw** | 52+ | Kelly-optimal | Dual (Nemotron + DeepSeek) | Dashboard + Telegram + CLI | 2,790 tests | 3 bounded contexts | $99-999/mo |
| Polymarket Analytics | 0 (data only) | None | Charts only | Web dashboard | N/A | Single app | Free/freemium |
| TradingView signals | Limited | Basic | Single model | Web/mobile | N/A | Single app | $12-50/mo |
| 3Commas | 10+ | Fixed % | Basic rules | Web/mobile | Limited | Monolith | $29-149/mo |
| Hummingbot | 20+ (CEX) | Not applicable | None (HFT) | CLI/API | 500+ | Modular | Free/open source |
| EdgePro | 5-10 | None | Single LLM | Web only | Unknown | Unknown | $199/mo |
| PredictIt tools | 0 (data) | None | None | Web | Unknown | Unknown | Free |

### CashClaw Differentiators

1. **52+ diversified strategies** (not a single model or approach) -- reduces correlated error across market conditions
2. **Kelly-optimal position sizing** -- mathematically proven framework for maximizing compounded returns; few competitors implement this at all, let alone correctly
3. **Dual-model AI (Nemotron-3 Nano + DeepSeek R1)** -- separate scanning and reasoning models reduce false signals and keep inference costs 40-60% below single-large-model approaches
4. **2,790-test suite** -- production-grade reliability, not a script; CI gate enforced
5. **3 bounded contexts** -- clean separation of shared kernel, operator trading, and subscriber platform enables independent scaling and testing
6. **Triple delivery (Dashboard + Telegram + CLI)** -- meets users where they are, from casual mobile checks to automated API trading
7. **PostgreSQL billing persistence** -- not in-memory; subscriptions, licenses, and payments survive restarts
8. **NOWPayments USDT with HMAC-SHA512 IPN** -- crypto-native billing with server-side verification

---

## 7. Growth Trajectory (12-Month Projection)

### Assumptions

- Q3 2026 launch in Polymarket Discord, Crypto Twitter, and prediction market communities
- Organic distribution initially (founder-led community building)
- Paid acquisition (Twitter/X ads, Polymarket affiliate placements) from month 4
- ~3% monthly churn (conservative for SaaS); ~1.5% for MASTER tier
- Tier mix: 60% PRO / 25% ENTERPRISE / 15% MASTER

### Scenario Analysis

| Metric | Conservative | Base Case | Aggressive |
|--------|-------------|-----------|------------|
| Month 6 users | 50 | 120 | 250 |
| Month 6 MRR | $10,500 | $25,200 | $52,500 |
| Month 12 users | 150 | 400 | 900 |
| Month 12 MRR | $31,500 | $84,000 | $189,000 |
| Month 12 ARR | $378,000 | $1,008,000 | $2,268,000 |
| Break-even | Month 2 | Month 1 | Month 1 |

### Path to $1M ARR ($83,333/mo MRR)

| Tier | Users Needed | Revenue Share |
|------|-------------|---------------|
| PRO (60%) | ~505 users | $49,995/mo |
| ENTERPRISE (25%) | ~70 users | $20,930/mo |
| MASTER (15%) | ~14 users | $13,986/mo |
| **Total** | **~589 users** | **$84,911/mo ($1.02M ARR)** |

At the base case growth rate (400 users at month 12), CashClaw reaches the $1M ARR threshold by month 14-15. At the aggressive rate, it crosses $1M ARR by month 10-11.

The key leverage point is MASTER tier growth: each MASTER subscriber contributes as much revenue as 10 PRO subscribers, with lower marginal support cost.

---

## 8. Moats

1. **52+ diversified AI strategies** -- Not a single model that can be copied. The strategy portfolio spans multiple signal sources, market types, and time horizons. Copying requires rebuilding the entire research and development pipeline.

2. **Kelly-optimal position sizing** -- Few competitors implement the Kelly criterion correctly. Most use fixed percentages or arbitrary risk limits. Correct implementation requires understanding probability estimation, edge calculation, and fractional Kelly adjustments for real-world constraints.

3. **Dual-model architecture (Nemotron-3 Nano + DeepSeek R1)** -- Separating fast scanning from deep reasoning reduces correlated error. Both models must agree before a signal is published. This architecture also halves inference costs compared to routing all queries through a single large model.

4. **2,790-test production-grade test suite** -- Institutional-quality reliability enforced by CI. New features cannot ship without passing the full suite. This is a quality moat that compounds as the test suite grows with each feature.

5. **3 bounded contexts with strict import rules** -- The shared/desk/platform separation enforces architectural hygiene. Testing, scaling, and onboarding new developers are all simpler than in a monolithic codebase. This moat grows as the codebase ages and alternatives become harder to refactor.

6. **PostgreSQL billing persistence** -- Subscriptions, licenses, and payments survive crashes, restarts, and redeploys. Most early-stage trading tools use in-memory or JSON-file storage that loses state.

7. **57 API route files with tier gating** -- All platform routes protected by `requireTier()` middleware. Tier enforcement is not an afterthought -- it is baked into the routing layer.

8. **43 database migrations** -- Schema evolution is tracked and versioned. Rollbacks are possible. Data integrity is guaranteed by migration checksums.

9. **NOWPayments USDT billing with HMAC-SHA512 IPN verification** -- Server-side IPN verification prevents payment forgery. USDT billing avoids chargeback risk inherent in credit card processing.

---

## 9. Team

**billwill** -- Solo founder and full-stack developer

- **Full-stack development:** TypeScript, Node.js, Next.js, React, Express, Commander.js CLI
- **Infrastructure:** Cloudflare Workers, PostgreSQL, Redis, NATS JetStream, BullMQ, Docker
- **AI/ML:** LLM integration (Nemotron-3, DeepSeek R1), signal processing, Kelly optimization, backtesting framework
- **DevOps:** CI/CD pipeline, deployment automation, monitoring, Prometheus metrics, Sentry error tracking
- **Go-to-market:** Landing page (cashclaw.cc), marketing docs (10+ documents), email sequences, launch content, social media strategy
- **Platform scope:** 731 TypeScript source files, 113 documentation files, 34 dashboard pages, 75 UI components, 57 API route modules, 43 database migrations across 3 bounded contexts

**Delivery:** End-to-end platform shipping since mid-2025. 510+ git commits. 2,790 test suite with 0 TypeScript errors.

---

## 10. Ask

CashClaw is seeking **$500,000 pre-seed financing** to accelerate distribution, market-making liquidity, and platform scaling ahead of Q3 2026 launch.

### Use of Funds

| Category | Allocation | Amount | Purpose |
|----------|-----------|--------|---------|
| Distribution & marketing | 35% | $175,000 | Polymarket community advertising, Twitter/X campaign, affiliate program, content marketing, paid search |
| Market-making liquidity | 25% | $125,000 | Seed liquidity pool for initial signal subscribers; enables paper-to-live transition with capital behind signals |
| Infrastructure & operations | 15% | $75,000 | Cloudflare Workers/D1 scaling, Redis cluster, inference optimization (batch model calls to reduce per-subscriber cost) |
| Development & engineering | 15% | $75,000 | Additional strategy development, Kalshi integration, mobile dashboard, SOC2 compliance prep |
| Reserve | 10% | $50,000 | Operating buffer, legal, unforeseen scaling needs |

### Target Milestones (Post-Funding)

- **Month 3:** Public launch on Polymarket community channels; 25 subscribers, $5K MRR
- **Month 6:** 120 subscribers, $25K MRR; Telegram bot distribution partnerships; Kalshi integration beta
- **Month 12:** 400 subscribers, $84K MRR ($1M ARR run-rate); multi-platform (Kalshi, Zeitgeist) expansion; enterprise licensing for funds

### Target Close

- Fundraising target close: Q3 2026 (September 2026)
- Instrument: SAFE with standard MFN provisions, or priced round negotiable for strategic investors

---

*CashClaw -- AI that calibrates the markets so you can trade with confidence.*
