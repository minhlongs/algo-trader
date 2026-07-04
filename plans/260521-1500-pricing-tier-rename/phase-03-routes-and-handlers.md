# Phase 03 — API routes + webhook + telegram handlers

**Priority:** P0
**Status:** pending
**Depends on:** Phase 02

## Goal

Fix remaining TS compile errors in route/handler/signal/telegram code by:
1. Replacing `LicenseTier.ENTERPRISE` literals with `LicenseTier.GROWTH`.
2. Adding STARTER handling where tiers are enumerated.
3. Routing webhook tier strings through `normalizeTier()`.

## Files to modify

| File | Change |
|------|--------|
| `src/api/routes/onboarding-routes.ts` | Tier enumerations + price display. |
| `src/api/routes/signal-subscription-routes.ts` | Tier-keyed branches. |
| `src/api/routes/signal-feed-routes.ts` | Tier filter. |
| `src/api/routes/coupon-routes.ts` | Tier-eligible-coupon list. |
| `src/api/routes/license-routes.ts` | Tier validation for create/list endpoints. |
| `src/api/routes/api-key-routes.ts` | Tier-keyed rate limits. |
| `src/api/routes/webhooks/handlers/subscription-handler.ts` | Wrap inbound `tier` string with `normalizeTier()` before persisting. |
| `src/signal/signal-publisher.ts` | Tier broadcast filter. |
| `src/signal/signal-tier-filter.ts` | Tier ladder mapping. |
| `src/signal/signal-types.ts` | Tier type union. |
| `src/signal/telegram-signal-pusher.ts` | Tier-keyed routing. |
| `src/telegram/bot-command-handlers.ts` | `/tier`, `/upgrade` commands — new tier names. |
| `src/telegram/auto-support-handlers.ts` | Pricing message text (covered also in Phase 04). |
| `src/db/migrations/014_signal_feed.sql` | If column has CHECK constraint with `'ENTERPRISE'`, add migration `014a` to extend. (Verify first; may be no-op.) |

## Implementation steps

1. For each file, replace tokens:
   - `LicenseTier.ENTERPRISE` → `LicenseTier.GROWTH`
   - String literal `'ENTERPRISE'` (in tier context only) → `'GROWTH'`
   - Add explicit STARTER branch where switch/case enumerates tiers.
2. For `subscription-handler.ts`, add at top of payload handler:
   ```typescript
   const tier = normalizeTier(payload.tier);
   ```
3. For migration 014, `grep -n "ENTERPRISE\|tier" src/db/migrations/014_signal_feed.sql`. If a CHECK constraint exists, add migration `014a_extend_tier_check.sql` adding GROWTH/STARTER. Do NOT drop ENTERPRISE from the constraint — legacy rows may still hold it; let `normalizeTier` handle reads.
4. Run `npx tsc --noEmit` — should now succeed for all of `src/api/`, `src/signal/`, `src/telegram/`.
5. Run `npm test` — note which tests fail (Phase 06).

## Acceptance

- [ ] All files compile.
- [ ] `grep -rn "LicenseTier.ENTERPRISE" src/` returns 0.
- [ ] `grep -rn "'ENTERPRISE'" src/api/ src/signal/ src/telegram/` returns 0 (except inside `normalizeTier` alias map).
- [ ] Webhook handler normalises `tier` string from inbound payload.

## Notes

- DB migration: prefer extending CHECK constraints over rewriting. Legacy data stays valid; new writes use new tier names.
- If `014_signal_feed.sql` has no tier CHECK, no SQL change needed.
