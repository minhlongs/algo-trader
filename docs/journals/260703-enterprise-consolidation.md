# Enterprise Consolidation + Investor One-Pager

**Date**: 2026-07-03 14:42
**Severity**: Medium
**Component**: Enterprise routes, pricing/tier config, investor docs
**Status**: Resolved

## What Happened

Consolidated four scattered enterprise pages (668 lines) into a single `/enterprise` route with Pricing + Contact tabs. Rewrote the investor one-pager from 108 to 286 lines. Updated the tier scheme from the dead old pricing (growth/scale/unlimited at $49k/$199k/$499k) to match the actual subscription tiers (PRO $99/ENTERPRISE $299/MASTER $999).

## The Brutal Truth

This was overdue. The enterprise pages were scattered across `/pricing-enterprise`, `/enterprise`, `/detailed-pricing`, and a separate contact page -- all with stale pricing that didn't match subscription tiers. A fundraising deck with wrong numbers is worse than no deck. The investor one-pager before this rewrite was too thin to send to anyone serious.

## Technical Details

- **Files deleted**: `(pricing-enterprise)/page.tsx`, `(pricing-enterprise)/contact/page.tsx`, `detailed-pricing/page.tsx` -- three dead route files
- **Files consolidated into**: `(enterprise)/page.tsx` -- single route with tab-based Pricing + Contact layout
- **Backend changes**: 6 files touched in `enterprise-inquiry-store.ts`, `tam-notifier.ts`, `onboarding-service.ts`, `inquiry-routes.ts` and their tests -- all to replace old tier enums
- **Investor one-pager**: `docs/investor-one-pager.md` rewritten from 108 to 286 lines, 11 sections including competitive landscape table, 12-month P&L with 3 scenarios (base/upside/downside), unit economics with LTV/CAC, and a $500K pre-seed ask
- **Archived**: `docs/tam-dashboard-architecture.md` moved to `docs/archive/tam-dashboard-architecture.md`
- **Verification**: TypeScript 0 errors, 2,790 tests passing

## What We Tried

The main difficulty was tracing all the places the old tier scheme was hardcoded. The old enterprise page referenced `growth`/`scale`/`unlimited` strings directly in the component template, but the backend store used different enum values. Had to do a grep sweep across `src/` to find every stale reference.

## Root Cause Analysis

The enterprise pricing was never updated when we migrated to the PRO/ENTERPRISE/MASTER tier scheme months ago. The enterprise pages were treated as "marketing content" not "code," so they fell through the cracks of the usual refactoring passes.

## Lessons Learned

1. Marketing pages with hardcoded pricing are tech debt when they live in the same codebase. They rot silently because no test catches them.
2. An investor one-pager that thin (108 lines) should have been a red flag earlier. We were not ready to fundraise.
3. The archived file ended up at `docs/archive/enterprise/tam-dashboard.md` instead of `docs/archive/tam-dashboard-architecture.md` -- a path mismatch caught during code review. Always verify archive paths match the original location.

## Next Steps

- Send the one-pager to the first 3 warm investor intros this week
- Keep the enterprise tier values in sync with `@/seed/config/tiers` going forward -- the single source of truth was established but needs discipline to maintain
- Archive the old `plans/enterprise-summary.md` since its content is now in the one-pager
