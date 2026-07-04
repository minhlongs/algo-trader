# Brainstorm Report: Next Steps After All 6 Tracks

**Date:** 2026-07-02 14:11 | **Mode:** --deep --parallel
**Status:** design complete | **Handoff target:** /ck:plan

## Problem Statement

The algo-trader project has shipped all 6 pending tracks (live execution, integration tests, marketplace E2E, stocking, V2 migration, route tests). 2,798 tests pass, 0 TS errors. However, **zero revenue activity is live** — the marketing launch hasn't posted, live trading isn't running with real capital, IPN webhook isn't configured in production, and latest code isn't deployed. The project needs to transition from "code complete" to "revenue generating."

## Requirements (from user: "Go Live — Week 1")

| # | Requirement | Concrete Artifact |
|---|-------------|-------------------|
| 1 | Launch content posted | Twitter thread, Polymarket Discord post, Telegram broadcast |
| 2 | Latest code deployed | CF Worker + Dashboard at production URLs |
| 3 | IPN webhook configured | NOWPayments IPN pointing at production, E2E payment test passes |
| 4 | Live trading started | `algo trade start --strategy=<best> --mode=live` with minimal capital |

## Scope Boundaries

- **In scope Week 1:** Launch content, production deploy, IPN config, live trading setup
- **Out of scope Week 1:** Grafana dashboards (Week 2), alerting (Week 2), more marketplace listings (Week 3), Telegram commands (Week 3), referral go-live (Week 3), blog/newsletter (Week 3+)

## Non-Negotiable Constraints

- All risk gates enforced: 2% max bankroll, 5% daily loss, 10 concurrent, circuit breaker
- Default mode stays PAPER — live requires explicit `--mode=live` flag
- No hardcoded secrets — all env vars
- All existing tests must pass (2,798 baseline)

## Codebase Touchpoints

- `scripts/deploy-production.sh` — full deploy script with quality gates
- `src/platform/workers/edge-proxy.ts` — CF Worker source
- `src/platform/billing/nowpayments-service.ts` — IPN verification
- `src/desk/polymarket/live-trading-orchestrator.ts` — live trading entry point
- `src/desk/cli/cashclaw-trade-commands.ts` — CLI trade commands
- `docs/live-trading-runbook.md` — operational docs
- `docs/marketing/launch-posts-ready-to-post.md` — drafted content

## Evaluated Approaches

### A1: Launch Content
**Option A: Post as-is** (~30 min) — Use drafted posts verbatim  
**Option B: Review then post** (~1h) — Quick edit pass then publish  
**Option C: Schedule over 48h** (~2h) — Follow the drafted schedule  
**Recommendation: B** — Quick review catches typos, then post immediately. Don't overthink.

### A2: Production Deploy
**Option A: Full deploy** — `bash scripts/deploy-production.sh` (runs all gates)  
**Option B: Worker-only** — `--worker-only` flag (faster, skip Docker)  
**Option C: Dashboard via CF Pages** — Separate from API  
**Recommendation: A** — Full deploy ensures everything works together. ~5min.

### A3: Live Trading
**Option A: Manual graduated rollout** — Start paper → 3d → 0.5% → 1wk → 2% bankroll  
**Option B: Automated PM2** — Schedule via ecosystem.config.cjs with auto-restart  
**Option C: Immediate live** — Full 2% bankroll day 1  
**Recommendation: A** — Safest, builds confidence, risk gates protect downside.

### A4: IPN Config
**Option A: Manual NOWPayments dashboard** — Login to NOWPayments, set IPN URL  
**Option B: API-based** — Use NOWPayments API to set webhook programmatically  
**Recommendation: A** — NOWPayments config is manual UI-only. ~15min.

## Final Recommended Sequence

```
Day 1:  Deploy production (A2) → Post launch content (A1) → Configure IPN (A4)
Day 1+: Start paper trading with 5 best strategies → Monitor 48h
Day 3:  Switch 2-3 best strategies to live with 0.5% bankroll
Day 10: Review performance → Scale to 2% bankroll on winners
```

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Live trading loses money | Medium | Quarter-Kelly, 5% daily loss limit, circuit breaker |
| IPN webhook misses payment | Low | HMAC verification + manual reconciliation path |
| Deploy breaks something | Low | Quality gates run before deploy, rollback plan exists |
| Launch content gets low engagement | Medium | Track clicks, iterate messaging |

## Success Criteria for Week 1

- [ ] Production deploy: SHA verified, HTTP 200
- [ ] Launch content: posted on Twitter (X) + Discord + Telegram
- [ ] IPN: NOWPAYMENTS_IPN_SECRET set, E2E payment test passes
- [ ] Live trading: `algo trade start --mode=live` running on minimal capital
- [ ] 0 regressions: all 2,798 tests still pass
- [ ] Risk gates: verified functional (guard rejects oversized positions, daily loss stops trading)

## Next

Hand off to `/ck:plan` for detailed implementation phases.
