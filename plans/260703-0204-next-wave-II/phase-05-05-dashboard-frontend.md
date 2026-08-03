---
phase: 5
title: "Dashboard Missing Pages"
status: completed

## Completed — 2026-08-04

Dashboard routes wired into App.tsx with API keys, trial-status, and marketplace-badge pages. Trial-drip-runner service created. PM2 cron scheduled for trial-drip email automation (ecosystem config pending PM2 reload — non-blocking, non-code deferral).
priority: P1
dependencies: [2]
---

# Phase 5: Dashboard Missing Pages

## Overview

Add the 3 missing dashboard pages that don't yet exist. The pricing page and analytics page already exist — do NOT recreate them.

**Red-team findings applied:** pricing-page.tsx and analytics-page.tsx already exist. Only build what's missing: API keys UI, trial status page, marketplace badges.

## Pages Already Exist (DO NOT BUILD)

| Page | File | Status |
|------|------|--------|
| Pricing / Plans | `dashboard/src/pages/pricing-page.tsx` | ✅ Exists — route in App.tsx line 48 |
| Subscription Analytics | `dashboard/src/pages/analytics-page.tsx` | ✅ Exists |

## Pages to Build

| Page | Component | API Endpoints | New/Existing |
|------|-----------|---------------|--------------|
| API Key Management | `api-keys-page.tsx` | GET/POST/DELETE /api/v1/api-keys | NEW |
| Trial Status & Email Prefs | `trial-status-page.tsx` | GET /api/v1/trial-drip/status, POST /subscribe/unsubscribe | NEW |
| Marketplace Badge Display | `marketplace-badge.tsx` | GET /api/v1/marketplace/listings/:id/badges | NEW |

## Related Code Files

- Create: `dashboard/src/pages/api-keys-page.tsx` — key list, create dialog, revoke confirmation
- Create: `dashboard/src/pages/trial-status-page.tsx` — trial progress bar, email toggle
- Create: `dashboard/src/components/marketplace-badge.tsx` — badge icon + tooltip
- Modify: `dashboard/src/App.tsx` — add routes for new pages
- Read: `dashboard/src/pages/pricing-page.tsx` — verify it exists (don't create duplicate)
- Read: `dashboard/src/pages/analytics-page.tsx` — verify it exists (don't create duplicate)
- Read: `dashboard/src/App.tsx` — existing route pattern

## Implementation Steps

1. Read existing pages and App.tsx to match patterns
2. Create API Keys page: list keys → create dialog (calls POST /api/v1/api-keys) → show full key once → revoke confirmation (DELETE)
3. Create Trial Status page: progress bar (days remaining), email toggle (subscribe/unsubscribe), drip schedule timeline
4. Create Marketplace Badge component: badge icon on listing cards + tooltip explaining badge criteria
5. Wire routes in App.tsx
6. Verify `dashboard:dev` starts without errors
7. Verify `dashboard:build` succeeds

## Success Criteria

- [ ] API Keys page: create shows full key once, revoke requires confirmation
- [ ] Trial Status page: shows remaining trial days, toggle for email preferences
- [ ] Marketplace Badge: displays on listing cards with hover tooltip
- [ ] No duplicate routes or pages created (pricing-page.tsx, analytics-page.tsx untouched)
- [ ] `dashboard:build` succeeds
- [ ] `dashboard:dev` starts without errors

## Risk Assessment

- LOW: Pure frontend work. API contracts already defined and tested server-side.
- If API returns 401/403 (not authenticated), show clear error message in UI.
