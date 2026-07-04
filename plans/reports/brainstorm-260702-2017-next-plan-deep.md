# Brainstorm Report: Algo-Trader Next Plan — Deep Assessment + Parallel Strategy

**Date:** 2026-07-02 20:17 | **Mode:** `--deep --parallel`
**Status:** assessment complete

---

## Executive Summary

The project is in an **unusual state**: ~95% of code is written and tested (2,798 tests, 0 TS errors, 52+ strategies, full monitoring stack, marketplace, live trading pipeline, billing flows) — but **zero revenue activity is live**. The working tree is dirty with uncommitted docs changes, new files, and plan updates.

**Top-line assessment:** The highest-leverage move is NOT building more features — it's converting code-complete into revenue-live. Three parallel tracks address this: (1) go-live essentials, (2) ops confidence, (3) growth engine — plus two forward-looking tracks.

---

## 1. Current State Audit

### What's LANDED (past 48h)

| Area | Status | Detail |
|------|--------|--------|
| All 6 pending tracks | ✅ COMPLETE | Live exec, integration tests, marketplace E2E, V2 migration, route tests, backtesting |
| Monitoring stack | ✅ COMPLETE | Grafana + Prometheus + Alertmanager + Telegram alerts |
| Growth features | ✅ COMPLETE | Marketplace listings, Telegram commands, blog/newsletter, payment UX, live trading dashboard |
| Security | ✅ COMPLETE | 33 high-severity vulns patched, 22 stale docs deleted |
| Code review fixes | ✅ COMPLETE | 8 failing tests fixed, ~15 latent bugs across 3 domains |

### Critical Metrics

| Metric | Value |
|--------|-------|
| Tests passing | 2,798/2,798 (243 files) |
| TypeScript errors | 0 |
| Lint warnings | 93 |
| Strategies | 52+ (30 V2, plus CEX/DEX/DNA/dark-edge) |
| Paper trading P&L | +$2,251 (66.7% win rate, 50 trades) |
| Uncommitted files | ~20+ modified, ~5 new (docs, journals, scripts, dashboard pages, plans) |
| Stale worktrees on disk | ~100+ (from workflow runs) |

### What's NOT Done (honest assessment)

| Gap | Why Still Open | Effort to Close |
|-----|---------------|-----------------|
| Production deploy | Manual step, depends on user credentials/access | ~1h |
| IPN webhook config | Manual NOWPayments UI setup | ~15min |
| Launch content posting | Social media accounts need manual auth | ~30min |
| Live trading with real capital | Requires user decision + wallet funding | ~30min decision |
| SSL/TLS cert management | Deferred — "needs infra" (but may already work via CF) | ~1h to verify |
| 5000-user load test | Deferred — "needs infra" (Docker stack now exists!) | ~2h (Docker ready) |
| Third-party security audit | External vendor; prep ~2h | ~2h self-prep |
| Systematic backtest ALL strategies | Planned but not run | ~4h automated |
| Stale worktree cleanup | ~100+ worktree dirs on disk | ~10min script |

---

## 2. The Real Bottleneck

The codebase is production-ready. The bottleneck is **operator actions** — steps that require the user to:
1. Deploy to production (single script)
2. Configure NOWPayments IPN (manual UI)
3. Post launch content (manual auth on X/Discord/Telegram)
4. Fund a wallet and run `algo trade start --mode=live`

Everything else is code or docs.

---

## 3. Recommended Tracks (Parallel)

```
Week 1 (immediate):     Track A  ── Revenue Go-Live
                         Track B  ── Ops Confidence
                         Track C  ── Working Tree Hygiene

Week 2:                  Track D  ── Growth Engine
                         Track E  ── External Validation

Week 3-4:                Track F  ── Advanced Features (deferrable)
```

---

### Track A: Revenue Go-Live (P0 — 2-3 days total)

**Goal:** First paying subscriber within 7 days.

| Step | Sub-Track | Effort | Owner |
|------|-----------|--------|-------|
| A1 | Production deploy — CF Worker + Dashboard | ~1h | Operator via `scripts/deploy-production.sh` |
| A2 | NOWPayments IPN production config | ~15min | Operator (manual NOWPayments UI) |
| A3 | Payment E2E test — real crypto checkout → subscription activation | ~1h | Script exists |
| A4 | Launch content posting: X thread, Discord, Telegram, Reddit | ~30min | Drafts ready at `docs/marketing/launch-posts-ready-to-post.md` |
| A5 | Live trading graduated rollout: paper 48h → 0.5% bankroll → 2% | ~1h setup | `algo trade start` with guardrails |
| A6 | Landing page update — active subscriber count, test results, pricing | ~2h | Copy exists |
| A7 | Referral program go-live (code built, needs activation) | ~1h | Config + test |

**Risks:**
- NOWPayments IPN callback may have latency/gateway issues → mitigate with polling fallback
- Live trading may hit unexpected edge cases → paper 48h first, circuit breaker always on
- Launch content may need review → quick pass, don't overthink

**Success criteria:**
- [ ] `curl https://sophia.agencyos.network/api/version` — SHA matches HEAD
- [ ] NOWPayments checkout completes → subscription goes active
- [ ] At least one launch post live on X, Discord, or Telegram
- [ ] `algo trade start --strategy=<best> --mode=paper` running
- [ ] All 2,798 tests still pass

---

### Track B: Ops Confidence (P0 — 2-3 days parallel with A)

**Goal:** Operator can sleep at night knowing monitoring works.

| Step | Sub-Track | Effort | Detail |
|------|-----------|--------|--------|
| B1 | Production monitoring verification | ~1h | Docker stack running, Grafana dashboards populated |
| B2 | Alert testing — trigger daily loss, circuit breaker, IPN failure | ~1h | Simulate each alert, verify Telegram notification arrives |
| B3 | Production runbook audit | ~2h | Read `docs/deployment-guide.md` + `docs/live-trading-runbook.md` against actual infra |
| B4 | SSL/TLS verification | ~1h | CF provides automatic SSL — verify cert status, no mixed content |
| B5 | Load test baseline with Docker stack now available | ~2h | Run k6 against live API (not just local), record p95, memory |
| B6 | Stale worktree cleanup | ~10min | Script to remove 100+ stale worktrees from `.claude/worktrees/` |

**Key insight:** Docker monitoring stack is already in `docker-compose.yml` (from Phase 2). B1 means `docker compose up -d grafana prometheus alertmanager` and confirming data flows. If Grafana port conflicts with app (both :3000), use port mapping.

**Success criteria:**
- [ ] `docker compose ps` — grafana, prometheus, alertmanager all healthy
- [ ] Prometheus target `algo-trade:3000/metrics` UP
- [ ] Grafana at :3001 shows live trading P&L + circuit breaker
- [ ] Simulated 5% daily loss → Telegram DM received within 30s
- [ ] Load test: 1000 VUs, p95 < 100ms
- [ ] 0 stale worktrees remaining

---

### Track C: Working Tree Hygiene (P0 — 0.5 day, do first)

**Goal:** Clean git state before any production deploy.

| Step | Action | Detail |
|------|--------|--------|
| C1 | Review & commit legitimate changes | Plans, docs, dashboard pages, scripts |
| C2 | Re-verify test suite after commit | 2,798 baseline must hold |
| C3 | Delete truly stale backup/`.bak` files | Git-ignored artifacts |
| C4 | Update CLAUDE.md, README.md if needed | Reflect current v1.1.0 state |
| C5 | Commit with conventional messages | Or batch into one "chore: pre-go-live housekeeping" |

**Why this matters:** Dirty working tree = deploy script may include unintended changes. Rollback is harder with half-staged state.

---

### Track D: Growth Engine (P1 — 3-5 days, start Week 2)

**Goal:** Organic subscriber acquisition loop.

| Step | Sub-Track | Effort | Detail |
|------|-----------|--------|--------|
| D1 | Systematic backtest ALL 52+ strategies | ~4h | `algo trade backtest --strategy=all` → CSV report |
| D2 | Performance comparison report | ~2h | Sort by Sharpe, win rate, profit factor across all strategies |
| D3 | Surface top 5 performers as featured listings | ~2h | Update marketplace landing page + preview badges |
| D4 | Referral program activation + dashboard | ~2h | Code complete; wire upsell CTA + share link |
| D5 | Telegram campaign command (`/campaign`) | ~2h | Code exists (from growth plan); test + deploy |
| D6 | Newsletter segmented broadcast (by strategy interest) | ~1h | Code exists; configure first broadcast |
| D7 | Pricing page A/B test | ~2h | Test $149/mo vs $99/mo PRO conversion rates |

**Key metrics:** Daily active users, subscriber conversion rate, referral share rate, newsletter open rate.

---

### Track E: External Validation (P1 — 1-2 days, Week 2-3)

**Goal:** External credibility signals for enterprise customers.

| Step | Sub-Track | Effort |
|------|-----------|--------|
| E1 | SOC2 readiness prep (self-assessment) | ~4h |
| E2 | Public strategy performance dashboard | ~3h |
| E3 | Third-party security audit prep — compile evidence package | ~2h |
| E4 | Customer onboarding documentation | ~2h |
| E5 | Public test results page (2,798 tests, 0 failures) | ~1h |

---

### Track F: Advanced Features (P2 — deferrable to Week 3-4+)

**Goal:** Moats and competitive differentiation.

| Step | Sub-Track | Effort | Why Deferrable |
|------|-----------|--------|----------------|
| F1 | AI-driven strategy selection (recommender from performance data) | ~3h | Nice-to-have, not blocking revenue |
| F2 | Community strategy upload sandbox (full flow) | ~8h | Requires moderation pipeline |
| F3 | Mobile PWA / React Native | ~20h | Large effort, validate demand first |
| F4 | Multi-language (VN/EN) support | ~10h | Bilingual needed for target market |
| F5 | Deeper CEX derivatives (futures/options) | ~15h | New risk model needed |
| F6 | Performance tuning at scale (Redis cluster rebalance) | ~3h | Only needed at 500+ concurrent users |

**Decision rule:** Start F items only when either (a) revenue exceeds $5K MRR or (b) subscriber count exceeds 50.

---

## 4. Dependency Graph

```
C (Hygiene) ──┐
               ├──→ A (Go-Live) ──→ D (Growth) ──→ F (Advanced)
               │        │ 
               ├──→ B (Ops) ─────→ E (Validation)
               
A5 (Live trading) ──→ feedback into D1 (backtest ALL → select best)
B5 (Load test) ────→ baseline for F6 (scale tuning)
```

A (Go-Live) and B (Ops) can run in parallel after C (Hygiene).

---

## 5. File Touch Map

| File | Track | Action |
|------|-------|--------|
| `scripts/deploy-production.sh` | A1 | Verify & run |
| `src/platform/billing/nowpayments-service.ts` | A3 | Verify IPN handler |
| `docker-compose.yml` | B1 | Already configured — verify |
| `grafana/dashboards/live-trading.json` | B2 | Already created — test |
| `config/alertmanager.yml` | B2 | Already configured — test Telegram |
| `docs/marketing/launch-posts-ready-to-post.md` | A4 | Read, post |
| `docs/live-trading-runbook.md` | B3 | Audit against infra |
| `scripts/run-all-backtests.ts` (new) | D1 | Implement & run |
| `docs/strategy-performance-report.md` | D2 | Update after backtest |
| `src/platform/referral/` | D4 | Activation config |
| `docs/security-audit-report.txt` (new) | E3 | Compile evidence |

---

## 6. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| IPN webhook fails in production | Low | Medium (missed payments) | Manual reconciliation path + polling fallback already coded |
| Live trading loses money on first week | Medium | Low (2% bankroll cap) | Circuit breaker, daily loss limit, paper 48h first |
| Deploy breaks dashboard | Low | High | Rollback script exists, SHA verification gate |
| Grafana consumes excess memory on 16GB M1 | Medium | Low | Reduce retention, use SQLite not PG for Grafana |
| NOWPayments API rate limit on IPN errors | Low | Medium | Backoff + retry coded |
| LLM inference (DeepSeek R1) fails | Low | Medium | Falls back to Nemotron, then template |
| Working tree has unintended changes | Medium | Medium | Track C (hygiene) addresses this first |

---

## 7. Decision Points for Operator

These are the non-code questions only you can answer:

1. **Deploy target** — Cloudflare Worker (CF-direct) vs Docker on VPS vs both?
   - Current docs describe CF Workers + Docker; clarify which is primary

2. **Live trading capital** — Starting bankroll (recommended: $500-$1K), wallet setup
   - Proposed: $500, 2% = $10 max per position, 5% = $25 daily loss limit

3. **Launch channels** — X/Twitter, Discord (Polymarket communities), Telegram (existing bot), Reddit
   - Draft content exists for all 4 — which ones first?

4. **Third-party audit** — Any preferred vendor or timeline?
   - Self-assessment first (Track E), external on demand

5. **IPN config** — Do you have NOWPayments dashboard access now?

---

## 8. Concrete Next Action (recommended starting step)

```bash
# Step 0: Stop → Assess → Decide
# 1. Review this report
# 2. Answer the 5 decision points above
# 3. Choose which track to start

# Recommended first command:
cd /Users/macbook/algo-trader

# Track C — clean hygiene first:
git add -A && git commit -m "chore: pre-go-live housekeeping — docs, plans, journal, scripts"
pnpm test   # verify 2,798 still pass
pnpm typecheck  # verify 0 errors

# Then concurrent:
# Track A1: bash scripts/deploy-production.sh
# Track B1: docker compose up -d grafana prometheus alertmanager
```

---

## 9. Questions & Uncertainties

- **Revenue model clarity:** Is the primary channel Polymarket RaaS subscriptions ($149/mo), marketplace strategy subscriptions, or both?
- **User base:** Do you have beta testers waiting, or need to acquire cold traffic?
- **Compliance urgency:** Is SOC2/SOC2-readiness a blocking requirement for your first customer segment, or can you start with individual traders?
- **AI service cost burn:** Dual-model LLM (Nemotron + DeepSeek R1) running 24/7 on M1 Max — what's the power + hardware cost? Should this be cost-tracked?
- **Support capacity:** Who handles customer support for the first 10 subscribers? Is the Telegram auto-support (/faq, /support) enough?
