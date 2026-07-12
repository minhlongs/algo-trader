# Gap Analysis Report — $1M MRR Gate for algo-trader

## Context
- **Goal:** algo-trader: build and launch first paid customer acquisition
- **Gate:** first-1m-mrr
- **Current MRR:** $0
- **Pipeline:** `/goal` → research → gap analysis → (this report) → plan

## 1. Capability Audit

### Revenue Infrastructure — Operational ✅
- NOWPayments IPN (USDT TRC20), HMAC-SHA512, 5/5 E2E tests green
- 5-tier billing (FREE/STARTER/PRO $99/ENTERPRISE $299/MASTER)
- Dunning + invoicing + SendGrid welcome drip (Day 0/1/3)
- Revenue analytics (MRR/churn/LTV)
- Telegram @Sophia_Bbot (/campaign /status /results /link /pricing)

### Marketplace Layer — 80% Built ⚠️
- 7 DB tables, 16 repos, ~780L service code
- Browse/publish/subscribe/admin REST routes
- 80/20 provider split model exists
- **Missing:** payout execution, rating/aggregation, checkout UI

### Signal Product — 60% Built ⚠️
- Signal ingest (Qwen/DeepSeek HMAC), SSE broadcaster, tier-gated REST
- MCP stdio server (350L, @modelcontextprotocol/sdk)
- **Missing:** consensus engine stubbed, track record stubs, webhook persistence

## 2. Hard Gaps (Blocking First Dollar)

| # | Gap | Impact | Effort |
|---|-----|--------|--------|
| 1 | NOWPayments webhook NOT mounted in server.ts | Fatal — every payment 404 | ~30min |
| 2 | Billing services write to data/*.json (not D1) | Breaks on CF Workers | ~4h |
| 3 | api.cashclaw.cc DNS not public | No customer can reach API | ~1h |
| 4 | Telegram bot commands untested in prod | Subscription flow breaks after payment | ~2h |
| 5 | No funded exchange wallets | Signals unproven, reputational risk | ~1 week |
| 6 | Zero traffic acquisition | 0 visitors → $0 MRR forever | Ongoing |
| 7 | Marketplace payout not built | Providers never get paid | ~3 days |
| 8 | No customer self-service UI | No pricing/subscription management | ~1 week |

## 3. Revenue Paths Ranked

| Path | Time-to-$1 | Effort | ARPU | Verdict |
|------|-----------|--------|------|---------|
| A: Signal API SaaS | 1-2 weeks | Low | $99-299/mo | ⭐ Start |
| B: Strategy Marketplace | 6-12 weeks | Medium | $99-299/mo | Compounding |
| C: Managed Trading | 8-16 weeks | High | $500-5K/mo | Needs proof |

## 4. First Step

**Priority 1:** Mount NOWPayments webhook + DNS + Telegram E2E test (~few hours)
**Priority 2:** $500 paid acquisition test (FB/LinkedIn → cashclaw.cc)
**Priority 3:** Deploy $5K live trading capital (weeks 3-6)
**Priority 4:** Marketplace payout flow (weeks 6-12)

## Blockers → $1K → $1M MRR

| Gate | Status | Unblocking |
|------|--------|------------|
| Webhook mounted | BROKEN → fix → $1K MRR |
| DNS + bot E2E | BROKEN → fix → $1K MRR |
| Live trading capital | MISSING → signal credibility |
| 10 paying customers | 0 → pricing validation |
| 100 paying customers | 0 → unit economics |
| 1,000 paying customers | 0 → ~$99K MRR |
| Marketplace payouts | NOT BUILT → network effect |
| 5,000+ subscribers | 0 → ~$495K MRR |
| Enterprise pipeline | 0 → top-up to $1M |

## Unresolved Questions
- Is JSON persistence intentional for dev testing or accidentally shipped to prod?
- Will checkout UI be separate project or integrated into existing dashboard?
- Is there a customer-facing frontend? (no Next.js/Vite found in repo)
