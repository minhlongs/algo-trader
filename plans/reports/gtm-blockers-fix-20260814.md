# GTM Blockers Fix Report — 2026-08-14

## Summary
Fixed 4 GTM blockers preventing first paying customers.

---

## 1. NOWPayments Environment Setup
**Status: COMPLETE**

- Added `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`, and invoice ID placeholders to `.env.example`
- Key observations:
  - `.env` has no NOWPayments keys (payment flow is not live)
  - `nowpayments-service.ts` reads `NOWPAYMENTS_API_KEY` from process.env at runtime
  - Payment flow code is structurally complete: invoice creation, IPN webhook handler, payout endpoint all implemented
  - Price constants in `nowpayments-service.ts`: PRO=$99, ENTERPRISE=$299, MASTER=$999

**Action required before live:** Set actual NOWPayments API key in `.env` and wrangler secrets.

---

## 2. Fix Price Mismatch (CRITICAL)
**Status: COMPLETE**

Three sources had different prices. Canonical values taken from `src/platform/billing/pricing-tiers.ts`:

| Tier | pricing-tiers.ts (canonical) | config.js (BEFORE) | index.html (BEFORE) |
|------|-----|------|------|
| STARTER/PRO | $99 | $19 | $49 |
| PRO/ENTERPRISE | $299 | $99 | $149 |
| ELITE/MASTER | $999 | $299 | $499 |

**Files modified:**
- `landing/src/forest/js/config.js` — CHECKOUT prices + TIER_PRICES + TIER_MAP updated
- `src/platform/landing/public/index.html` — price display elements + meta descriptions updated

---

## 3. Persist Onboarding Data to Database
**Status: COMPLETE**

**Problem:** `onboarding-service.ts` used an in-memory `Map<string, SignupState>` -- all pending signups (email, verification code, tier) were lost on process restart.

**Fix:**
- Created migration `src/db/migrations/044-onboarding-signups.ts`:
  - `onboarding_signups` table with id, email, tier, status (pending/verified/activated), verification_code, license_key, expires_at
  - Partial unique index on email WHERE status='pending'
  - Index on status and expires_at
- Registered migration in `src/db/migration-runner.ts`
- Rewrote `src/platform/billing/onboarding-service.ts`:
  - Replaced in-memory Map with PostgreSQL queries via `getDbClient().connect()`
  - All three steps (signup, verify, activate) now persist to `onboarding_signups` table
  - Proper `client.release()` in finally blocks
  - Added `import type { PoolClient } from 'pg'` for type correctness

---

## 4. Wire Co-pilot to Real Data
**Status: COMPLETE**

**Problem:** `src/platform/workers/api/copilot.ts` (CF Worker) returned hardcoded placeholder text for risk, arb, regime, and report intents.

**Fix:**
- Added `proxyToVPS()` function that proxies the full `/ask` request to the VPS Express co-pilot endpoint (`/api/v1/co-pilot/ask`) when `VPS_ORIGIN` env var is set
- The VPS co-pilot routes (`src/platform/api/routes/co-pilot-routes.ts`) have 5 real handlers that query PostgreSQL for signals, predictions, positions, and strategy performance
- 8-second timeout with automatic fallback to inline CF Worker handlers if VPS is unreachable
- Added `usedRealData: boolean` field to response for frontend transparency
- Added structured logging for intent classification and proxy success/failure
- Inline handlers preserved as fallback (same behavior as before when VPS is unavailable)

**Config required:** Set `VPS_ORIGIN` in wrangler.toml `[vars]` section or via `wrangler secret put VPS_ORIGIN`.

---

## Compilation Status
All 3 modified/new TS files pass TypeScript transpilation cleanly:
- `src/platform/workers/api/copilot.ts` — OK
- `src/platform/billing/onboarding-service.ts` — OK
- `src/db/migrations/044-onboarding-signups.ts` — OK

Pre-existing TS errors in unrelated files (strategy-registry-full.ts, polymarket-adapter.ts) remain unchanged.

---

## Unresolved Questions
1. **NOWPayments invoice IDs:** The CHECKOUT URLs in `config.js` have invoice IDs. Are these still valid? They should be regenerated after NOWPayments account is fully configured.
2. **Migration 044 execution:** Will run on next server startup via migration-runner. Verify `onboarding_signups` table exists before testing signup flow.
3. **VPS co-pilot endpoint:** Does `/api/v1/co-pilot/ask` exist in the deployed VPS Express routes? Confirmed in `src/platform/api/routes/co-pilot-routes.ts` -- it does.
4. **Signal data freshness in VPS handlers:** The risk, arb, and regime handlers on VPS rely on PostgreSQL data (signals, predictions). Ensure signal ingestion pipeline is running and populating these tables for handlers to return non-empty results.
