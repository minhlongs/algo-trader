# Signals API Marketplace -- Ideation Plan

> **Plan ID:** 260705-0025-signals-api-ideation
> **Created:** 2026-07-05
> **Stage:** Ideation (Pre-Implementation)
> **Project:** Algo Trader -- Signals API Marketplace
> **Lang:** EN + VN (client-facing sections)

---

## 1. Executive Summary (Tong Quan)

**English:**
The Signals API Marketplace concept proposes building a unified trading signal aggregator platform -- a single API + unified billing layer that lets subscribers discover, compare, and consume signals from multiple providers through one integration. The platform also provides trust infrastructure (on-chain verifiable track records), agent-native access (MCP, x402 micropayments), and a self-learning ML fusion engine.

**Vietnamese:**
Signals API Marketplace la mot nen tang tong hop tin hieu giao dich (trading signal) thong nhat -- mot API duy nhat + lop thanh toan tap trung cho phep nguoi dung kham pha, so sanh va nhan tin hieu tu nhieu nha cung cap chi qua mot tich hop duy nhat. Nen tang cung cung cap co so ha tang tin cay (ho so theo doi co the xac minh tren chain), truy cap cho AI agent (MCP, x402 micropayments), va co che tong hop tin hieu tu hoc (ML fusion engine).

---

## 2. Stage Gate Status

| Gate | Status | Detail |
|------|--------|--------|
| **GO/NO-GO** | GO | Score: **21/30** -- Market opportunity justifies investment |
| **BMC** | COMPLETE | 9-block tri-layer canvas (Business / Agentic / Governance) |
| **PRD** | COMPLETE | Vision, MVP, GTM strategy, pricing, metrics, risks |
| **Research** | COMPLETE | Competitive landscape, TAM, buyer pain points, success factors |
| **Codebase Audit** | COMPLETE | 10 significant gaps identified for hardening sprint |

---

## 3. GO/NO-GO Verdict

**Total Score: 21/30 -- GO**

| Dimension | Score (1-5) |
|-----------|-------------|
| Market Size | 5 |
| Problem Clarity | 4 |
| Differentiation | 3 |
| Unit Economics | 3 |
| Execution Feasibility | 2 |
| Agentic Fit | 4 |

**Key Rationale:**
- $21B TAM with no dominant aggregator -- massive whitespace
- Five validated buyer pain points, each independently worth solving
- Agentic/AI-native positioning (MCP, x402, fusion engine) provides genuine differentiation
- Strongest GTM thesis: build the aggregator/marketplace layer, not another signal provider

**Critical Risks Requiring Pre-Launch Resolution:**
- Execution feasibility scored lowest at 2/5 -- dedicated hardening sprint required
- In-memory subscriber state is a production showstopper (lost on restart)
- Three overlapping subscribe implementations create integration confusion
- Pricing inconsistency ($49 vs $99/mo PRO) must be resolved
- No OpenAPI spec -- external subscribers cannot discover the API surface

---

## 4. BMC Summary

### 4.1 Value Propositions (Gia Tri)

| Layer | Core Proposition |
|-------|-----------------|
| **Business** | Single API + unified billing across multiple signal providers; trust infrastructure with on-chain signals; execution bridge eliminating manual latency; standardized quality scores |
| **Agentic** | MCP-native API; x402 pay-per-signal (HTTP 402 micropayments); agent-discoverable signal registry; self-learning ML fusion engine |
| **Governance** | Provenance verification chain; burn-to-unlock dispute system; provider bonding/slashing; privacy-scoped zero-knowledge tiers |

### 4.2 Customer Segments (Khach Hang)

| Layer | Segments |
|-------|----------|
| **Business** | Retail algo traders ($29-99/mo), AI agent developers (pay-per-call), quant hobbyists, crypto fund operators, signal providers (supply side) |
| **Agentic** | Autonomous agent swarms, LLM-hosted trading bots, prediction market cross-arb agents |
| **Governance** | Bad-faith providers (bond/slash), API abusers (rate limits), unregulated entities (jurisdiction filtering), subscription fraud |

### 4.3 Revenue Streams (Doanh Thu)

| Model | Pricing |
|-------|---------|
| **Tiered subscription** | $0 FREE / $99 PRO / $299 ENTERPRISE |
| **Platform commission** | 10-15% from signal providers |
| **x402 pay-per-signal** | $0.01-0.05/call |
| **Enterprise licensing** | $499-1,999/mo |
| **Fusion engine add-on** | $49/mo |
| **Provider verification badge** | $9.99/mo |

### 4.4 Cost Structure (Chi Phi)

| Category | Estimated |
|----------|-----------|
| Cloudflare Workers/D1 | $20-200/mo |
| NOWPayments per-tx fee | ~0.5% |
| Developer hardening sprint | One-time 2-4 weeks |
| Codebase debt remediation | One-time 1-2 weeks |
| L2 gas (x402) | $0.001-0.01/tx, passed through |

### 4.5 Key Activities (Hoat Dong Chinh)

| Priority | Activity | Timeline |
|----------|----------|----------|
| P0 | D1 migration (in-memory -> persistent subscriber state) | 2-3 days |
| P0 | Consolidate 3 subscribe implementations | 1-2 days |
| P0 | Write OpenAPI spec | 3-5 days |
| P0 | Wire NOWPayments at resolved $99 PRO | 1 day |
| P0 | Fix dead feature-gate code | 1 day |
| P1 | Implement MCP server | 3-5 days |
| P1 | Build usage metering | 2-3 days |
| P2 | Hash-commit signals | 2-3 days |

---

## 5. Key Findings (Phat Hien Chinh)

1. **Market whitespace:** No dominant "app store for trading signals" exists -- fragmented siloed providers with no standard aggregator
2. **Trust is the #1 unsolved problem:** 99.9% of providers are inexperienced, no independent verification, frequent fraud
3. **Codebase has 10 significant GTM gaps:** In-memory state, route duplication, pricing inconsistency, dead feature-gate code, missing docs
4. **Agentic positioning is genuine differentiation:** MCP, x402, ML signal ingest, self-learning fusion engine -- most competitors lack these
5. **Subscription primary, x402 secondary:** Recommended GTM model prioritizes $99/$299 subscriptions with x402 as an agent-native add-on

---

## 6. GTM Strategy (4 Phases)

| Phase | Timeline | Focus |
|-------|----------|-------|
| Phase 0 | Weeks 1-4 | Infrastructure hardening -- D1 migration, route consolidation, OpenAPI spec, pricing fix, legal |
| Phase 1 | Weeks 5-8 | Developer preview invite-only, FREE tier only, seed with internal signals |
| Phase 2 | Weeks 9-12 | Paid tiers live at $99/$299, provider recruitment, Telegram bot |
| Phase 3 | Weeks 13-16 | Agent-native -- x402, MCP marketplace, fusion engine |
| Phase 4 | Weeks 17+ | Scale -- enterprise licensing, affiliate program, SEO |

---

## 7. Success Metrics

| Metric | Target |
|--------|--------|
| Monthly Active Signal Consumers (MASC) | North Star |
| Paid conversion | >8% |
| Time-to-first-signal | <2 minutes |
| Active providers by M6 | >5 |
| MRR at month 12 | $15K |
| Paying subscribers at month 12 | 150-200 |
| Gross margin | >75% |

---

## 8. Unresolved Questions (Cau Hoi Chua Giai Quyet)

1. **Provider seeding strategy:** Do we approach existing providers directly or build internal signals first to demonstrate value?
2. **Hardening sprint timeline:** Does the 2-week (minimum) codebase remediation delay overall GTM by pushing Phase 1 to Week 5?
3. **Securities law firewall:** Is the current "no investment advice" disclaimer + tier-based signal quality sufficient for US retail?
4. **x402 vs subscription primary:** Should x402 remain a Phase 3 add-on or become a Phase 1 primary GTM model?
5. **Single vs multi-chain for hash commitments:** Base-only for initial launch, or Solana/Ethereum from day one?

---

## 9. Related Documents (Tai Lieu Lien Quan)

| File | Description |
|------|-------------|
| `go-nogo-report.md` | Full GO/NO-GO scorecard with detailed scoring |
| `bmc.md` | Business Model Canvas -- 9-block tri-layer analysis |
| `prd.md` | Product Requirements Document -- vision, MVP, GTM, risks |
| `reports/researcher-report.md` | Research findings -- competition, TAM, pain points |
