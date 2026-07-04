# Fundraising + Risk Brief: Cap Table & Risk Register

**Date:** 2026-07-05
**Context:** Signals API Marketplace GTM + AlgoTrade scale-up
**Company:** AlgoTrade (CashClaw brand) -- Pre-revenue, Scale-Up stage, Solo-operated

---

## [BUSINESS LAYER]

### Current Cap Table (Pre-Seed, 100% Founder)

| Holder | Stake | Basis | Notes |
|--------|-------|-------|-------|
| **billwill (founder)** | 100% | Sweat equity: 731 commits, 886 files, 52+ strategies, 3,194 tests | Full-time solo operator. No outside capital to date. |
| **Option pool** | 0% (unallocated) | N/A | Pre-seed: carve out recommended post-close |
| **Total** | **100%** | $0 capital raised | $0 revenue. $0 burn. $0 outside cap table. |

### Fundraising Ask (Recommended)

| Parameter | Proposed | Rationale |
|-----------|----------|-----------|
| **Round** | Pre-seed (Friends & Family / Angel) | No institutional traction yet. Pre-revenue. Solo founder. |
| **Target** | $50K-$150K | 12-18 month runway at solo-operator burn (~$2-5K/mo current personal, infra ~$500-800/mo at scale). |
| **Post-money valuation basis** | $1.5M-$3M | Precedent: solo developer platforms with production codebase (52 strategies, 3,194 tests, live billing infra) at $500K-$3M pre-seed. Premium for codebase depth, no premium for revenue (none). |
| **Dilution at $100K raise** | 3.3%-6.7% | At $1.5M post: 6.7%. At $3M post: 3.3%. Founder retains control. |
| **Option pool** | 10% post-money | Reserved for future developer hires, community advisors, agent operator incentives. Carve from founder at close. |
| **Instrument** | SAFE with MFN | Simple, standard, no valuation cap needed if priced round within 18 months. Avoid convertible note (maturity risk for pre-revenue). |

### Use of Funds ($100K Scenario)

| Use | Amount | Detail |
|-----|--------|--------|
| **Infrastructure hardening (Phase 0)** | $15K | D1 migration, API consolidation, OpenAPI spec, legal review (securities TOS). 2-4 weeks dev time. |
| **Developer portal + docs** | $20K | Self-serve onboarding, interactive API docs, usage dashboard, MCP server. 3-5 weeks. |
| **Marketing GTM** | $25K | Community seeding (Discord/Telegram ads), SEO content, trading community sponsorships, referral incentives. 6 months. |
| **Compliance & legal** | $10K | Securities law firewall review, jurisdiction gating, terms of service, provider agreements. |
| **Solo operator runway** | $30K | 6 months personal runway at $5K/mo. Extends to 12mo if burn optimized. Zero revenue needed before year 1. |

### Financial Projections (3 Scenarios)

| Metric | Bear (30% prob) | Base (50% prob) | Bull (20% prob) |
|--------|----------------|-----------------|-----------------|
| **Month 6 MRR** | $500 | $3,000 | $12,000 |
| **Month 12 MRR** | $2,000 | $15,000 | $50,000 |
| **Month 12 ARR** | $24K | $180K | $600K |
| **Paying subscribers (M12)** | 15-25 | 150-200 | 400-600 |
| **Path to $1M ARR** | Unlikely (<10%) | 24-30 months | 12-18 months |
| **Runway consumed** | $60K (12mo) | $60K (12mo) | $60K (12mo; revenue-positive by M9) |
| **Unit economics note** | All scenarios assume 75%+ gross margin (infra is Cloudflare Workers/D1). COGS scales sub-linearly. |

**Base case recovery:** If signups >50/week by Phase 2 and free-to-paid conversion >8%, the $1M ARR path is reachable in 24 months. The single largest variable is not product quality -- it is customer acquisition cost and channel leverage.

### Key Business Risks (Probability / Impact Matrix)

| Risk | Prob | Impact | P x I | Mitigation |
|------|------|--------|-------|------------|
| Zero-to-one adoption failure (nobody signs up) | Medium | Critical | **HIGH** | Seed with internal signals. Preview with 50 invited devs. Leverage existing @Sophia_Bbot base (~3K users). |
| No third-party signal providers join marketplace | Medium | Critical | **HIGH** | Do NOT depend on third-party supply for MVP. Internal algo-trader engine seeds the marketplace. Provider onboarding is Phase 2+, not Phase 1. |
| Free tier cannibalizes paid conversion | Medium | Medium | MEDIUM | Free tier is aggressively rate-limited: 2 sig/min, 1K/mo, 1 provider. Value gap to PRO ($99/mo) is obvious. |
| Securities law exposure (signals = investment advice) | Low-Med | Critical | **HIGH** | Phase 0: legal review. TOS firewall ("signals are data, not advice"). Jurisdiction gating for US retail until counsel clears. Reversible. |
| Churn >15%/mo (product-market mismatch) | Medium | High | MEDIUM | Standardized quality scores. Fusion engine diversifies. Auto-throttle worst performers. <8% target churn. |

---

## [AGENTIC LAYER]

### The MekongMind Multiplier

AlgoTrade is not "a solo founder with a codebase" -- it is a **solo-operator company with 6 defined C-level agents** operating via MekongMind orchestration. This is material to investors for two reasons:

**Operational leverage:**
- 6 C-level roles (CEO, CTO, Product, Revenue, Marketing, Ops) operate via SOP-driven agents, not human employees
- $0 personnel overhead for department-level functions
- 30 blog posts/month auto-generated, 30 social posts/month auto-posted -- zero human content labor
- Automated referral program, Telegram marketplace, email drip campaigns -- all code-driven, all agent-triggered
- Department SOPs in `sops/departments/` -- institutional knowledge is structural, not personal

**Capital efficiency:**
- At $100K raise, effective "team size" from an operations standpoint: 6 departments, $0 salary
- Traditional startup with equivalent output: 3-5 FTE at $300K-750K/yr burn
- Deploy frequency and test coverage (3,194 tests, 731 commits) exceed most seed-stage teams of 5-10 people

### Agentic Risks

| Risk | Prob | Impact | Mitigation |
|------|------|--------|------------|
| Key-person dependency on billwill (solo operator) | High | Critical | Agent SOPs document institutional knowledge, but agent orchestration is a thin layer over the founder's judgment. Single point of failure for strategic decisions, major pivots, fundraising. **No human backup exists for any C-level role.** |
| Agent orchestration quality variability | Medium | Medium | MekongMind harness is stable (731 commits, 32/37 phases done) but LLM quality fluctuates. Incorrect agent decisions could affect customer-facing systems (pricing, support responses, content quality). |
| Autonomous spending risk | Low-Med | Medium | Agents could trigger paid API calls (OpenRouter, Telegram API, SendGrid) at unexpected scale. Budget controls needed if agents have spending authority. Currently no agent has spending keys. |
| Agent-to-Agent (A2A) protocol fragility | Low | Low | MCP tools and agent handoffs are reliable in testing but untested under production load. Would affect marketplace operations if agents coordinate customer provisioning. |

### Cap Table Implication (Agentic)

No equity for agents. The MekongMind orchestration system is a tool, not an entity. However:

- **If agent operators are hired:** Then key-person risk drops but payroll burn rises. Recommend hiring a human CTO or COO only after $200K+ MRR justifies salary.
- **If agent SOPs are licensed/transferred:** The agent SOP structure in `sops/departments/` is the company's proprietary operational playbook. It should be treated as IP in any acquisition diligence.
- **Recommendation:** Do not carve equity for "agent roles." The agents are not stakeholders; they are tools. If a human operator is hired to oversee an agent department, equity is standard at market rate.

---

## [GOVERNANCE LAYER]

### Risk Register (Consolidated, Ranked)

| # | Risk | Layer | Prob | Impact | Status | Mitigation / Owner |
|---|------|-------|------|--------|--------|-------------------|
| R1 | In-memory subscriber state lost on restart | Codebase | Certain | Critical | **ACTIVE -- P0 FIX** | Migrate to D1 before any paid tier. Phase 0 non-negotiable. Owner: billwill. |
| R2 | 3 overlapping subscribe implementations cause integration errors | Codebase | Certain | High | **ACTIVE -- P0 FIX** | Consolidate to single router in Phase 0. Owner: billwill. |
| R3 | No OpenAPI spec blocks dev adoption | GTM | Certain | High | **ACTIVE -- P0 FIX** | Generate from code. Public before Phase 1. Owner: billwill. |
| R4 | Securities law exposure (US retail) | Legal | Low-Med | Critical | **ACTIVE -- P0 FIX** | Legal review. Jurisdiction gating. TOS firewall. Owner: billwill + counsel. |
| R5 | Zero-to-one adoption failure (nobody signs up) | GTM | Medium | Critical | **MONITOR** | Seed with 50 invited devs. Telegram bot existing base (~3K). Internal signals seed marketplace. |
| R6 | Key-person dependency (solo founder) | People | High | Critical | **ACCEPTED** | Cannot fully mitigate pre-revenue. Partial: document SOPs, automate everything possible. Hire only after $200K+ MRR. |
| R7 | No third-party signal providers join | Marketplace | Medium | Critical | **MONITOR** | Do not depend on external supply for MVP. Internal algo-trader signals seed the marketplace. |
| R8 | Free tier cannibalizes paid conversion | Revenue | Medium | Medium | **ACCEPTED** | Aggressive rate limits on free tier. Value gap to PRO is obvious. |
| R9 | Prediction market accuracy plateau (67% Polymarket accuracy is ceiling) | Product | Low-Med | High | **MONITOR** | Cross-venue quality filtering (Kalshi 78%, PredictIt 93%). Multi-provider fusion. Composite signals > single source. |
| R10 | x402 micropayment adoption too slow | Revenue | Low | Low | **ACCEPTED** | Subscription is primary revenue model. x402 is exploratory differentiation, not a dependency. |
| R11 | API abuse / credential sharing | Security | Medium | Medium | **MONITOR** | Rate limits per key. Anomaly detection. Tier enforcement on subscription endpoints. |
| R12 | LLM inference cost creep (if fusion engine scales) | Cost | Low-Med | Medium | **MONITOR** | Fusion is batch-oriented, not real-time. MLX on M1 Max = $0 inference for up to moderate scale. Cloud inference needed only beyond 10K+ signals/day. |
| R13 | Agent orchestration quality failure affects customers | Operations | Medium | Medium | **MONITOR** | Human-in-the-loop for payment, support, and legal agent actions. Automated content reviewed periodically. |
| R14 | Competitor copies MCP-native + x402 model | Market | Medium | Medium | **ACCEPTED** | First-mover advantage in prediction market signals. Moat is strategy count (52+), quality filtering, and trust infrastructure, not MCP protocol. |
| R15 | Polymarket rule changes break signal pipeline | Regulatory | Medium | High | **MONITOR** | Feb 2026 fee changes already absorbed (maker strategies now meta). Architecture abstracts exchange-specific logic. Multi-venue (Kalshi, Limitless) reduces single-platform dependency. |

### Scenario Analysis

**Best Case (20% prob -- Path to $1M ARR in 12-18 months):**
- Trigger: MCP-native discovery drives agent adoption viral. Prediction market volume continues 20x growth trajectory. Polymarket Bot market unmet demand materializes.
- Indicators: >50 signups/week by Phase 2, >8% paid conversion, >20% MoM MRR growth by Month 6
- Action: Accelerate provider recruitment. Hire agent operator. Expand to Kalshi/Limitless coverage. Enterprise licensing.
- Go-to-market acceleration: From Phase 2 to Phase 4 in 8 weeks (not 12).

**Base Case (50% prob -- Path to $180K ARR in 12 months):**
- Trigger: Steady dev adoption via developer portal + Telegram + trading communities. Seed signals sufficient for MVP. 150-200 subscribers at $99 ARPU by M12.
- Indicators: 20-50 signups/week, 5-8% paid conversion, 10-15% MoM MRR growth
- Action: Follow planned phases. No acceleration. No hires. Maintain solo operation.
- Key inflection: Month 8-9, when MRR covers personal runway ($3K-5K/mo). Founder fully O帴.

**Worst Case (30% prob -- Sub $24K ARR, product fails to gain traction):**
- Trigger: Zero-to-one adoption wall. No developer community traction. Free tier users do not convert. Prediction market growth slows.
- Indicators: <20 signups/week by Phase 2, <3% paid conversion, <$500 MRR by Month 6
- Action: Pivot to B2B enterprise signals licensing (higher ARPU, longer sales cycle). Or pivot to internal algo-trader execution (live trading) instead of marketplace. Or shut down marketplace, keep internal trading operation.
- Kill criterion: Month 9 MRR < $1K AND burn rate > $5K/mo AND no strategic partnership in pipeline.

### Governance Decision Log (Critical Open Questions)

| Question | Options | Recommended Decision | Status |
|----------|---------|---------------------|--------|
| Seed marketplace with internal signals or wait for third-party providers? | (A) Internal signals only for Phase 1-2, recruit in Phase 3. (B) Recruit before launch. | **A.** Internal algo-trader engine seeds MVP. Faster to market. | **Resolved** |
| x402 vs subscription as primary revenue model? | (A) Dual-track from launch. (B) Subscription MVP, x402 Phase 2. | **B.** Subscription primary. x402 is differentiation, not revenue dependency. | **Resolved** |
| Jurisdiction gating at signup? | (A) Global access with TOS firewall. (B) Restrict US retail until legal review. | **B.** Restrict US retail. Reversible after legal clearance. | **Resolved** |
| Raise SAFE vs priced round? | (A) SAFE with MFN. (B) Priced seed round. | **A.** SAFE. Simpler, faster, no valuation negotiation for pre-revenue solo op. | **Recommended** |
| Carve option pool before or after fundraise? | (A) Pre-money pool (dilutes founder only). (B) Post-money pool (dilutes all). | **B.** Post-money 10% pool. Standard practice. | **Recommended** |
| Hire human backup for key roles before or after revenue? | (A) Pre-revenue: hire part-time CTO/COO. (B) Post-revenue: hire after $200K+ MRR. | **B.** Maintain solo operation until revenue justifies salary. Agent SOPs are the backup. | **Recommended** |

### Summary Risk Heat Map

```
          Impact
          Low    Med    High   Critical
Prob
  Certain  --     --     R2,R3   R1
  High     --     --     --      R6
  Medium   R10   R8,R11  R9,R14  R5,R7,R15
           R12   R13,R4(R4=low-med prob)
  Low      --    --     --      --
```

**Three risks requiring immediate action (Phase 0):**
1. **R1** -- In-memory state (D1 migration)
2. **R4** -- Securities law exposure (legal review + jurisdiction gating)
3. **R2, R3** -- API consolidation + OpenAPI spec (development standard, not fundraising-blocking)

---

**Output:** `/Users/macbook/algo-trader/plans/260704-0941-signals-api-marketplace/reports/workflow-subagent-260705-0112-fundraising-risk-brief.md`
**Status:** DONE
**Summary:** Tri-layer fundraising and risk brief covering Business (cap table, financial projections with 3 scenarios, $100K pre-seed ask), Agentic (MekongMind operational multiplier vs. key-person risk), and Governance (15-item consolidated risk register, scenario analysis with kill criterion, critical decision log resolved).
