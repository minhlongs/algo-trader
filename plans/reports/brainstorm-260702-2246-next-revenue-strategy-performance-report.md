# Brainstorm: Next Phase — Revenue Activation + Strategy Performance Intelligence

**Date:** 2026-07-02 22:46 | **Mode:** `--deep --parallel`
**Status:** design complete | **Handoff target:** `/ck:plan`

---

## Context

Production deployed: CF Worker at `algo-trader.agencyos-openclaw.workers.dev`, Docker stack (7 containers) running locally. 2,798 tests, 0 TS errors. Project transitions from "infra ready" to "revenue generating."

---

## Sub-Projects

| Phase | Name | Effort | Deps | Track |
|-------|------|--------|------|-------|
| **A** | Comprehensive backtest (all 52+ strategies) | ~4-6h auto | — | 2 |
| **B** | Strategy Performance Dashboard | ~3-4h | A | 2 |
| **C** | Featured marketplace listings | ~1-2h | A | 1 |
| **D** | Referral program go-live | ~1h | — | 1 |
| **E** | Launch content posting | ~30min (user) | A (data) | 1 |
| **F** | Strategy comparison report | ~1-2h | A | 2 |

**A + D can run in parallel immediately. B + C + F depend on A.**

---

## Phase Details

### Phase A: Comprehensive Backtest
- Extend `scripts/run-all-backtests.ts` to cover all 30+ viable strategies
- Output: CSV at `reports/backtest-results.csv` with Sharpe, win rate, PnL, drawdown
- Run: `pnpm exec tsx scripts/run-all-backtests.ts`
- Handle failures gracefully (missing market data → SKIP not FAIL)

### Phase B: Strategy Performance Dashboard
- New dashboard page at `/app/strategy-performance`
- Sortable table: Sharpe, win rate, max drawdown, profit factor, total PnL
- Equity curve viewer per strategy
- Comparison mode (2-5 strategy overlay)
- Tier gating: PRO+ full detail, FREE summary only
- Data endpoint at `GET /api/v1/strategy-performance`
- Files: `strategy-performance-page.tsx` (NEW), `analytics-routes.ts` (MODIFY), `App.tsx` (MODIFY)

### Phase C: Featured Marketplace Listings
- Update `desk-strategy-seeder.ts` with top 5 performers
- Sort by Sharpe descending
- Risk profile tags: conservative/moderate/aggressive

### Phase D: Referral Go-Live
- Code already built: `referral-routes.ts`, `/app/referral` page in sidebar
- Wire referral code generation on signup
- Add share link widget to dashboard

### Phase E: Launch Content
- Drafts at `docs/marketing/launch-posts-ready-to-post.md`
- Fill `[INSERT]` with real strategy names + metrics from Phase A
- Channels: X (7-tweet thread), Polymarket Discord, Reddit r/algotrading

### Phase F: Strategy Comparison Report
- Markdown report at `docs/strategy-performance-report.md`
- Top 10 by Sharpe, top 5 by win rate/total PnL, risk-adjusted rankings
- Public link from dashboard

---

## File Touch Map

| File | Phase | Action |
|------|-------|--------|
| `scripts/run-all-backtests.ts` | A | EXTEND — 10 → 30+ strategies |
| `dashboard/src/pages/strategy-performance-page.tsx` | B | NEW |
| `src/platform/api/routes/analytics-routes.ts` | B | MODIFY — add strategy data endpoint |
| `dashboard/src/App.tsx` | B | MODIFY — add route |
| `dashboard/src/components/sidebar-navigation.tsx` | B | MODIFY — add nav item |
| `src/platform/marketplace/services/desk-strategy-seeder.ts` | C | MODIFY — top 5 featured |
| `src/platform/referral/referral-routes.ts` | D | VERIFY — already built |
| `docs/marketing/launch-posts-ready-to-post.md` | E | FILL placeholders |
| `docs/strategy-performance-report.md` | F | NEW |

---

## Sequence

```
Day 1:  A (backtests, background) + D (referral, independent)
Day 2:  B (dashboard, after A data) + C (listings, after A data)
Day 3:  F (report) + E (launch content, user action)
```

---

## Risks

- Backtest data may show poor performance across most strategies → pivot marketing to "transparent results" not "guaranteed wins"
- Dashboard development may take longer than estimated → ship MVP (table-only, no charts) first
- Referral program may have latent bugs → test E2E before activation

---

## Success Criteria

- [ ] `reports/backtest-results.csv` with 30+ strategies, 0 errors
- [ ] `/app/strategy-performance` loads, table sortable by all columns
- [ ] Marketplace shows 5 featured strategies with performance badges
- [ ] Referral code generates, share link copies, conversion tracks
- [ ] Launch content posted on ≥2 channels with real metrics
- [ ] Strategy performance report published at `docs/strategy-performance-report.md`
- [ ] 2,798 tests still passing
