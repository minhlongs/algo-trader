# Legal / Compliance / ESG Brief

**Date:** 2026-07-05
**Asset:** AlgoTrade (mekong/algo-trader) -- Signals API Marketplace + RaaS trading platform
**Scope:** Regulatory checklist across Business, Agentic, Governance layers

---

## [Business Layer] -- Platform & Revenue Compliance

### Securities Law: Signal-as-a-Service

The core regulatory exposure is whether trading signals constitute "investment advice" (regulated) or "data products" (unregulated). AlgoTrade's position: signals are unopinionated data output from ensemble models, presented without buy/sell recommendations. Three tiers of risk:

| Exposure | Severity | Current State | Required Action |
|----------|----------|--------------|-----------------|
| US SEC -- signal = investment advice | HIGH | TOS disclaimers exist; no formal securities counsel review | Engage securities counsel before paid tiers launch. TOS must state "data product, not advice, not a recommendation." No performance-based pricing (20% profit share triggers investment contract analysis under Howey). |
| CFTC -- prediction market signals | MEDIUM | Kalshi is CFTC-regulated; Polymarket geo-blocks US. Signals about regulated markets may inherit scrutiny. | Separate TOS sections for Polymarket (non-US) vs Kalshi (CFTC). Disclaimers must explicitly state no solicitation of US persons for non-compliant markets. |
| EU/AU -- regulatory divergence | LOW | No EU customers anticipated at MVP | Geo-block EU during MVP. Revisit if EU demand emerges. |

**Checklist:**
- [ ] Securities counsel review of TOS and pricing model (pre-Phase 2)
- [ ] TOS update: "AlgoTrade Signals are data outputs. Not investment advice. Not a recommendation to buy/sell."
- [ ] No performance-based pricing (no Howey risk)
- [ ] Separate Kalshi disclaimer for CFTC compliance
- [ ] Jurisdiction gating at signup (Phase 0)

### KYC/AML Infrastructure

Existing codebase has a complete KYC system: `src/platform/api/routes/kyc-routes.ts` with POST `/init`, GET `/status`, GET `/status/:tenantId`. It is BYOK (customer brings own Persona API key), tied to PRO+ tiers, with `basic`/`advanced`/`full` verification levels. PostgreSQL-backed with `kyc_verifications` table.

| Tier | KYC Required | Current State | Gap |
|------|-------------|--------------|-----|
| FREE | None | No gating | OK for MVP |
| PRO ($99/mo) | Basic identity | Built, BYOK pattern | No automated proof-of-personhood. Manual Persona integration. |
| ENTERPRISE ($299/mo) | Advanced or Full | Admin lookup endpoint exists | No escalation path or SLA |

**Checklist:**
- [ ] KYC routes verified working (test file exists at `src/platform/api/__tests__/kyc-routes.test.ts`)
- [ ] Persona API key env var documented for BYOK customers in Setup Wizard
- [ ] Consider proof-of-personhood (Gitcoin Passport, World ID) as lighter-weight alternative for PRO tier
- [ ] No KYC for FREE tier -- privacy compatibility

### NOWPayments Compliance

Crypto payments carry their own regulatory vectors:

| Risk | Mitigation |
|------|-----------|
| NOWPayments processes via non-custodial swap -- no fiat on-ramp at AlgoTrade level | Keep. Reduces MSB/money transmitter classification risk. |
| Invoice creation stores tx metadata (tier, timestamp, wallet) | No PII in NOWPayments flow. User wallet address is pseudonymous for billing. |
| Refund/cancellation complexity in crypto | TOS must state: "All crypto payments are final. No chargebacks. Tier downgrades take effect at next billing cycle." |
| NOWPayments IPN webhook failure = tier not activated | IPN handling must have retry + manual override admin endpoint. Confirm test coverage. |

**Checklist:**
- [ ] TOS: crypto payment is final, no refunds, downgrades end-of-cycle
- [ ] IPN webhook retry verified (idempotency key per IPN notification)
- [ ] Admin tier-override endpoint for manual activation on IPN failure
- [ ] No fiat on-ramp (preserves non-MSB status)

### Data Privacy & GDPR

| Requirement | Status | Action |
|------------|--------|--------|
| Privacy Policy | Missing | Draft before paid tiers go live. Covers: what signals data is collected, API key tracking, NO sale of personal data. |
| Data Processing Agreement (DPA) | Not needed at MVP | Add when enterprise tier launches (Phase 4). |
| Right to deletion endpoint | Not built | Add `DELETE /api/v1/account` that purges API keys + KYC data. |
| Cookie consent (developer portal) | Not needed | No tracking cookies on marketplace landing page. Only session cookies for auth. |
| Data retention policy | Not documented | Signals feeds: retain 90d for quality scoring. Deleted on account closure. |

**Checklist:**
- [ ] Draft Privacy Policy (pre-Phase 1)
- [ ] Build `DELETE /api/v1/account` endpoint (Phase 0 or 1)
- [ ] Document data retention in Privacy Policy: 90d signal logs, immediate API key invalidation, KYC data retained per provider requirements.

---

## [Agentic Layer] -- AI Agent Compliance

### AI Agent Self-Service Risk

AlgoTrade's planned MCP-native + x402 pay-per-signal model enables AI agents to subscribe and consume signals autonomously. This creates novel compliance patterns:

| Risk | Severity | Mitigation |
|------|----------|------------|
| Agent subscribes without human authorization -- who is the "customer"? | Medium | x402 billing requires pre-funded wallet. Treat wallet owner as counterparty. MCP discovery does NOT auto-subscribe -- agent discovers signals, human approves via wallet signature. |
| Agent generates unlawful trading activity under human direction | Low | Application-layer (AlgoTrade controls what signals it delivers) not agent-layer. Same KYC/TOS apply regardless of client type. |
| Agent-to-agent referral = human regulatory gap | Low | Referral credits attach to wallet, not agent. Human ultimately redeems. |
| Autonomous agent generates high-volume trading that violates position limits | Low | Position limits enforced server-side by AlgoTrade compliance engine (`compliance-rules.ts` already implements `POSITION_001`, `VOLUME_001`). Agent cannot bypass. |

**Decision required:** Does the MCP server require a human wallet signature before first API call, or is the "sign in with wallet" flow sufficient for non-KYC tiers? Recommended: wallet signature = acceptance of TOS + terms. No separate human click-through for agent-initiated discovery.

### LLM Output Compliance

AlgoTrade uses DeepSeek R1 + Nemotron-3 Nano for signal generation. LLM-generated signals have specific compliance concerns:

| Concern | Mitigation | Status |
|---------|-----------|--------|
| Hallucinated market data contaminating signal | On-chain hash commitment at publish time provides audit trail. Ensemble voting reduces hallucination impact. | Planned (Phase 1) |
| Model bias in signal generation (e.g., favoring certain assets) | Regime detection + 52-strategy diversity provides natural hedge against single-model bias. | Built. Running. |
| Explainability -- can AlgoTrade explain why a signal was generated? | Each signal includes a `reason` field with model weights and regime context. | Built (signal schema) |
| Regulatory concern: "black box" financial advice | AlgoTrade does NOT output "BUY $10K of ETH." Output is probability-based signal: `{asset: "ETH", direction: "long", confidence: 0.67, horizon: "4h", reason: "regime_detection:trend_following"}`. This is data, not advice. | Design-level. Needs verification. |

**Checklist:**
- [ ] Verify signal schema includes `reason` field with non-directional description
- [ ] Document LLM signal generation in TOS: "Outputs are probabilistic model predictions, not financial advice."
- [ ] No directional language in API responses (no "buy"/"sell" strings -- use `direction: "long"|"short"|"neutral"`)
- [ ] Ensemble voting architecture documented for transparency

### Agent Identity & Attribution

| Requirement | Status | Action |
|------------|--------|--------|
| API key per agent/customer | Built | API key management in developer portal |
| Agent-to-key binding for audit trail | Not built | Phase 3 (optional key alias field for agent identification) |
| Rate limit attribution per agent | Built | Per-key rate limits |
| MCP server authentication | Planned | Same API key model, MCP-compatible auth headers |

---

## [Governance Layer] -- ESG + Risk Oversight

### ESG Framework

AlgoTrade as a solo-company SaaS has minimal ESG footprint. The relevant dimensions:

| Dimension | Assessment | Action |
|-----------|-----------|--------|
| **Environmental (E)** | Low impact. Cloud Workers + D1 are negligible carbon. ML inference runs on M1 Max (Apple Silicon, 65W TDP) -- not datacenter GPU. No mining, no PoW. | No meaningful action needed at current scale. Consider offsetting compute at >$5K/mo cloud spend. |
| **Social (S)** | Crypto trading is high-risk. Retail traders can lose capital. AlgoTrade bears no fiduciary duty but should not gamify risk. | No "double or nothing" language. No leverage-promoting content. Risk disclaimer on every dashboard and API response. |
| **Governance (G)** | Solo founder with 6 C-level AI agents via MekongMind. No board, no independent directors. Decision-making is centralized in a single human. | Document decision authority. No single point of failure for key operational decisions (revenue, security). Agent SOPs must include escalation rules. |

**ESG Checklist:**
- [ ] Risk disclaimer on dashboard + API responses: "Trading involves risk of capital loss. Past signal accuracy does not guarantee future results."
- [ ] No gamification or "leaderboard" of signal accuracy that incentivizes reckless trading
- [ ] Decision authority doc: which decisions require human (founder), which can autonomous agent execute, which auto-escalate
- [ ] Carbon accounting: `npm install` / compute cost tracking optional -- not material until >$5K/mo infra

### Compliance Rules Engine (Already Built)

The codebase at `src/desk/arbitrage/compliance/` has a working compliance engine:

| Rule | File | Status | Gap |
|------|------|--------|-----|
| Sanctions screening | `compliance-rules.ts` `SANCTIONS_001` | Built, rule engine exists | Sanctions list is empty (commented as "in production, would check OFAC/UN/EU lists"). Needs API integration (e.g., Chainanalysis, Elliptic, or open OFAC SDN list). |
| Position limits | `compliance-rules.ts` `POSITION_001` | Built, hardcoded $1M max | Need tier-based limits (PRO $100K, ENTERPRISE $1M, MASTER custom). |
| Jurisdiction gating | `compliance-rules.ts` `JURISDICTION_001` | Built, blocks KP/IR/SY/CU | Need US-based detection for Polymarket vs Kalshi routing. Current list is OFAC minimum. Expand for MVP? |
| Daily volume limits | `compliance-rules.ts` `VOLUME_001` | Built, $100K single trade | Should be per-tier configurable. |

**Checklist:**
- [ ] Connect sanctions engine to live OFAC SDN list API (or at minimum a regularly updated embedded list)
- [ ] Make position limits, volume limits tier-configurable (D1-backed config table)
- [ ] Test: `npx vitest run src/desk/arbitrage/compliance/__tests__/` if tests exist, or write them
- [ ] Audit log (`AuditEntry` interface exists) -- wire to D1 for persistence

### Incident & Dispute Resolution

| Capability | Status | Action |
|-----------|--------|--------|
| Provider quality dispute | Not built | Phase 2. Centralized (platform decides) for MVP. On-chain governance deferred. |
| False signal / misrepresentation | Not built | Provider bonding contract (Phase 2). Manual review for Phase 1. |
| API abuse detection | Not built | Rate limits per key mitigate. Anomaly detection (unusual call patterns) is Phase 3. |
| User data breach notification | Not documented | Add to runbook: process for notifying affected users within 72h of confirmed breach. |
| SOC2 / ISO 27001 | Not applicable at current scale | No customer data of type that requires SOC2. KYC data is BYOK (customer Persona account). Signals data is public market data. |

**Decision required:** For Phase 1 disputes (internal signals from AlgoTrade engine), there are no third-party providers. Dispute resolution admin panel is nice-to-have not need-to-have. Defer to Phase 2.

### Top Unresolved Questions

1. **Securities counsel timeline:** Who engages securities counsel and how long does the review take? Phase 2 (paid tiers) cannot launch without this. Is pre-Phase 1 engagement feasible?

2. **US jurisdiction gating precision:** Geo-IP blocking of US at signup is coarse but SAFE for MVP. Does the cost (losing US developers for Beta) justify the risk (SEC scrutiny)? Recommended: block US for Phase 1 free tier too, revisit post-counsel.

3. **Sanctions list refresh cadence:** OFAC SDN list changes frequently. Is a cron job acceptable for refresh, or does this need real-time webhook? At MVP scale, daily cron + manual override is sufficient.

4. **Agent accountability:** If an AI agent trades on AlgoTrade signals and causes loss, who bears liability? TOS position: AlgoTrade provides data, agent operator makes decisions. But first test case sets precedent.

5. **Carbon offset commitment:** Material? At <$200/mo cloud spend, no. Trigger offset when infrastructure spend exceeds $5K/mo.

---

*Report saved to: `/Users/macbook/algo-trader/plans/260704-0941-signals-api-marketplace/reports/workflow-subagent-260705-0113-legal-compliance-esg-brief.md`*
