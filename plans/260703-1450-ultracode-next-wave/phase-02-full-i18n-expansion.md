---
phase: 2
title: "Full i18n Expansion"
status: pending
effort: M
---

# Phase 2: Full i18n Expansion

## Overview
Add bilingual EN/VN to 31 remaining pages. Fix dual i18n library issue (react-intl vs react-i18next).

## Current State
- 4 pages with i18n: Dashboard, Marketplace, Live Trading, StatsRow
- 31 pages English-only
- Dual libraries: react-intl (live trading page) + react-i18next (marketplace/dashboard)

## Sub-Tasks

### B1: Consolidate i18n libraries
1. Choose react-i18next as the single library (already used by marketplace + dashboard)
2. Migrate live-trading-page.tsx from react-intl to react-i18next
3. Remove react-intl dependency from package.json
4. Clean up remaining react-intl imports

### B2: Translate 5 high-traffic pages
1. pricing-page.tsx — pricing cards, CTAs, FAQ
2. signup-page.tsx — form labels, validation messages, buttons
3. login-page.tsx — form labels, error messages
4. settings-page.tsx — sections, toggles, buttons
5. account-page.tsx — profile fields, preferences
~100 keys total between EN + VI

### B3: Apply pattern to remaining pages (stretch)
- guide-page.tsx, docs-page.tsx, license-page.tsx, referral-page.tsx, etc.
- Use the same pattern established in B2
- ~200 more keys

## Related Files
- `dashboard/src/locales/en.ts`
- `dashboard/src/locales/vi.ts`
- `dashboard/src/pages/*.tsx` (31 files)

## Success Criteria
- [ ] react-i18next is the sole i18n library
- [ ] Live trading page still works after migration
- [ ] 5 high-traffic pages bilingual (EN/VN)
- [ ] TypeScript: 0 errors
- [ ] Tests: all passing
