# GO/NO-GO Report -- Signals API Marketplace

> **Date:** 2026-07-05
> **Stage:** Ideation Gate
> **Verdict:** GO (21/30)
> **Bilingual:** EN + VN

---

## 1. Scorecard Summary (Bang Diem)

| Dimension | Score (1-5) | Weight | Weighted |
|-----------|-------------|--------|----------|
| Market Size | 5 | 1.0x | 5 |
| Problem Clarity | 4 | 1.0x | 4 |
| Differentiation | 3 | 1.0x | 3 |
| Unit Economics | 3 | 1.0x | 3 |
| Execution Feasibility | 2 | 1.0x | 2 |
| Agentic Fit | 4 | 1.0x | 4 |
| **Total** | | | **21/30** |

### Scoring Scale

| Score | Meaning |
|-------|---------|
| 5 | Exceptional -- clear advantage, no concerns |
| 4 | Strong -- minor concerns, well-above average |
| 3 | Good -- competitive, some risks manageable |
| 2 | Weak -- significant concerns requiring mitigation |
| 1 | Poor -- fundamental problem, do not proceed |

---

## 2. Dimension Analysis (Phan Tich Chi Tiet)

### 2.1 Market Size -- Score: 5/5

**English:**
The trading signal marketplace has a $21B TAM (100M+ US retail traders, 40M+ active crypto traders globally). Even 0.1% capture equates to ~$21M ARR -- more than sufficient for a niche B2B SaaS. The global algorithmic trading market projects ~$18.7B incremental growth 2024-2029 (CAGR 15.3%). AI in fintech reaches $22B by 2026. Critically, **no dominant aggregator exists** -- the market is fragmented siloed providers with no standard platform for discovery, comparison, or unified billing.

**Vietnamese:**
Thi truong tin hieu giao dich co TAM 21 ty USD (hon 100 trieu nha giao dich ban le tai My, hon 40 trieu nha giao dich crypto toan cau). Ngay ca khi chi chiem 0.1% thi doanh thu hang nam da dat khoang 21 trieu USD. Thi truong giao dich thuat toan toan cau du bao tang truong them 18.7 ty USD giai doan 2024-2029 (CAGR 15.3%). AI trong tai chinh dat 22 ty USD vao 2026. Quan trong la **khong co nen tang tong hop nao thong tri** -- thi truong bi phan manh boi cac nha cung cap rieng le.

| Metric | Value |
|--------|-------|
| TAM (retail signals) | $21B annually |
| SAM | $4.2B |
| SOM | $2.4B |
| Addressable at 0.1% | ~$21M ARR |
| Algo trading growth | $18.7B incremental, 15.3% CAGR |

### 2.2 Problem Clarity -- Score: 4/5

**English:**
Five critical buyer pain points are clearly validated:
1. **Trust and verification (#1):** Cherry-picked track records, 99.9% of providers inexperienced, no independent verification, frequent fraud
2. **Execution latency:** Signal-to-execution delay destroys edge; slippage collapses risk-reward ratios
3. **Hidden costs:** Spread, slippage, swap fees, subscription fees consume 10-30%+ of gains
4. **Over-signaling:** Groups flood 20+ alerts/day prioritizing engagement over quality; signals ignore individual risk profiles
5. **Fragmentation:** Each provider has own delivery channel; no standard comparison or unified API

Each pain point is independently worth solving. No existing product addresses all five simultaneously. Score is 4 (not 5) because some problems (hidden costs, over-signaling) depend partly on provider behavior the platform cannot fully control.

**Vietnamese:**
Nam van de chinh cua nguoi mua da duoc xac nhan ro rang:
1. **Tin cay (so 1):** Thanh tich duoc chon loc, 99.9% nha cung cap thieu kinh nghiem
2. **Do tre thuc thi:** Cham tre giua tin hieu va thuc thi lam mat loi the
3. **Chi phi an:** Spread, slippage, phi, cuoc -- an 10-30%+ loi nhuan
4. **Tin hieu qua nhieu:** Nhom gui 20+ tin hieu/ngay uu tien tuong tac hon chat luong
5. **Phan manh:** Moi nha cung cap co kenh rieng, khong co API thong nhat

### 2.3 Differentiation -- Score: 3/5

**English:**
Differentiation is solid but not unique across all dimensions:

**Genuine differentiators (competitors lack these):**
- MCP-native API for AI agent discovery and consumption
- x402 HTTP 402 micropayments (USDC on Base/Solana) -- predicted market integrations prove viability
- Self-learning ML fusion engine with EMA-based weight updates
- Existing ML signal ingest pipeline (Qwen M1 Max daemon)

**Commodity differentiators (competitors also claim):**
- Unified API (Polygon.io, Finnhub also offer multi-source)
- Quality scoring (many providers claim this)
- Track record verification (SynapseX has on-chain proofs)

Score is 3 because the aggregation layer alone is not unique -- it is the combination of aggregation + trust infrastructure + agent-native access that creates differentiation.

**Vietnamese:**
Su khac biet la ro rang nhung khong doc nhat tren tat ca cac khia canh. Diem manh that su la ket hop giua tang tong hop (aggregation) + co so ha tang tin cay (trust) + truy cap cho AI agent -- chu khong chi la mot tang tong hop don thuan.

### 2.4 Unit Economics -- Score: 3/5

**English:**
Revenue potential is strong but cost structure has uncertainties:

**Revenue per customer:**
- FREE: $0 (acquisition cost, upsell pipeline)
- PRO: $99/mo -- resolved from $49/$99 inconsistency
- ENTERPRISE: $299/mo
- x402: $0.01-0.05/call
- Platform commission: 10-15% of provider revenue

**Cost per customer:**
- Cloudflare Workers/D1: ~$0.50-2.00/subscriber/mo at scale
- NOWPayments: ~0.5% per transaction
- L2 gas (x402): $0.001-0.01/tx (passed through)
- Customer acquisition via developer communities: TBD

Score is 3 because the pricing inconsistency ($49 vs $99) raises questions about pricing discipline, and customer acquisition costs for developers are not yet validated. Gross margin should exceed 75% at scale.

**Vietnamese:**
Tiem nang doanh thu cao nhung chi phi co nhung bat dinh. Gia PRO chua thong nhat ($49 vs $99) dat ra cau hoi ve ky luat dinh gia. Ty suat loi nhuan du kien tren 75% o quy mo lon.

### 2.5 Execution Feasibility -- Score: 2/5

**English:**
This is the weakest dimension. The codebase audit reveals 10 significant GTM gaps:

| # | Gap | Severity | Impact |
|---|-----|----------|--------|
| 1 | In-memory subscriber state (lost on restart) | CRITICAL | Showstopper for production |
| 2 | Three overlapping subscribe implementations | HIGH | Integration confusion |
| 3 | Pricing inconsistency ($49 vs $99 PRO) | HIGH | Revenue uncertainty |
| 4 | Dead feature-gate code (unwired signal tiers) | MEDIUM | Architectural drift |
| 5 | No OpenAPI spec | CRITICAL | GTM blocker |
| 6 | No tenant isolation in REST cache | MEDIUM | Scaling issue |
| 7 | No usage metering for signals | HIGH | No billing foundation |
| 8 | No self-serve pricing page | HIGH | Cannot buy independently |
| 9 | No signal analytics for subscribers | MEDIUM | Product gap |
| 10 | Startup/deploy wiring not documented | MEDIUM | Ops risk |

**Minimum hardening sprint: 2-4 weeks** before any external launch. This directly impacts GTM timeline.

**Vietnamese:**
Day la khia canh yeu nhat. Kiem tra code phat hien 10 khoang cach GTM quan trong. Can it nhat 2-4 tuan cung co co so ha tang truoc khi ra mat cong chung.

### 2.6 Agentic Fit -- Score: 4/5

**English:**
The Signals API has strong alignment with the agentic/AI-native market trend:

- **MCP protocol support** positions for AI agent discovery (becoming table stakes)
- **x402 micropayments** enable autonomous agent commerce without human wallet approval
- **Existing ML signal ingest** (Qwen daemon) proves the pipeline works
- **Self-learning fusion engine** provides machine-learning-from-machine feedback loop
- **Existing Telegram bot** (@Sophia_Bbot) provides agent-to-human bridge

Score is 4 because x402 infrastructure needs development work and the fusion engine requires production validation.

**Vietnamese:**
Signals API co su phu hop manh me voi xu huong AI agent. MCP, x402, co che tong hop ML, va bot Telegram hien co tao nen loi the canh tranh ma phan lon doi thu thieu.

---

## 3. Key Findings (Phat Hien Chinh)

1. **Market whitespace:** $21B TAM with no dominant aggregator -- massive opportunity for a marketplace layer
2. **Trust infrastructure is the killer feature:** Hash-committed on-chain signals with verifiable track records solve the #1 buyer pain point that no competitor adequately addresses
3. **Codebase requires hardening:** 10 GTM gaps identified, 2 critical showstoppers (in-memory state, missing OpenAPI spec)
4. **Agentic positioning is genuine:** Not just marketing -- MCP + x402 + ML fusion engine provide real differentiation
5. **Pricing must be disciplined:** Resolve $49/$99 PRO inconsistency immediately; NOWPayments $99 is the source of truth

---

## 4. Risks and Mitigations (Rui Ro va Bien Phap)

| Risk | Severity | Mitigation |
|------|----------|------------|
| Execution feasibility (codebase debt) | HIGH | Dedicated 2-4 week hardening sprint before any external launch |
| In-memory subscriber state | CRITICAL | Migrate to D1/SQLite before any paid tier can operate |
| No public API documentation | CRITICAL | OpenAPI spec is P0 requirement before developer preview |
| Pricing inconsistency | HIGH | Resolve to NOWPayments $99 PRO as source of truth |
| Route duplication | HIGH | Consolidate to single subscribe implementation |
| Securities law risk | MEDIUM | Legal disclaimers + tier-based signal quality filtering |
| Provider acquisition (chicken-and-egg) | MEDIUM | Seed with internal (Qwen-derived) signals first |
| x402 infrastructure maturity | MEDIUM | Phase 3 -- not a GTM dependency |

---

## 5. Verdict

### GO (21/30)

**Rationale:** The market opportunity ($21B TAM, no dominant aggregator, 5 validated pain points) justifies the investment despite execution feasibility concerns. The combination of aggregation + trust infrastructure + agent-native access creates a differentiated position. The codebase gaps are solvable with a disciplined hardening sprint.

**Conditions for proceeding:**
1. Resolve pricing inconsistency to $99 PRO before any checkout goes live
2. Complete D1 subscriber storage migration before paid tier launch
3. Ship OpenAPI spec before developer preview
4. Consolidate overlapping route implementations
5. Legal review of signal distribution compliance

---

## 6. Action Items (Cong Viec Can Lam)

| # | Action | Owner | Deadline |
|---|--------|-------|----------|
| 1 | Migrate in-memory subscriber state to D1/SQLite | Engineering | Before paid tier launch |
| 2 | Consolidate 3 subscribe implementations into 1 | Engineering | Before developer preview |
| 3 | Write OpenAPI 3.1 spec for entire signal surface | Engineering | Before developer preview |
| 4 | Set $99 PRO as pricing source of truth, remove $49 refs | Product | Immediate |
| 5 | Remove/unwire dead feature-gate code | Engineering | During hardening sprint |
| 6 | Build usage metering for signals billing | Engineering | Before paid tier launch |
| 7 | Design self-serve pricing/checkout page | Design | During hardening sprint |
| 8 | Legal review of signals distribution compliance | Legal | Before Phase 1 |
| 9 | Build internal signal pipeline (Qwen -> API) as seed supply | Engineering | Phase 0 |
| 10 | Build MCP server endpoint for AI agent discovery | Engineering | Phase 3 |
