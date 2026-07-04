---
title: "Phase 4 — Add i18n (EN/VN)"
description: "Add bilingual Vietnamese + English i18n to the 3 highest-traffic pages: trading, marketplace, and landing"
status: pending
priority: P1
effort: M
needsStitch: false
---

# Phase 4 — Add i18n (EN/VN)

## Context
<5% of UI strings are translatable. The top money-handling pages are English-only:
- Live Trading page — handles actual money
- Marketplace page — subscription purchases
- Landing page — first impression for non-tech CEOs
- Dashboard page — core user experience

Current i18n infrastructure exists at `dashboard/src/i18n/` covering license management + sidebar only.

## Tasks
1. Extract hardcoded strings to i18n key files (EN + VN)
2. Apply `useTranslations()` to trading, marketplace, dashboard, landing pages
3. Fix backtests-page.tsx mixed EN/VN inconsistency
4. Verify: all top-traffic pages switch locale correctly

## Files to modify
- `dashboard/src/i18n/locales/en.json`
- `dashboard/src/i18n/locales/vi.json`
- Trading, marketplace, dashboard, landing page components
