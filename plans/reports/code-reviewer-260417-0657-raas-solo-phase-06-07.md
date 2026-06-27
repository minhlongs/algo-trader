# Code Review — RaaS Solo Phase 06 + 07

**Branch:** `plan/raas-solo-platform-260416` @ `0b0ed8e`
**Scope:** Phase 06 subscriber P&L dashboard + Phase 07 enterprise tier invoice/TAM handoff
**Reviewer:** code-reviewer
**Date:** 2026-04-17 06:57

## Verification Matrix
- tsc (backend): 0 errors
- tsc (dashboard): 0 errors
- Backend tests (raas + enterprise-onboarding): 44/44 pass (216ms)
- Dashboard UI tests: **BLOCKED — jsdom missing dep**
- `any` / `@ts-ignore` in scope: 0
- Polar forbidden-word scan (pages + backend): clean except 1 soft-flag

## File Size Audit (≤200 LoC target)
| File | LoC | Status |
|------|-----|--------|
| src/raas/subscriber-executor.ts | 202 | **2 lines over** |
| dashboard/src/pages/enterprise-contact-page.tsx | 201 | **1 line over** |
| All others | ≤186 | ok |

## Critical / Blocker Issues

### B1. `subscriberPnlRouter` not wired (CRITICAL — functionality dead)
`src/api/routes/subscriber-pnl-routes.ts` is created and exported, but **grep shows no import anywhere in `src/app.ts` or `src/api/server.ts`**. All four endpoints (`/pnl /equity /activity /trades`) return 404 in runtime. Dashboard `useSubscriberPnl` hook fires 4 parallel fetches that will all error.
**Fix:** register `app.use('/api/v1/subscriber', subscriberPnlRouter)` with auth middleware chain upstream.

### B2. Enterprise inquiry backend route missing (CRITICAL — form broken)
`enterprise-contact-page.tsx` POSTs to `/api/enterprise/inquiries` and `enterprise-tam-dashboard-page.tsx` GETs / PATCHes same path. **No Express route for `/api/enterprise/inquiries` exists in commit `e1bff1a`** — only the service layer (`EnterpriseOnboardingService`). Form will fail with 404 in prod.
**Fix:** add `src/api/routes/enterprise-inquiry-routes.ts` wiring `submitInquiry / list / update` to POST/GET/PATCH, register in app, protect list/update with admin guard.

### B3. Dashboard tests uncrunnable — `jsdom` missing
`dashboard/vitest.config.ts` declares `environment: 'jsdom'` but `dashboard/package.json` lacks `jsdom`. Commit `d68665a` added `@testing-library/react` + `jest-dom` but forgot jsdom. All Phase 06 + 07 UI tests error `ERR_MODULE_NOT_FOUND: jsdom`. The enterprise-pages shape test is pure JS and could run with `environment: 'node'`, but subscriber-overview / equity / trade-history tests need DOM.
**Fix:** `pnpm add -D jsdom` in `dashboard/`.

### B4. TAM dashboard has no client auth gate (HIGH — data exposure risk once B2 is fixed)
`EnterpriseTamDashboardPage` renders the "Internal" header and fetches `/api/enterprise/inquiries` with no token / auth state check. Once the backend route exists, protection lives only server-side; UI does not gate render. If a non-admin user reaches `/enterprise/tam-dashboard` while authenticated, they see a loading skeleton then error, instead of a hard `403 → redirect`. Not a security hole (server-side guard required anyway) but leaks UX that internal page exists.
**Fix:** add `useAuthStore` role check; redirect `/login` or `/403` if `role !== 'admin'`.

## High-Priority Findings

### H1. "BAA" mention in pricing FAQ — Polar acceptable-use soft-flag
`enterprise-pricing-page.tsx` line ~90: `"BAA and DPA available on Unlimited tier"`. BAA = HIPAA Business Associate Agreement. Given 2026-03-23 WellNexus incident (account flagged for "wellness" keywords), any HIPAA / medical-adjacent term is risk. Unlikely to trip auto-classifier (only abbreviation) but recommend scrubbing.
**Fix:** replace with `"custom DPA and data-processing addenda available on Unlimited tier"`.

### H2. In-memory enterprise inquiry store is lossy on restart
`enterpriseInquiryStore` uses `Map<string, EnterpriseInquiry>`. Singleton, process-local. On server restart / redeploy, ALL inquiries + TAM assignments vanish. For a $49k-$499k ACV pipeline, this is unacceptable.
**Fix:** persist to Postgres table `enterprise_inquiries` (schema: id/email/company/tier/status/paperdemo_key/created_at). YAGNI note: acceptable for MVP-today but MUST have persistence before first real prospect.

### H3. `subscriber-executor.ts` `getRecentExecutions` bypasses `tenantQuery()`
Line ~187-199: uses `filter.clause` and raw `query()` rather than the enforced placeholder pattern. SQL is still parameterized so no injection risk, but pattern inconsistency defeats the "ONLY authorized way" comment in `subscriber-tenant-isolator.ts`. Also uses `LIMIT ${Math.min(limit, 500)}` interpolation — safe (numeric clamp) but adds auditor noise.
**Fix:** refactor to `tenantQuery()` with `/*TENANT*/` marker. Keep LIMIT as interpolation (numeric-only, already clamped).

## Medium-Priority Findings

### M1. `parseInt`/`parseFloat` on DB strings without NaN guards
`subscriber-pnl-aggregator.ts`, `subscriber-equity-curve-builder.ts`, `subscriber-activity-metrics.ts`: all use `parseInt(row?.x ?? '0')` / `parseFloat(row?.x ?? '0')`. If Postgres returns an unexpected non-numeric string (e.g., `'NaN'`, `'null'`), result is `NaN` and propagates silently into UI (showing `NaN%`). Low-probability with numeric aggregates but worth defensive coerce.
**Fix:** helper `toNumber(v, fallback=0)` returning `Number.isFinite(parsed) ? parsed : fallback`.

### M2. `profitFactor === Infinity` leaks to UI
`subscriber-pnl-aggregator.ts` line 97: `profitFactor: totalLoss > 0 ? totalProfit / totalLoss : Infinity`. UI renders `'∞'` glyph — acceptable, but JSON-serializes as `null` in strict mode or error in some fetch middleware.
**Fix:** cap at a sentinel number (e.g., `9999`) or return `null` + handle in UI.

### M3. `subscriber-executor.ts` DLP shim + sandbox shim are stubs
`checkDlpPolicy` (blocks only `startsWith('blocked-')`) and `invokeSandbox` (deterministic hash mod 3) are intentional stubs. Acceptable per plan (Phase 02/03 integration points). **Risk:** if this branch merges to main before IronClaw + Wasm runtime are wired, paper-demo trades will be deterministic with no real DLP protection.
**Fix:** add compile-time / runtime guard `if (process.env.NODE_ENV === 'production') throw new Error('SubscriberExecutor shim must not run in prod')`.

### M4. File size overages (trivial)
- `subscriber-executor.ts` 202 LoC (2 over) — extract `recordTrade` SQL constant.
- `enterprise-contact-page.tsx` 201 LoC (1 over) — extract `<Field>` + `inputCls` to `dashboard/src/components/enterprise-form-field.tsx`.

## Low-Priority

### L1. No rate-limiting on public `POST /api/enterprise/inquiries` (once B2 fixed)
When backend route is added, it should go behind a rate-limiter (e.g., 5 req / min / IP) to prevent TAM inbox spam.

### L2. `generateId()` in `subscriber-executor.ts` uses `Math.random()`
`${Date.now()}-${Math.random().toString(36).slice(2,9)}` — sufficient entropy for internal IDs but not collision-resistant at scale. `crypto.randomUUID()` already imported pattern (`enterprise-inquiry-store.ts`). Align.

### L3. Error leakage on 500 response
`subscriber-pnl-routes.ts` returns raw `err.message` in 500 body. For prod, replace with generic `'Internal error'` + log the real message server-side.

## Edge Cases Scouted
- **Cross-tenant via admin claim spoof:** `extractTokenClaims` trusts `req.claims` set by upstream middleware. If that middleware is skipped for any route (dev bypass / mis-config), claims === undefined and endpoint falls through to `'no subscriber identity'` error → safe-by-default. OK.
- **`subscriberId = ''` param:** `String(req.params.id ?? '')` → `''` → `buildTenantFilter('')` throws → 500. Should be 400.
- **`rangeMs` negative:** `Math.abs()` guards. OK.
- **`capital` query float = `'abc'`:** `parseFloat('abc')` → NaN → equity curve corrupted. Add default fallback.
- **Equity curve max drawdown divide-by-zero:** `peak > 0` guard present. OK.
- **`list()` sort on identical `createdAt` strings:** stable, but test `enterprise-onboarding.test.ts` was fixed in commit `0b0ed8e` to check descending invariant not absolute position — confirms issue was already caught.

## Positive Observations
- `subscriber-tenant-isolator.ts` is textbook: opaque filter type, required `/*TENANT*/` marker, `assertTenantAccess` symmetric across routes, 12 tests covering cross-tenant denial. Strong design.
- `enterprise-plans.ts` single-source-of-truth with Polar-safe copy, plus `no forbidden words` test. Very good.
- Zero `any` / `@ts-ignore` in 23 reviewed files.
- Backend test coverage: 44 tests / 4 files / 216ms — fast.
- HTML email builders correctly escape user input (`esc()`).
- Email service degrades gracefully (log-only if not init).

## Verdict

**Overall score: 7.5/10**
- Architecture: 9/10 (tenant isolator excellent)
- Type safety: 10/10
- Security: 8/10 (server-side tenant gate solid, client-side TAM gate missing)
- Completeness: 5/10 (2 routes missing, UI tests can't run)
- Polar compliance: 9/10 (1 soft flag: BAA)

**Auto-approve: NO.** Must-fix before merge:
1. B1 — wire `subscriberPnlRouter` into app
2. B2 — add `enterprise-inquiry-routes.ts` backend
3. B3 — add `jsdom` dep to dashboard
4. B4 — admin guard on TAM dashboard page
5. H1 — scrub "BAA" from FAQ

After fixes, re-run: backend vitest + dashboard vitest + dashboard tsc. Score should rise to 9.5+.

## Unresolved Questions
1. Is `auth-middleware` that populates `req.claims` wired into routes that will register `subscriberPnlRouter`? If not, claims will be `undefined` and all non-admin traffic hits `'no subscriber identity in token'` → 403.
2. Should enterprise inquiries persist to `trades`-adjacent Postgres table or reuse existing `billing` schema?
3. Phase 06 plan claims "multi-tenant dashboard" but current UI shows only `tenantId` from `useAuthStore`. Is admin cross-tenant switching out-of-scope for this phase, or should there be a tenant selector?
