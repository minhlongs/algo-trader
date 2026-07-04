# Talent/Org + Governance: 1-Page Brief

**Date:** 2026-07-05 | **Asset:** AlgoTrade (mekong/algo-trader)

---

## [Business] Structure & Talent Model

**Entity:** Solo founder/operator, pre-revenue scale-up. $0 ARR, $1M target. Zero human employees. Every department runs through MekongMind agent orchestration.

**Org Architecture:**
- 6 C-level roles defined via SOPs: **CEO** (vision, portfolio, biz model), **CTO** (architecture, code quality, infra), **COO** (daily ops, monitoring, incidents), **CMO** (brand, community, growth), **CDO** (data quality, feeds, analytics), **CFO** (P&L, cost modeling)
- 12 subordinate specialists under C-levels: Quant Researcher, Risk Analyst, Market Analyst, ML Engineer, Backend Engineer, SRE Engineer, Data Engineer, Security Analyst, Financial Analyst, Growth Hacker, Product Analyst, Execution Specialist
- **Founder** layer sits between CEO and Trader: owns budget, risk, strategy lifecycle, emergency protocols
- **Delegation model:** CEO sets vision -- COO runs daily operations -- Founder manages budget/risk -- C-levels own domain -- subordinates execute detailed work

**Talent acquisition triggers (from CEO SOPs):**
- Quant Analyst at revenue >$5K/month
- DevOps at 3+ exchanges live
- Risk Manager at portfolio >$50K
- Trader Ops at 24/7 trading

None triggered yet. Current team = solo human + AI agent system.

**Key insight:** Talent economics are ideal at this stage -- $0 payroll, AI agents handle all C-level and subordinate roles. First hire trigger ($5K MRR) is 50 subscribers at Pro tier. Pre-revenue, so hiring is entirely pre-emptive until then.

---

## [Agentic] Agentic Org & Operations

**Harness:** MekongMind (me-deep-wrapper) orchestrates all agent roles. Integration is persistent: hooks inject goal/gate/bottleneck on session start, verify gate pre-work, record artifacts post-work.

**Department routing:**
| Task | Agent Department | Gate |
|------|-----------------|------|
| Planning/Strategy | ceo-command | idea-intake -> company-blueprint |
| Research | market-intelligence | offer-validated |
| Build features | engineering-factory | mvp-live |
| Code review | quality-compliance | post-mvp |
| Deploy | platform-operations | first-revenue |
| Marketing/growth | growth-marketing | repeatable-channel |
| Docs/knowledge | knowledge-memory | scale-ready |
| Revenue ops | sales-revenue | first-revenue |

**Production pipeline:**
- Blog posts: ~30/mo, fully auto-generated (DeepSeek R1)
- Twitter/X: ~30 posts/mo, auto-posted via API v2
- Telegram channel: bundled distribution
- Email drip: SendGrid nurture sequences
- Referral program: auto-tracked

**AI Co-Pilot moat:**
- Local DeepSeek R1 (8-15 t/s) + Nemotron-3 Nano (35-50 t/s) via MLX on M1 Max
- 52 strategies across 5 prediction markets
- Ensemble voting + regime detection = information quality advantage
- Output feeds both internal bot trading AND external signals marketplace

**Signal marketplace agentic features (planned):**
- MCP server for LLM-native signal discovery (Phase 1)
- x402 pay-per-signal via HTTP 402 + USDC on Base (Phase 3)
- Zero-human-touch agent self-onboarding
- Fusion engine: ML-weighted multi-provider signal aggregation

**Key insight:** Content production is automated at zero marginal cost. The bottleneck is distribution, not creation. Agentic org works well for scale -- every department has a defined SOP that a C-level agent can execute. No human handoff needed.

---

## [Governance] Controls & Decision Infrastructure

**SOP hierarchy (3-tier, Vietnamese + English):**
| Layer | File | Scope |
|-------|------|-------|
| CEO SOPs | `docs/ceo-sops.md` | Vision, portfolio, biz model, 5-year view |
| Founder SOPs | `docs/founder-sops.md` | Budget, risk, strategy lifecycle, scaling |
| COO SOPs | `docs/coo-sops.md` | Daily ops, monitoring, incidents, capacity |
| CTO SOPs | `docs/cto-sops.md` | Architecture, code quality, tech debt |
| CMO SOPs | `docs/cmo-sops.md` | Brand, community, growth, revenue channels |
| CDO SOPs | `docs/cdo-sops.md` | Data quality, feeds, analytics, backtest integrity |
| Trading Team Subordinates | `docs/trading-team-subordinates-sops.md` | 12 specialist roles, each with domain SOPs |
| MekongMind Harness | `docs/mekong-harness-integration.md` | Gate progression, department routing, artifact recording |

**8-gate progression:** idea-intake -> company-blueprint -> offer-validated -> mvp-live -> first-revenue -> repeatable-channel -> fulfillment-stable -> scale-ready -> first-1m-mrr.

**Risk governance (3-layer):**
1. **Per-trade** (bot auto-enforced): position size 2%, SL 2%, TP 5%, R:R >= 1:1.5
2. **Daily** (circuit breaker): daily loss limit $100 (adjustable), max DD 10%, 3 consecutive losses -> downgrade autonomy
3. **Strategic** (Founder): weekly loss limit 5% portfolio, monthly 10%, max 30% per strategy, max 40% per exchange

**Incident response (P0-P4):**
- P0 (capital at risk): immediate escalation to CEO
- P1 (exchange down, strategy failing): <15 min to Founder
- P2 (performance degraded): <1 hour, self-resolve
- P3 (minor): <24 hours, self-resolve

**Quality gates (enforced by CTO SOPs):**
- 0 TypeScript errors (886 files, 842 TS sources, zero `any` types)
- 3,194/3,198 tests passing (~99.87%)
- Zero console.log (logger utility required)
- Zod validation on all API inputs
- Files <200 LOC
- No `@ts-ignore`, no `@ts-nocheck`

**Compliance framework:**
- Exchange KYC on all platforms
- Tax records: monthly P&L, quarterly exports, 5-year retention
- Regulatory monitoring: Vietnam, MiCA (EU), SEC (US)
- OpsSec: API keys read-only where possible, 2FA on all, withdrawal whitelist
- Securities law firewall: TOS ("signals are data, not advice"), jurisdiction gating planned for US retail

**Key decisions made:**
| Decision | Rationale |
|----------|-----------|
| D1 primary, soft launch (50 devs) before paid | Need demand validation before billing |
| Internal signals seed marketplace | Faster to market, recruit third-party post-launch |
| Discord + Telegram primary community | Existing bot audience, crypto-native |
| Centralized dispute resolution (start) | Faster to iterate; DAO governance is Phase 4+ |
| Pre-paid annual billing via NOWPayments | Already integrated, 20% discount built |
| Hardening sprint before GTM | D1 migration, route consolidation, OpenAPI spec |

**Unresolved governance questions:**
1. Jurisdiction gating at signup: block US retail until securities counsel review, or TOS-only firewall sufficient?
2. SEC/CFTC exposure for prediction market signals: Polymarket geo-blocked for US, but Kalshi is CFTC-regulated. Does "data, not advice" hold for prediction market outcome data?
3. First hire trigger: should Quant Analyst or SRE be first human hire, or is zero-human ops sustainable past $50K MRR?
4. Agent-to-agent discovery: should AlgoTrade signals be listed in MCP registries before REST API launch, or REST-first?

---

*Reports path: `/Users/macbook/algo-trader/plans/260704-0941-signals-api-marketplace/reports/`*
*SOPs path: `/Users/macbook/algo-trader/docs/*-sops.md`*
