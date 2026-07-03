# Ultracode Next Wave -- GTM + i18n + Billing Phase 2 + Infra Hardening

**Date**: 2026-07-03 15:22
**Severity**: Medium
**Component**: 4 parallel tracks (GTM, i18n, Billing, Infra)
**Status**: Resolved

## What Happened

Shipped the "Ultracode Next Wave" -- 4 independent parallel tracks completed in a single session. Discord community section on the landing page plus all marketing collateral ready to publish. Full i18n for pricing and signup pages (51 translation keys, react-intl completely evicted from the codebase). Billing Phase 2 migrated the remaining 6 in-memory Map services to PostgreSQL (migrations 046-051). k6 auth headers fixed and load test baseline documented.

Commit `ed8710e23`. Final tally: 2,790 tests passing, TypeScript 0 errors, 79 files changed (+3,013/-1,369).

## The Brutal Truth

This was the paid-off technical debt from the original billing monolith. We had 6 in-memory Map services that silently lost state on every restart -- coupons, trial drips, enterprise inquiries, API keys, onboarding signups, and usage metering thresholds. Every one of them was a ticking data loss bomb. The ONLY reason we hadn't been bitten is that this code hasn't hit real production load yet. The API key manager (migration 049) was the worst -- scrypt-derived keys stored in a Map that vanishes on process restart. That meant every restart invalidated every subscriber API key. Absolutely unacceptable for a $1M ARR target.

The GTM work feels premature but the product direction says otherwise. Marketing content is all queued -- Discord server live, Twitter/X account created, blog post written. The landing page now has a proper Discord community section. This is the right call: if we wait until everything is perfect, we ship never.

i18n was overdue consolidation. We had two i18n libraries fighting each other (react-intl + a custom hook). Removing react-intl entirely and standardizing on the custom `useTranslation()` pattern across all 6 bilingual pages cuts bundle size and removes a dependency we were barely using.

## Technical Details

- **GTM**: 1 files expanded (landing-page.tsx, +149/-44 lines), 5+ docs updated (discord-announce, launch-posts, blog, social-accounts)
- **i18n**: 51 keys added to both `locales/en.ts` and `locales/vi.ts`; react-intl removed from all imports; 6 pages fully bilingual (pricing, signup, dashboard, marketplace, landing, settings)
- **Billing Phase 2**: 6 new migration files (046-051), 6 services refactored from in-memory Maps to PostgreSQL, 6 caller files updated, all 6 test suites rewritten to mock `postgres-client.query()` instead of accessing internal Maps
- **Infra**: k6 load test scripts (`raas-gateway-load-test.js` and `.ci.js`) now pass Bearer token headers correctly; baseline documented in `docs/load-test-baseline.md`
- **Verification**: `tsc --noEmit` passes, all 2,790 tests pass, code review: DONE_WITH_CONCERNS (2 low-severity findings only)

## What We Tried

The billing services were refactored using an established pattern from migrations 043-045. Each service followed the same template: create migration, register in `migration-runner.ts`, remove `Map<K, V>`, add `rowToType` mapper, replace in-memory operations with SQL queries, update tests to mock `query()` instead of asserting on `Map.size`.

The hardest service was `api-key-manager.ts` (migration 049). The existing scrypt derivation logic had to be preserved exactly while switching the storage backend. The `coupon-service.ts` (migration 046) was the most tedious -- the coupon store had the most complex in-memory operations (search by code, expiration checks, usage counting) that all had to be translated to SQL correctly.

## Root Cause Analysis

The billing services were originally written as in-memory Maps during the prototype phase and never migrated because "we'll do it when we hit production." That day finally came. The pattern was fully established by migrations 043-045 but the remaining 6 services kept rotting. The i18n library split (react-intl vs custom hook) happened because different developers chose different approaches and nobody consolidated until now. The k6 auth headers were broken because the load test was written before the auth middleware was fully wired.

## Lessons Learned

1. In-memory Maps in production-adjacent services are technical debt that should be flagged at code review, not left as a TODO. If state must survive restart, use a database from day one.
2. Two i18n libraries is exactly one too many. Standardise on one approach at project bootstrap or pay the consolidation tax.
3. Load tests rot when the auth layer changes. The k6 auth header bug would have been caught immediately if we ran load tests in CI -- we don't, and that needs fixing.
4. The migration pattern (migration file + service refactor + caller updates + test rewrite) is now well-documented through 6 repetitions. The next service migration should be mechanical.

## Next Steps

- Run load tests in CI to catch auth header decay on the next middleware change
- Billing Phase 3 (if any) should be scoped to what remains in memory -- verify nothing was missed
- Push the GTM content live: Discord announcement, Twitter/X thread, blog post
- The code review's 2 low findings (both style nits in test files) should be fixed in a follow-up PR
