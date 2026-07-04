# Phase 1: Cookie-Based Attribution System

**Priority**: P1 - Core Feature  
**Status**: Not Started  
**Effort**: 2 days  
**Dependencies**: Migration 024 (referral tables) complete

---

## Context Links

- **Plan**: `plans/260621-1618-affiliate-api-enhancements/plan.md`
- **Existing**: `src/referral/referral-service.ts`, `src/api/routes/referral-routes.ts`
- **DB Schema**: `src/db/migrations/024_create_referral_tables.sql`
- **Related**: `src/billing/onboarding-service.ts` (signup flow)

---

## Overview

Implement cookie-based affiliate attribution with a 90-day persistent window. Currently, the system only tracks clicks via URL parameters (`?ref=CODE`) and tracking IDs. This limits attribution to the immediate signup session. Cookies enable cross-session, cross-device attribution (up to 90 days), significantly improving conversion tracking and partner trust.

---

## Key Insights

- **Current gap**: User clicks referral link → lands on site → if they close browser and return later (without URL param), attribution is lost
- **Cookie strategy**: Set `affiliate` cookie on first click (hashed value for PII protection). Read cookie during signup/activation. Fallback to URL param if cookie missing.
- **90-day window**: Matches industry standard (Amazon Associates, ShareASale). Long enough for consideration, short enough to limit fraud.
- **Privacy**: Cookie stores only a random hash (not the actual referral code). Mapping stored server-side in `affiliate_cookie` table. GDPR compliant (no personal data in cookie).
- **Fallback**: Support both cookie and URL param for 90-day transition period. Eventually deprecate URL param.

---

## Requirements

### Functional
1. **Cookie set**: When user visits `/api/v1/referral/track-click?code=XXXX`, set `affiliate=<hash>` cookie with 90-day expiry
2. **Cookie read**: During signup (`POST /api/v1/signup`) or activation (`POST /api/v1/activate`), read cookie and attribute conversion to referring tenant
3. **Cookie validation**: Verify hash → referral code mapping exists and is still active
4. **90-day window**: Only attribute if cookie age < 90 days; else treat as direct signup
5. **Fallback**: If cookie absent, check `?ref=` URL param (existing behavior)
6. **PII protection**: Never expose raw referral code in cookie; use hash(hash + secret)

### Non-Functional
- Cookie: `HttpOnly`, `Secure`, `SameSite=Lax` (cross-site affiliate links)
- Cookie size: < 50 bytes
- Cookie path: `/` (site-wide)
- Attribution lookup: < 5ms p99
- No regression: existing URL param attribution must continue working
- Backfill: existing `referral_tracking` records without cookies remain valid

---

## Architecture

### Data Model

Add table `affiliate_cookies`:
```sql
CREATE TABLE affiliate_cookies (
  cookie_hash VARCHAR(64) PRIMARY KEY,  -- SHA-256 hash
  referral_code VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,  -- created_at + 90 days
  first_seen_ip INET NOT NULL,
  last_seen_ip INET,
  click_count INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (referral_code) REFERENCES referral_codes(code)
);

CREATE INDEX idx_affiliate_cookies_expires ON affiliate_cookies(expires_at);
CREATE INDEX idx_affiliate_cookies_referral ON affiliate_cookies(referral_code);
CREATE INDEX idx_affiliate_cookies_hash ON affiliate_cookies(cookie_hash);
```

### Component Flow

```
User clicks: https://algo-trader.com/landing?ref=ALGO2025
  ↓
Browser: GET /landing?ref=ALGO2025
  ↓
Track-Click API: POST /api/v1/referral/track-click?code=ALGO2025
  ↓
CookieAttributionService:
  1. Generate hash: H = SHA256(random_uuid + SECRET).substring(0, 32)
  2. Store in affiliate_cookies: cookie_hash=H, referral_code=ALGO2025
  3. Set-Cookie: affiliate=H; Max-Age=7776000; Path=/; HttpOnly; Secure; SameSite=Lax
  4. Return tracking_id (existing)
  ↓
User browses site (cookie persists for 90 days)
  ↓
User signs up: POST /api/v1/signup { email, tier }
  ↓
OnboardingService.signup():
  1. Read cookie from req.cookies.affiliate
  2. If cookie exists → lookup cookie_hash → referral_code
  3. Verify code active (not expired, not max_uses exceeded)
  4. Store attribution: pending_signups[email] = { referral_code, ... }
  5. Continue verification → activation
  ↓
OnboardingService.activate():
  1. Retrieve pending signup (with referral_code)
  2. Get referring tenant_id from referral_codes
  3. Call referralService.recordConversion(tracking_id, new_tenant_id, user_id)
  4. Commission calculated when new tenant pays
```

---

## Related Code Files

**To Modify**:
- `src/api/routes/referral-routes.ts` - enhance `track-click` to set cookie
- `src/billing/onboarding-service.ts` - read cookie in signup/activate
- `src/app.ts` - add cookie-parser middleware (if not already present)

**To Create**:
- `src/referral/cookie-attribution.ts` - `CookieAttributionService` class
- `src/api/middleware/affiliate-cookie.ts` - middleware to inject cookie helper
- `src/db/migrations/025_affiliate_cookies.sql` - new table + indexes

**Tests**:
- `src/referral/__tests__/cookie-attribution.test.ts`
- `src/billing/__tests__/onboarding-cookie.test.ts`
- `src/api/routes/__tests__/referral-cookie.test.ts`

---

## Implementation Steps

1. **Add cookie-parser dependency** (if missing):
   ```bash
   pnpm add cookie-parser
   ```
   Update `src/app.ts`:
   ```typescript
   import cookieParser from 'cookie-parser';
   // ...
   this.app.use(cookieParser());
   ```

2. **Create migration** `src/db/migrations/025_affiliate_cookies.sql`:
   ```sql
   CREATE TABLE affiliate_cookies (
     cookie_hash VARCHAR(64) PRIMARY KEY,
     referral_code VARCHAR(32) NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     expires_at TIMESTAMPTZ NOT NULL,
     first_seen_ip INET NOT NULL,
     last_seen_ip INET,
     click_count INTEGER NOT NULL DEFAULT 1,
     FOREIGN KEY (referral_code) REFERENCES referral_codes(code)
   );
   CREATE INDEX idx_affiliate_cookies_expires ON affiliate_cookies(expires_at);
   CREATE INDEX idx_affiliate_cookies_referral ON affiliate_cookies(referral_code);
   ```

3. **Create `CookieAttributionService`** (`src/referral/cookie-attribution.ts`):
   - `generateCookieHash(): string` - generate unique hash with crypto.randomUUID() + secret
   - `createCookieMapping(hash, referralCode, ip): Promise<void>` - insert into DB
   - `getReferralCodeByCookieHash(hash): Promise<string | null>` - lookup
   - `isCookieValid(hash): Promise<boolean>` - check exists + not expired
   - `incrementClickCount(hash): Promise<void>` - track multiple clicks from same cookie

4. **Enhance `track-click` endpoint** (`src/api/routes/referral-routes.ts`):
   ```typescript
   referralRouter.post('/track-click', async (req, res) => {
     // ... existing validation ...
     
     // Set affiliate cookie (new)
     const cookieHash = await cookieAttributionService.generateCookieHash();
     await cookieAttributionService.createCookieMapping(cookieHash, code, ip);
     
     // Set cookie in response
     res.cookie('affiliate', cookieHash, {
       httpOnly: true,
       secure: process.env.NODE_ENV === 'production',
       sameSite: 'lax',
       maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
       path: '/',
     });
     
     // ... existing tracking logic ...
   });
   ```

5. **Enhance `OnboardingService`** (`src/billing/onboarding-service.ts`):
   - Add `referralCode?: string` field to `PendingSignup` interface
   - Modify `signup()`:
     ```typescript
     const cookieHash = req.cookies?.affiliate;
     let referralCode: string | undefined;
     if (cookieHash) {
       referralCode = await cookieAttributionService.getReferralCodeByCookieHash(cookieHash);
     }
     // Fallback to URL param
     if (!referralCode && req.body.referralCode) {
       referralCode = req.body.referralCode;
     }
     // Store in pending signup
     this.pending.set(email, { ..., referralCode });
     ```
   - Modify `activate()`:
     ```typescript
     const pending = this.pending.get(email);
     if (pending?.referralCode) {
       // Find or create tracking record
       let tracking = await referralRepository.getTrackingByCookie(cookieHash);
       if (!tracking) {
         // Create synthetic tracking from cookie attribution
         const trackingId = await referralRepository.trackClickFromCookie(
           pending.referralCode,
           pending.referralCode, // IP from original click stored in cookie table
         );
         tracking = await referralRepository.getTrackingById(trackingId);
       }
       // Record conversion
       await referralService.recordConversion(tracking.id, newTenantId, userId);
     }
     ```

6. **Add repository method**: `getTrackingByCookie(cookieHash)` in `ReferralRepository`

7. **Write unit tests**:
   - Cookie hash generation: deterministic? No, use crypto.randomUUID
   - Cookie expiry: 90 days exactly
   - Lookup: valid hash returns code, expired returns null
   - Signup flow: with cookie → attribution recorded
   - Signup flow: without cookie → fallback to URL param
   - Signup flow: expired cookie → treat as direct

8. **Write integration tests**:
   - Full flow: track-click → set cookie → wait (simulate) → signup → verify conversion linked
   - Cookie rotation: new click overwrites old cookie
   - Cookie deletion: signup without cookie falls back to URL param

9. **Run typecheck & tests**:
   ```bash
   pnpm run typecheck
   pnpm test src/referral/__tests__/cookie-attribution.test.ts
   ```

10. **Deploy to staging**:
    - Run migration: `pnpm exec ts-node src/db/migration-runner.ts`
    - Test with Postman: track-click → check Set-Cookie header → signup with cookie
    - Verify conversion appears in tenant's stats

---

## Todo List

- [ ] Add `cookie-parser` dependency
- [ ] Create migration `025_affiliate_cookies.sql`
- [ ] Implement `CookieAttributionService` class
- [ ] Update `track-click` endpoint to set cookie
- [ ] Update `OnboardingService.signup()` to read cookie
- [ ] Update `OnboardingService.activate()` to attribute from cookie
- [ ] Add `getTrackingByCookie()` to `ReferralRepository`
- [ ] Write unit tests (≥ 90% coverage)
- [ ] Write integration tests (full flow)
- [ ] Run typecheck (0 errors)
- [ ] Deploy migration to staging
- [ ] Manual QA: verify cookie set, attribution recorded
- [ ] Update API docs (note cookie behavior)

---

## Success Criteria

- **Cookie set**: `track-click` returns `Set-Cookie: affiliate=<hash>` with 90-day Max-Age
- **Attribution**: Conversions within 90 days of cookie set correctly attributed
- **No regression**: URL param attribution still works for users without cookies
- **Performance**: Cookie lookup < 5ms p99
- **Security**: Cookie value is hash, not raw referral code
- **Tests**: Unit ≥90%, integration 100%, E2E passing

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Cookie blocked by browser (Safari ITP) | Medium | Medium | Fallback to URL param + localStorage (with user consent) |
| Cookie overwritten by multiple clicks | Low | Low | Each new click updates cookie (last-click attribution) |
| Cookie hash collision | Very Low | High | Use SHA-256 (256-bit), probability negligible |
| Migration fails on large DB | Low | High | Test on staging with production data volume; batch if needed |
| Attribution window disputes | Medium | Medium | Store `cookie_set_at` and `attribution_window_used` for audit |

---

## Security Considerations

- **HttpOnly**: Prevents XSS stealing of affiliate cookie
- **Secure**: Only over HTTPS (production)
- **SameSite=Lax**: Allows cross-site affiliate links (user clicks from Twitter → our site) but protects against CSRF
- **Hash**: Never store raw referral code in cookie; prevents enumeration attacks
- **Secret rotation**: `COOKIE_HASH_SECRET` env var; rotate quarterly
- **SQL injection prevention**: Parameterized queries only
- **Rate limiting**: `track-click` already rate-limited (1000 RPM/IP); prevents cookie spam
- **Data retention**: Expire cookies after 90 days (automatic via query filter)

---

## Next Steps

After Phase 1 completion:
1. Phase 2: Real-time commission WebSocket (partners get live updates)
2. Phase 3: Enhanced reporting (date ranges, CSV export)
3. Phase 4: Dedicated affiliate API keys
4. Phase 5: Enhanced fraud detection

---

**Phase Status**: Not Started  
**Blockers**: None (all dependencies met)  
**Next**: Begin implementation after plan approval
