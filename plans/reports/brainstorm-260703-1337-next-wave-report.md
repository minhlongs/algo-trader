---
title: "Next Wave Brainstorm — Enterprise Consolidation + Investor One-Pager"
description: "Scope: dead page cleanup (enterprise consolidation) + fundraising materials (investor one-pager rewrite)"
created: "2026-07-03T13:37:00.000Z"
status: approved
sub-projects:
  - B: enterprise-page-consolidation
  - D: investor-one-pager-rewrite
---

# Next Wave — Enterprise Consolidation + Investor One-Pager

## Background

Previous pipeline completed: pricing unification, CI fix, subscriber pages, i18n, billing persistence, TypeScript cleanup, landing page enhancement. Platform is technically revenue-ready.

## Scout Summary

| Area | Status | Remaining |
|------|--------|-----------|
| A: Go-to-Market | Skipped | Deferred to next session |
| B: Dead page cleanup | Pages exist, no routes | 4 enterprise files (668 lines), old pricing |
| C: Subscriber analytics | ✅ **100% DONE** | Backend routes + services + frontend hooks + pages all built |
| D: Financial model | One-pager exists (108 lines) | Stale metrics, missing billing persistence, resolved blockers |

## Approved Design

### B: Enterprise Page Consolidation

**Approach:** Merge 3→1 with tabs, drop thank-you, archive TAM

| Component | Action |
|-----------|--------|
| `enterprise-pricing-page.tsx` (155L) | → Merge into `/enterprise` as "Pricing" tab |
| `enterprise-contact-page.tsx` (204L) | → Merge into `/enterprise` as "Contact" tab |
| `enterprise-thank-you-page.tsx` (111L) | Delete; redirect to generic `/success` page |
| `enterprise-tam-dashboard-page.tsx` (198L) | Archive; admin-only, defer until needed |
| `lib/enterprise-plans.ts` | Update pricing constants to match current scheme |
| `App.tsx` | Add `/enterprise` route pointing to consolidated `EnterprisePage` |

**Design:**
- Single `/enterprise` public route
- Tab navigation: Pricing → Contact Form → Success (redirect)
- Pricing cards update: $49k→$99 (PRO), $199k→$299 (ENTERPRISE), $499k→$999 (MASTER)
- All existing enterprise plan features/checklists preserved
- Dark theme, gold design tokens, FadeIn animations

### D: Investor One-Pager Full Rewrite

**Current:** 108 lines, 6 sections (Headline → Problem → Solution → Traction → Business Model → Market → Moats → Team → Ask)

**Target:** ~250+ lines, restructured with:

| Section | Enhancements |
|---------|-------------|
| Headline | Sharper: "AI-Calibrated Prediction Market Signals — $99/mo" |
| Problem | Add market size data point ($500M+/mo Polymarket volume) |
| Solution | Add architecture diagram description (3-layer: signals → risk → execution) |
| Traction | Update test count (2,790), add billing persistence milestone, add PostgreSQL migrations |
| Business Model | Add unit economics breakdown (COGS per tier, break-even users, LTV/CAC estimates) |
| Market | Add competitive landscape comparison table (vs. other signal providers) |
| Growth Trajectory | NEW — 12-month projection with user acquisition funnel assumptions |
| Moats | Add billing system (NOWPayments + PostgreSQL persistence) and 3 bounded contexts |
| Team | Solo developer, 423→536 source files, 66 docs, 53 migrations |
| Ask | Refine: "Seeking $XXXk pre-seed for distribution + market-making liquidity" |

**Retained:** English-only, targeting English-speaking investors/partners.

## Implementation Risks

| Risk | Mitigation |
|------|------------|
| Enterprise pricing updating to current scheme may break backend expectations | Verify POST /api/enterprise/inquiries handler accepts new tier values |
| Enterprise contact form POST endpoint may not exist | Check if enterprise-inquiry-store.ts handlers are wired |
| One-pager numbers drift again quickly | Track source-of-truth in docs/ with update checklist |

## Timeline

All work is independent → runs in parallel:
- **B: Enterprise consolidation** — ~30 min (frontend only)
- **D: One-pager rewrite** — ~20 min (markdown only)
