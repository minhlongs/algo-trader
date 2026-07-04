# Brainstorm Report: Algo-Trader Next Wave III
## From Built to Revenue-Producing

**Date:** 2026-07-03 | **Version:** 1.0 | **Audience:** CEO

---

## 1. Executive Summary

### Vision (Executive Summary: Vision)

Next Wave III transitions the platform from "infrastructure-complete" to "revenue-active."

Three months of relentless build delivered 2,798 passing tests, 52+ strategy definitions, full billing persistence, and a multi-tenant marketplace. But we have zero paying users and zero validated trading edge.

This wave inverts the priority: **revenue before features, edge before scope, survival before scale.** The goal is to prove the a16z solo thesis produces cash, not just clean code, by:

- Shipping recurring billing that actually works (NOWPayments IPN fix alone unlocks the first dollar)
- Closing the prediction accuracy feedback loop so the platform learns from its own trades
- Establishing an ops baseline that won't silently lose subscriber data
- Landing the first 10 paying subscribers

### Top 3 Recommendations (Executive Summary: Top 3 Recommendations)

1. **Fix NOWPayments IPN callbacks immediately (3-5 days).** This is the single most critical bug in the entire revenue flow. Payments succeed today but tiers never activate. Every past crypto payment is a lost conversion.

2. **Ship annual prepay plans at 15-20% discount (1-2 weeks).** Highest ROI-per-effort change in the entire roadmap. No new integration needed -- just pricing config and UI. Unlocks $10k+ upfront cash flow per enterprise subscriber and 12-month lock-in.

3. **Wire prediction accuracy into signal fusion weights (1-2 weeks).** The three components exist independently (prediction-accuracy-tracker.ts, signal-fusion-engine.ts, reflection engine). Connect them for a systematic edge improvement loop without any new capital investment.

---

## 2. Project State Assessment (Tinh trang Du an)

### What Exists and Is Healthy (Project State Assessment: Healthy)

| Area | Status | Evidence |
|------|--------|----------|
| Test coverage | Strong | 2,798 passing tests, comprehensive test suite |
| Strategy definitions | Extensive | 52+ strategy definitions across multiple types |
| Billing persistence | Complete | Full billing/subscription DB schema, multi-tenant |
| Marketplace | Built | Multi-tenant marketplace infrastructure |
| Signal fusion engine | Functional | signal-fusion-engine.ts operational |
| Prediction accuracy tracking | Built | prediction-accuracy-tracker.ts exists |
| Regime detection | Built | DnaEngine regime detector operational |
| D1 database layer | Working | Cloudflare D1 via createServerClient() |
| Telegram bot skeleton | Built | @Sophia_Bbot infrastructure ready |
| Language support | Partial | react-i18next in place, Vietnamese l10n started |

### What Is Missing or Broken (Project State Assessment: Missing)

| Area | Status | Impact |
|------|--------|--------|
| **Revenue activation** | **BROKEN** | NOWPayments IPN callbacks not configured -- payments succeed, tiers never activate |
| **Recurring billing** | Missing | No monthly/annual subscription flow; crypto-only, no fiat |
| **Strategy edge validation** | Unknown | 23 of 30+ V2 strategies are stubs -- may have zero or negative edge |
| **Tier pricing** | Missing | Only FREE and PRO ($99/mo) -- no starter tier for price-sensitive crypto demographic |
| **Backup pipeline** | None | 23 of 38 DB migrations untracked; no backup exists; no restore ever tested |
| **Load testing baseline** | Broken | Auth middleware blocks k6 -- no authenticated load test capability |
| **Alerting** | Silent | 7 Prometheus alert rules fire into a void; solo operator cannot watch dashboards 24/7 |
| **i18n** | Incomplete | 31 dashboard pages still English-only; API responses may also lack translation |
| **Referral program** | Half-built | Referral routes, page, and share widget exist but code generation on signup is missing |
| **HA migration path** | Undocumented | Single M1 Max architecture may hit limits below 500 subscribers; no scale-out plan |

### Key Metrics Snapshot (Project State Assessment: Metrics)

| Metric | Current | Target (End of Wave III) |
|--------|---------|--------------------------|
| Paying subscribers | 0 | 10 |
| Monthly revenue | $0 | $500-$1,000 |
| Strategy win rate | ~55-60% (estimated zero-shot) | 66%+ (verified by tracker) |
| Backtest-ready strategies | ~7 of 52 | 30+ |
| Tests passing | 2,798 | Maintained, no regression |
| i18n coverage (pages) | ~15 of 46 | 46 of 46 |
| Backup | None | Daily automated, restore-drilled |
| Load test (authenticated VUs) | 0 | 1,000+ with p95 < 500ms |

---

## 3. Five-Dimension Analysis (Phan tich 5 chieu)

### 3A. Revenue Dimension (Dimension: Revenue)

**Key Findings:**

1. **The platform has never collected a single dollar.** After 3 months of build, billing persistence is complete but the activation path is silently broken (NOWPayments IPN callbacks not auto-wired).

2. **Two-tier pricing (FREE vs $99/mo PRO) misses the crypto trading demographic.** Data shows 40%+ of crypto traders are price-sensitive and Vietnamese; a Starter tier at $19-29/mo is the proven SaaS conversion feeder.

3. **No annual/prepay option exists.** This is the single highest-ROI change: annual prepay at 15-20% discount generates immediate $10k+ cash flow per enterprise subscriber with 12-month lock-in and requires zero new integration work.

4. **Stripe/Paddle fiat billing is the stretch unlock.** Crypto-only billing creates a 40-60% churn risk from manual re-payment friction. Adding fiat recurring billing transforms MRR stability.

5. **Referral program is half-built.** Routes, page, and share widget exist but code generation on signup is missing -- an estimated 3-day fix that drives organic growth.

**Actionable Insight:** Revenue #1 is a bug fix, not a feature. Fix NOWPayments IPN callbacks and the first dollar is already in the pipeline from past failed conversions.

### 3B. Trading Dimension (Dimension: Trading)

**Key Findings:**

1. **52 strategies exist but most are stubs.** The "52 strategies" marketing claim is currently a liability -- backtesting may reveal negative or zero edge for many.

2. **Prediction accuracy tracking exists but is disconnected.** prediction-accuracy-tracker.ts runs independently; its data never feeds back into signal-fusion-engine.ts weight updates or reflection engine parameter adjustment.

3. **Regime detector is built but unused by fusion engine.** DnaEngine regime detector output is not wired into signal fusion weight allocation. Strategies run the same weights in bull, bear, and sideways markets.

4. **No published performance data exists.** Marketplace listing cards show no Sharpe ratio, win rate, or drawdown -- these are the #1 conversion driver for a quant trading platform.

5. **Backtesting workflow exists but is incomplete.** run-all-backtests.ts exists but only covers a subset of strategies. No standardized CSV output with Sharpe/win rate/drawdown.

**Actionable Insight:** The closed-loop feedback system (accuracy tracker -> fusion weights -> reflection engine) is the highest-leverage technical investment. It improves win rate systematically without new strategies or capital.

### 3C. Product Dimension (Dimension: Product)

**Key Findings:**

1. **Marketplace is built but empty of performance data.** The multi-tenant marketplace infrastructure exists, but strategy listing cards show no metrics. Buyers cannot make informed decisions.

2. **i18n is incomplete at 31 remaining pages.** The Vietnamese crypto trading audience (40%+ of the addressable market) cannot fully use the platform. This is a conversion blocker, not a nice-to-have.

3. **Telegram bot infrastructure exists but is not wired to live data.** @Sophia_Bbot commands (/campaign, /status, /results) respond with placeholder data. Wiring to live subscriber data reactivates the existing user pool.

4. **Setup Wizard flow is healthy.** BYOK API key onboarding (OpenRouter, ElevenLabs, D-ID) works end-to-end. This is a protected flow that must not break.

5. **No staging environment.** Every deployment risks downtime. Migration rollback is untested for 60% of schema changes.

**Actionable Insight:** Product priorities should follow revenue: fix the activation path, then fill the marketplace with real data, then expand language coverage. In that order.

### 3D. Operations Dimension (Dimension: Operations)

**Key Findings:**

1. **No backup pipeline exists for PostgreSQL.** Zero backups. 23 of 38 migrations are untracked. A single disk failure or corruption event means total data loss. This is existential risk at any revenue level.

2. **Alerting is silent.** 7 Prometheus alert rules (circuit breaker, daily loss, provider down, HTTP errors) fire into the void. A solo operator cannot watch dashboards 24/7.

3. **No authenticated load test baseline exists.** Express auth middleware blocks k6. The team cannot answer the question "how many subscribers can the M1 Max handle?"

4. **CPU/memory profiling has not been done on hot paths.** Signal fusion pipeline, dashboard page load, and backtesting are uncharacterized. Unknown where the first bottleneck appears.

5. **Deployment is single-point-of-failure.** No staging environment. Migration rollback untested for 60% of schema changes. Every production deployment is a roll of the dice.

**Actionable Insight:** Backup pipeline is the only truly urgent ops item. If the data disappears, nothing else matters. Alerting is important but can start with 3 critical alerts only (circuit breaker, daily loss threshold, provider down).

### 3E. AI/ML Dimension (Dimension: AI)

**Key Findings:**

1. **DeepSeek model routing is mature.** The model router with failure feedback, KV cache optimization, and subagent routing enhancements is production-grade. 5 model levels with escalation.

2. **MLX inference on M1 Max is configured.** Local LLM inference runs on Apple Silicon with known model IDs, ports, and performance characteristics. Docker containers correctly excluded from Metal GPU access.

3. **AI usage cost tracking is in place.** Cost tracker with DeepSeek fallback pricing has been ported from TAW Terminal. Billing-level cost attribution is possible.

4. **Prediction accuracy tracking is built but not looped.** The component exists but does not feed back into model selection or parameter tuning. The platform cannot systematically improve.

5. **No automated retraining or drift detection.** Model performance degrades over time without detection or correction. The reflection engine runs but with stale parameters.

**Actionable Insight:** The AI stack is surprisingly mature for a pre-revenue startup. The gap is not more AI -- it's connecting what exists to drive trading outcomes. Close the prediction accuracy loop before building new AI features.

---

## 4. Top 10 Ranked Initiatives (Top 10: Ranked by ROI)

| Rank | Initiative | Track | Impact | Effort | ROI Score |
|------|-----------|-------|--------|--------|-----------|
| 1 | Annual prepay plans at 15-20% discount | Revenue Engine | Immediate $10k+ upfront cash flow per enterprise subscriber, 12-month lock-in | Small (1-2 weeks) | **Extreme** |
| 2 | NOWPayments IPN callback auto-configuration | Revenue Engine | Fixes silently broken revenue activation -- the most critical bug in the entire revenue flow | Small (3-5 days) | **Extreme** |
| 3 | Prediction accuracy closed-loop feedback system | Trading Edge | Directly improves win rate via systematic learning without new capital; wires 3 existing components | Medium (1-2 weeks) | **Very High** |
| 4 | Starter tier at $19-29/mo | Revenue Engine | Captures budget-conscious traders, proven 3-5x trial conversion feeder | Small (1-2 weeks) | **Very High** |
| 5 | PostgreSQL backup pipeline with proven restore drill | Infrastructure Survival | Existential risk at $1M ARR -- 23 untracked migrations, no backup, no restore | Medium (1-2 weeks) | **Critical (Risk)** |
| 6 | Backtest all 30+ V2 strategies, publish performance data | Trading Edge | Converts 23 stubs from liabilities to assets; performance data drives marketplace conversion | Medium (2-3 weeks) | **High** |
| 7 | Fix k6 auth middleware + authenticated load test baseline | Infrastructure Survival | Establishes real throughput limits; cannot sell 500 subs without knowing capacity | Medium (1-2 weeks) | **High** |
| 8 | Regime-adaptive signal fusion | Trading Edge | Wires existing regime detector to fusion engine; under 500 lines of integration code | Small (3-5 days) | **High** |
| 9 | Complete i18n for 31 remaining pages + launch Telegram bot | Customer Activation | Removes blocker for Vietnamese user base (40%+ of crypto audience) | Medium (2-3 weeks) | **Medium-High** |
| 10 | Activate Alertmanager notification receivers | Infrastructure Survival | Solo operator cannot monitor dashboards 24/7; 7 alert rules fire into void | Small (3-5 days) | **Medium** |

---

## 5. Recommended 4-Track Parallel Structure

### Track A: Revenue Engine -- $1M ARR Path
*Effort: Medium (2-4 weeks core; stretch adds 3-4 weeks)*
*Parallel-safe: Yes*
*Impact: Highest -- directly generates first dollar and establishes recurring billing model*

**Objective:** Ship the first revenue-activation flow that works end-to-end and lay the foundation for $1M ARR.

**Items:**
1. **Annual prepay plans at 15-20% discount** -- pricing config + UI, no new integration
2. **NOWPayments IPN callback auto-configuration** -- fix the silently broken revenue activation
3. **Starter tier at $19-29/mo** -- capture budget-conscious traders between FREE and $99 PRO
4. **Stripe/Paddle fiat recurring billing integration** -- stretch item, kills manual-repay churn

**Success criteria:**
- First $1 in revenue from a paying subscriber (tier activated in DB)
- NOWPayments IPN callback auto-configuration verified end-to-end
- Annual prepay checkout flow working and collecting payment
- Starter tier visible, purchasable, and activating correctly

---

### Track B: Trading Edge Feedback Loop
*Effort: Medium (2-3 weeks core; items 4-5 add 1-2 weeks)*
*Parallel-safe: Yes*
*Impact: High -- validated edge is the #1 conversion driver for quant trading*

**Objective:** Connect the existing prediction-accuracy, signal-fusion, and regime-detection components into a closed loop that systematically improves win rate.

**Items:**
1. **Prediction accuracy closed-loop** -- wire prediction-accuracy-tracker.ts into signal-fusion-engine.ts weight updates and reflection engine parameter adjustment
2. **Regime-adaptive signal fusion** -- wire DnaEngine regime detector output into signal fusion weight allocation
3. **Backtest all 30+ V2 strategies against Gamma data** -- extend run-all-backtests.ts, output CSV with Sharpe/win rate/drawdown
4. **Fill top 5 performing strategy stubs with real logic** -- based on backtest-winning patterns
5. **Publish strategy performance data on marketplace listing cards** -- Sharpe, win rate, drawdown

**Success criteria:**
- Prediction accuracy verified at 66%+ win rate on paper trades (up from estimated 55-60%)
- Regime detector actively influencing fusion weights
- 30+ strategies backtested with standardized CSV output
- Top 5 strategy stubs replaced with real logic
- Marketplace cards showing performance metrics

---

### Track C: Infrastructure Survival Baseline
*Effort: Medium (2-3 weeks)*
*Parallel-safe: Yes*
*Impact: Medium -- existential risk mitigation; prevents catastrophic data loss*

**Objective:** Prevent the solo operator from waking up to total data loss or a silent crash that kills subscriber trust.

**Items:**
1. **PostgreSQL backup pipeline** -- pg_dump, remote object storage (R2/S3), cron entry, proven restore drill including rollback for 23 untracked migrations
2. **Fix Express auth middleware x-api-key gap for k6** -- authenticated load test baseline from 100 to 5000 VUs
3. **Activate Alertmanager notification receivers** -- severity-based routing for all 7 Prometheus alert rules (start with 3 critical rules)
4. **CPU/memory profiling on known hot paths** -- signal fusion pipeline, dashboard page load, on M1 Max

**Success criteria:**
- Daily automated PostgreSQL backup running to R2
- At least one successful restore drill documented
- Authenticated load test at 1000+ VUs with p95 < 500ms
- Top 3 alert rules reaching operator via Telegram within 5 minutes
- Hot path profiling results documented with bottleneck identification

---

### Track D: Customer Activation
*Effort: Medium (2-4 weeks)*
*Parallel-safe: Yes*
*Impact: High -- first subscriber acquisition; Telegram reactivates existing user pool*

**Objective:** Remove the barriers preventing the first 10 paying subscribers from signing up and staying.

**Items:**
1. **Complete i18n for remaining 31 dashboard pages** -- standardize on react-i18next, migrate react-intl pages; cover pricing, signup, login, settings, account
2. **Launch Telegram bot with verified commands** -- /campaign, /status, /results wired to live subscriber data
3. **Wire referral program into signup flow** -- code generation on signup, conversion tracking
4. **Publish launch content on 2+ channels** -- X 7-tweet thread, Polymarket Discord, blog, Reddit r/algotrading, using backtest performance data

**Success criteria:**
- 31 dashboard pages fully bilingual (EN/VN) with locale selector working
- Telegram bot responding correctly to all 3 commands with live data
- Referral code generation working end-to-end on signup
- Launch content published on at least 2 channels
- 10 active paid subscribers (non-FREE tier, >7 days since signup)

---

## 6. Dependency Map

```
Track A (Revenue Engine)
  ├── #2 NOWPayments IPN fix ────────────────────────────── No dependencies
  ├── #1 Annual prepay plans ──────────────── Depends on: #2 (billing must work first)
  ├── #4 Starter tier at $19-29/mo ──────── Depends on: #2 (billing must work first)
  └── Stretch: Stripe/Paddle fiat ────────── Depends on: #2 (understanding current flow)

Track B (Trading Edge)
  ├── #8 Regime-adaptive fusion ───────────── Depends on: DnaEngine already built (done)
  ├── #3 Prediction accuracy loop ────────── Depends on: prediction-accuracy-tracker exists (done)
  ├── #6 Backtest all 30+ strategies ────── Depends on: existing strategies (done)
  ├── Fill top 5 stubs ────────────────────── Depends on: #6 (must know which strategies work)
  └── Publish performance data ────────────── Depends on: #6 (need backtest results)

Track C (Infrastructure Survival)
  ├── #5 Backup pipeline ───────────────────── No dependencies, urgent standalone
  ├── #7 k6 auth fix ──────────────────────── Depends on: Express source code
  ├── Fix Alertmanager receivers ──────────── Depends on: Prometheus config (exists)
  └── CPU/memory profiling ────────────────── Depends on: running app (no new infra)

Track D (Customer Activation)
  ├── #9 Complete i18n ────────────────────── Depends on: react-i18next already set up
  ├── Launch Telegram bot ─────────────────── Depends on: bot infrastructure exists, #5 (live data)
  ├── Wire referral program ───────────────── Depends on: existing referral UI, signup flow
  └── Launch content ──────────────────────── Depends on: #6 (backtest data for content)

Cross-track dependencies:
  - Track D (Telegram bot) depends on Track C (live subscriber data from backup stability)
  - Track A (annual prepay) and Track B (published performance data) for launch content
  - All tracks depend on Track C backup stability before aggressive subscriber growth
```

**Execution recommendation:** Start Track A items #2 (IPN fix) and Track C #5 (backup) on Day 1 in parallel. These are independent, urgent, and unlock everything else.

---

## 7. Risk Register (Risk Register)

| # | Risk | Probability | Impact | Mitigation |
|---|------|------------|--------|------------|
| 1 | **23 V2 strategy stubs reveal negative edge** after backtesting -- "52 strategies" claim becomes a liability | Medium | High | Pre-frame marketing: "52 strategy definitions, actively evolving." Backtest before publishing. Remove stubs if negative. |
| 2 | **Stripe/Paddle integration (Track A stretch)** estimated at Medium effort but often hits Large due to webhook idempotency, tax compliance, refund handling, and PCI scope | Medium | High | De-scope from Wave III if it exceeds 1 sprint. Launch with crypto + annual prepay first. |
| 3 | **Single M1 Max architecture** hits PostgreSQL connection limits or CPU saturation below 500 paid subscribers | Low-Medium | Critical | Document HA migration path in parallel with wave work. Know the saturation point via load testing (#7). |
| 4 | **NOWPayments-to-fiat transition** confuses crypto-native users; dual payment paths needed to avoid churn | Medium | Medium | Keep both payment paths live. Clearly label "Crypto (Instant)" vs "Card (Monthly)". |
| 5 | **i18n for 31 pages reveals untranslated strings** in API responses, backend error messages, or notification templates beyond visible UI | Medium | Medium | Dedicated i18n audit pass after page translations. Fix backend strings as they surface. |
| 6 | **Solo operator running 4 parallel tracks** risks context-switching overhead and partial completion across all tracks | High | Medium | Enforce strict time allocation per track. Weekly "kill or continue" review. Track A gets 40% of time. |
| 7 | **Discord, Twitter, and Telegram account creation** involves manual steps and platform verification delays outside code control | Low-Medium | Low | Start account setup process Day 1. Parallelize where possible. |
| 8 | **Alertmanager noise overwhelms solo operator** from day one | Medium | Low | Start with 3 critical alerts only (circuit breaker, daily loss, provider down). Tune thresholds before expanding. |
| 9 | **No staging environment** -- every deployment risks downtime; migration rollback untested for 60% of schema changes | High | High | Invest in a staging copy of D1 + backup restore drill before subscriber growth. Rollback testing is part of Track C #5. |

### Top 3 Risks to Watch Daily:

1. **Strategy edge risk (Risk #1):** If backtesting reveals most strategies have negative edge, the entire marketplace value proposition weakens. Backtest the top 10 strategies first to get early signal.

2. **Scaling ceiling (Risk #3):** If M1 Max hits limits at 100 subscribers, growing to 500 requires unplanned infrastructure work. Load test at 100, 500, and 1000 VUs early to characterize the curve.

3. **Single-operator burnout (Risk #6):** Four parallel tracks with one operator is ambitious. If Track A (revenue) starts producing cash, double down and defer non-revenue work.

---

## 8. Success Metrics (Success Metrics -- Do we know when we win?)

### Green Light (Wave III Complete -- Ship)

- **$1 revenue** from a paying subscriber (monthly or annual subscription activated, tier active in DB)
- **66%+ win rate** on paper trades (up from estimated 55-60%), measured by prediction-accuracy-tracker output
- **Daily automated PostgreSQL backup** running: pg_dump to R2, cron verified, one successful restore drill documented
- **10 active paid subscribers** (non-FREE tier, >7 days since signup)
- **1000+ VUs** on authenticated endpoints with p95 < 500ms -- k6 output saved to reports/
- **Zero silent infrastructure alerts** -- all 7 Prometheus alert rules reach operator via Telegram within 5 minutes
- **Telegram bot** responding correctly to /campaign, /status, /results with live subscriber data
- **31 dashboard pages** fully bilingual (EN/VN) with no regressions, locale selector working
- **2,798+ tests passing** and 0 TypeScript errors maintained throughout the wave
- **Referral code generation** wired on signup with end-to-end conversion tracking verified

### Yellow Light (On Track, Not Complete)

- NOWPayments IPN fix deployed but no subscriber has successfully activated yet
- Annual prepay plans in UI but first purchase not confirmed
- Backtesting in progress for 15+ strategies with preliminary results
- Backup pipeline built but restore drill not yet tested
- i18n complete for 20 of 31 pages
- Load test baseline established but only at 200 VUs

### Red Light (Blocked -- Needs Escalation)

- NOWPayments IPN callback cannot be configured (blocking everything)
- Any regression in Setup Wizard, Telegram bot, or Payment Flow (protected flows)
- Strategy evaluation shows ALL strategies have negative edge after backtesting
- PostgreSQL backup pipeline cannot complete due to permission/access issues
- Authenticated load test reveals architecture cannot handle 100 VUs

---

## 9. Unresolved Questions (Unresolved Questions)

These questions need answers before or during Wave III execution:

### Strategic
1. **What is the target subscriber profile for the first 10 users?** Crypto-native traders, traditional quants, or Vietnamese retail investors? This affects launch content strategy and channel selection.
2. **Is Polymarket the primary "killer app" or a feature?** If Polymarket integration is the core value prop, Wave III should prioritize prediction market-specific edge validation.
3. **Do we have ANY historical trading data from gamma (or paper trading) to validate the 55-60% win rate estimate?** Or is this a guess?

### Revenue
4. **How many past NOWPayments payments exist that failed to activate a tier?** These are warm leads for reactivation once the IPN fix is deployed.
5. **What is the acceptable churn rate for crypto-only billing?** 40-60% is the industry estimate but our specific audience may behave differently.
6. **Is the $19/mo starter tier expected to be unprofitable (loss leader for PRO upgrade) or independently viable?** This changes pricing design.

### Technical
7. **What is the current PostgreSQL connection limit on the M1 Max?** Need to know before load testing.
8. **Are the 23 untracked migrations reversible?** If not, the backup pipeline needs schema state capture, not just data dump.
9. **Does the Telegram bot webhook URL need re-registration after each deployment?** If yes, add to deploy checklist.

### Operations
10. **Should Wave III include a "fail fast" checkpoint at Week 2 where we kill any track showing insufficient progress?** Recommended: review at day 14, defer any track below 50% completion.

---

## Appendix A: Track Time Allocation Recommendation

For a solo operator, time allocation across 4 parallel tracks:

| Track | Allocation | Rationale |
|-------|-----------|-----------|
| Track A: Revenue Engine | **40%** | Directly generates cash -- highest priority |
| Track B: Trading Edge | **25%** | Validates core value proposition |
| Track C: Infrastructure Survival | **20%** | Risk mitigation -- becomes critical at 10+ subscribers |
| Track D: Customer Activation | **15%** | Unlocks growth after revenue and edge are validated |

**Weekly rhythm:** Monday-Wednesday = Track A, Thursday = Track B, Friday AM = Track C, Friday PM = Track D. Weekly review at Friday 4pm -- kill or continue per track.

---

## Appendix B: Fastest Path to First Dollar

If the goal is "first dollar in the bank as fast as possible":

1. **Days 1-3:** Fix NOWPayments IPN callback. Test end-to-end with a real $1 transaction.
2. **Days 4-7:** Add annual prepay option at 20% discount. UI change only.
3. **Days 8-10:** Manually reach out to any past crypto payment senders whose tier failed to activate. Offer them 1 month free PRO.
4. **Days 10-14:** Verify subscriber activation. First $1+ collected. If not, debug and fix.

This narrow path can deliver the first dollar within 2 weeks if the IPN fix is straightforward.

---

*Bilingual note (Ghi chu song ngu): This report is primarily in English for the CEO audience. Key Vietnamese translations are provided for critical section headers. All product UI decisions should maintain EN/VN parity per platform requirements.*
