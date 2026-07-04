---
phase: 4
title: "D: Referral Go-Live"
status: pending
priority: P2
dependencies: []
---

# Phase 4: Referral Go-Live

## Overview

Activate the referral program. Code already built (routes, dashboard page). Wire code generation on signup, test E2E flow, add share link widget.

## Requirements

- Referral code auto-generated on signup (or on first dashboard visit)
- Share link: `https://quant.cashclaw.cc?ref=<code>` — copies to clipboard
- Conversion tracking: referrer gets 20% of first month rev share
- Referral dashboard shows: total referrals, active conversions, pending rewards
- Test: signup → get code → share → subscription → conversion tracked

## Architecture

Referral routes already registered at `/api/referral/`. Page at `/app/referral` already in sidebar. Activation = ensure auto-generation works + E2E test.

## Related Code Files

- **Read/Verify:** `src/platform/api/routes/referral-routes.ts` — routes already built
- **Read/Verify:** `src/platform/referral/referral-repository.ts` — DB queries
- **Read:** `dashboard/src/pages/referral-page.tsx` — page exists, verify rendering
- **Modify (if needed):** `src/platform/api/routes/auth-routes.ts` — add referral code gen on signup

## Implementation Steps

1. Read `referral-routes.ts` and test with `curl` to confirm routes respond
2. Read `referral-page.tsx` to verify it renders the share link and stats
3. Check if referral code is auto-generated on signup (if not, add trigger in auth flow)
4. E2E test: signup → navigate to referral page → copy link → verify code saved to DB
5. Run `pnpm test` to confirm no regressions

## Success Criteria

- [ ] `GET /api/referral/referral-code` returns a valid code for authenticated user
- [ ] `/app/referral` page loads with share link and stats
- [ ] Share link copy button works
- [ ] Conversion tracked on subscription (referral code in checkout)
- [ ] 2,798 tests passing

## Risk Assessment

- Referral code may not auto-generate → add trigger in auth or first page load
- Dashboard page may need polish → minimal fix, defer styling to later phase
