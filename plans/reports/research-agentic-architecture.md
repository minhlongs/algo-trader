# Agentic Architecture Research — Signals Marketplace

**Date:** 2026-07-06 | **Agent:** Researcher (Agentic Architecture) | **Skill:** BizPlan OS "Agentic Design"

---

## 1. Current Infra Audit

| Layer | What Exists | Source |
|-------|-------------|--------|
| Orchestrator | MekongMind Solo Company (6 C-level: CTO, CMO, CSO, COO, CMO[x2], CISO) | `CLAUDE.md` |
| Trading Agents | 19 agents with tier-based model assignment (Haiku/Sonnet/Opus) | `src/agents/agent-config.ts` |
| Queue | Agent queue manager + coordinator | `src/queues/` |
| Intelligence | Signal consensus swarm (3-persona DAG debate), signal fusion, reflection engine | `src/intelligence/` |
| Content | AutoMarketingDaemon (DeepSeek R1), blog router, welcome-email drip, Twitter auto-poster | Phase 32 completed |
| Billing | NOWPayments, Stripe fallback, coupon, invoice, trial-drip, subscription-service | `src/platform/billing/` |
| Marketplace | Strategy vetting, copy-trading risk, revenue sharing, performance ranking, dispute resolution in plan (all 6 phases) | `260621-1649` |
| Customer Ops | Telegram bot, onboarding-service, enterprise-onboarding, admin routes | src/platform/ |
| MCP Server | **NOTHING** | gap |

**Verdict:** Marketplace infra is 70% wired. Signal provider onboarding, lead nurturing, customer success, and MCP server are new. Content, billing, strategy backtest exist and can be reused.

---

## 2. Target Agent Architecture (3-Tier)

```
┌─────────────────────────────────────────────────────────┐
│  TIER 1 — BUSINESS ORCHESTRATORS (MekongMind Solo Co.)  │
│  CTO | CMO | CSO | COO | CISO — weekly/monthly cycles   │
└───────────────────────┬─────────────────────────────────┘
                        │ delegates to
┌───────────────────────▼─────────────────────────────────┐
│  TIER 2 — MARKETPLACE AGENTS (new, this proposal)       │
│                                                         │
│  ┌──────────────────┐  ┌──────────────────┐            │
│  │  Lead Hunter      │  │  SignalProvider   │            │
│  │  (nurture, DM)    │  │  Onboarding       │            │
│  │  Auto: 70%        │  │  Auto: 80%        │            │
│  │  Trigger: signup  │  │  Trigger: app     │            │
│  └──────────────────┘  └──────────────────┘            │
│                                                         │
│  ┌──────────────────┐  ┌──────────────────┐            │
│  │  CustomerSuccess  │  │  ContentAgent     │            │
│  │  (onboard, churn) │  │  (blog, twitter)  │            │
│  │  Auto: 85%        │  │  Auto: 90%        │            │
│  │  Trigger: trial   │  │  Trigger: daily   │            │
│  └──────────────────┘  └──────────────────┘            │
│                                                         │
│  ┌──────────────────┐  ┌──────────────────┐            │
│  │  StrategyLab      │  │  BillingAgent     │            │
│  │  (backtest, pub)  │  │  (invoice, NOWP)  │            │
│  │  Auto: 75%        │  │  Auto: 95%        │            │
│  │  Trigger: new strat│ │  Trigger: IPN     │            │
│  └──────────────────┘  └──────────────────┘            │
└───────────────────────┬─────────────────────────────────┘
                        │ calls
┌───────────────────────▼─────────────────────────────────┐
│  TIER 3 — EXECUTION AGENTS (existing, 19 agents)         │
│  SignalConsensus | WhaleTracker | RegimeDetector | etc.  │
└─────────────────────────────────────────────────────────┘
```

---

## 3. New Agent Specs

| Agent | Triggers | Key Actions | Auto% | Reuses |
|-------|----------|-------------|-------|--------|
| **LeadHunter** | new signup, trial start | Telegram DM welcome/faq, daily check-in, churn-risk alert → human handoff | 70% | existing Telegram bot, trial-drip |
| **SignalProviderOnboarding** | provider app submitted | verify API keys, validate backtest results, run 7d paper requirement → approve/reject | 80% | StrategySeeder, PaperTradingEngine, admin routes |
| **CustomerSuccess** | trial active, support ticket, NPS survey | onboarding walkthrough, TierPro upgrade nudge, churn prediction, payout coordination | 85% | onboarding-service, subscription-service, enterprise-tam-notifier |
| **ContentAgent** | daily cron, new strategy publish | DeepSeek R1 blog post, Twitter thread, Telegram channel distribution | 90% | AutoMarketingDaemon (exists, reuse) |
| **StrategyLab** | new strategy submitted, weekly cron | backtest runner, performance agg, strategy ranking publish | 75% | existing backtest infra, StrategyLoader |
| **BillingAgent** | IPN webhook, trial ending, payout due | invoice generation, tier activation, revenue share calc, Stripe/NOWP payout | 95% | nowpayments-service, coupon, revenue-analytics |

---

## 4. MCP Server Tool Interface

**Exposed as:** CF Pages/Worker MCP endpoint at `/api/mcp/signals`

```ts
// Tool registry
const MCP_TOOLS = {
  get_signals: {
    input: { strategy: string, timeframe: string, limit: number },
    output: Signal[],
    auth: "API key or JWT",
  },
  subscribe: {
    input: { signal_provider_id: string, risk_limits?: RiskLimits },
    output: Subscription,
    auth: "tier-gated (PRO+)",
  },
  check_track_record: {
    input: { provider_id: string },
    output: { sharpe: number, win_rate: number, trades: number, verified: boolean },
    auth: "public",
  },
  get_consensus: {
    input: { signal_ids: string[] },
    output: { consensus: BUY|SELL|HOLD, confidence: number, dissenting_reasons: string[] },
    auth: "tier-gated",
  },
  list_strategies: {          // new
    input: { category?: string, min_sharpe?: number },
    output: Strategy[],
    auth: "public",
  },
  get_performance: {          // new
    input: { provider_id: string, period: string },
    output: PerformanceMetrics,
    auth: "public",
  },
};
```

Transport: JSON-RPC 2.0 over HTTP + SSE for streaming signals. Auth via existing license gate (`src/lib/raas-gate.ts`). Writes go through TieredRollbackController (L1 kill switch pattern).

---

## 5. Free → Trial → Paid → Retained Flow

| Stage | Agent-Driven | Human-Only | Tooling |
|-------|-------------|-----------|---------|
| **Free → Trial** | LeadHunter: Telegram welcome, feature tour, trial activation | — | trial-drip-service |
| **Trial → Paid** | CustomerSuccess: upgrade nudge (day 5, 10), ROI calc | Operator on C-suite deal | subscription-service + BillingAgent IPN |
| **Paid → Active** | ContentAgent: daily signals, StrategyLab: weekly perf | — | signal-publisher fan-out, Telegram |
| **Active → Retained** | CustomerSuccess: churn-risk algorithm → auto-discount / upgrade nudge | Person-of-contact on flag | churn-score batch (weekly) |
| **Churned → Winback** | ContentAgent: new feature announcement (monthly) | Operator on high-value | winback email (trial-drip re-enroll) |

**Human touchpoints:** CISO on security incident, CMO on high-value C-suite deal, operator on dispute resolution (existing admin workflow). 80% automated end-to-end.

---

## 6. Cost Model (Monthly per Customer Tier)

Assumptions: DeepSeek R1 = $0.5/1M tokens, Claude Haiku 3.5 ≈ $0.8/1M, Sonnet 3.5 ≈ $3/1M. Signal consensus swarm = 3 Sonnet calls per signal evaluation.

| Tier | Agents Active | LLM Calls/mo | Est. LLM Cost | Infra (CF Workers) | **Total/mo** |
|------|--------------|-------------|---------------|-------------------|-------------|
| **FREE** (100 users) | LeadHunter, ContentAgent | 50K | $0.50 | $5 (shared) | **$55/mo** |
| **PRO** ($49/mo, ~30 users) | All except billing (heavy) | 200K | $5.00 | $15 (shared) | **$460/mo** |
| **ENTERPRISE** ($299/mo, ~5 users) | All agents + priority queue | 100K | $8.00 | $10 (dedicated) | **$1,505/mo** |
| **Total infra** | — | ~350K calls/mo | **~$14 LLM** | **$30 CF Workers** | **$2,020/mo** |

**Break-even at scale:** $2,020/mo infra vs. ~$2,450/mo from ~35 paying customers. Unit economics positive at PRO tier. Add customer pagination (TieredRollbackController, queue throttling) for 100+ tenants; not required at go-live scope.

---

## 7. Implementation Priority

| Priority | Agent | Effort | Risk | Rationale |
|----------|-------|--------|------|----------|
| **P0** | MCP Server | 2d | Low | Unlocks all external integrations |
| **P0** | SignalProviderOnboarding | 3d | Low | Marketplace MVP requirement |
| **P1** | LeadHunter | 2d | Low | Reuse Telegram bot + trial-drip |
| **P1** | BillingAgent | 2d | Medium | NOWPayments IPN wiring already 80% done |
| **P1** | customer-success agent + strategy-lab | 3d combined | Low | Thin wrappers over existing services |
| **P2** | ContentAgent | 0.5d | Very low | Phase 32 AutoMarketingDaemon already running |

---

## 8. Trade-offs & Risks

| Decision | Trade-off | Risk |
|----------|-----------|------|
| CF Workers for MCP (not Durable Objects) | No persistent WebSocket per session; must poll SSE | Medium — fine at <1k concurrent subs |
| 3-tier agent model (MekongMind + marketplace + execution) | Adds operational complexity | Low — clear ownership per tier |
| Reuse DeepSeek R1 for content | Model availability depends on third party | Low — fallback to templates exists |
| Queue-based agent dispatch (BullMQ) | Adds latency (~200ms) vs. sync | Low — acceptable for "agentic" responses |
| Single codebase for 19+6 new agents | Monolithic deploy | Medium — mitigate with feature flags; split when agents > 30 |

---

## 9. Unresolved Questions

1. **NOWPayments IPN currency:** Research uses NOWPayments endpoint, SOP says NOWPayments primary. Is USDT TRC20 settled on-chain or via CF Pay? Platform doctrine requires "self-configuring, no operator credentials" — clarify settlement path to avoid operator involvement.
2. **MCP streaming auth:** SSE signals for `get_consensus` need real-time auth revocation mid-session. Current license gate is request-scoped. Needs design review before P0 implementation.
3. **LeadHunter vs. Telegram rate limits:** Telegram Bot API limit is 30 msgs/sec to distinct chats. At 100 FREE users with daily drip, 1 msg/user/day = negligible. Recheck at 1k+ scale.
