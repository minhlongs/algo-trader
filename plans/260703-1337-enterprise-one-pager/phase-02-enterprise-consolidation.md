---
phase: 2
title: "Enterprise Consolidation"
status: pending
effort: S
---

# Phase 2: Enterprise Consolidation

## Overview
Merge enterprise-pricing-page.tsx and enterprise-contact-page.tsx into one consolidated `/enterprise` page with tab navigation. Delete thank-you page. Archive TAM dashboard.

## Architecture
- **New file:** `dashboard/src/pages/enterprise-page.tsx` — consolidated page with:
  - Tab state: "pricing" | "contact" | "success" (redirect after submit)
  - Tab 1: Pricing cards (updated to current tiers: PRO $99, ENTERPRISE $299, MASTER $999)
  - Tab 2: Contact form (submits to `POST /api/enterprise/inquiries`)
  - Tab 3: Success (redirect from contact form submit)
- **Delete:** `enterprise-pricing-page.tsx` (content merged)
- **Delete:** `enterprise-contact-page.tsx` (content merged)
- **Delete:** `enterprise-thank-you-page.tsx` (redirect to /enterprise?tab=success)
- **Archive:** `enterprise-tam-dashboard-page.tsx` (move to archived/)
- **Modify:** `App.tsx` — add `/enterprise` public route

## Implementation Steps
1. Create dashboard/src/pages/enterprise-page.tsx with tab navigation
2. Merge pricing cards from enterprise-pricing-page.tsx (update to current tiers)
3. Merge contact form from enterprise-contact-page.tsx (update tier dropdown)
4. Add `/enterprise` route in App.tsx
5. Delete old files, archive TAM dashboard
6. Run `npx tsc --noEmit`

## Design
- Dark theme, gold #F59E0B design tokens
- Tab nav with FadeIn animations (follow landing-page.tsx pattern)
- Mobile responsive: tabs collapse to stacked
- Public route (no auth required)
- On submit success: redirect to /enterprise?tab=success

## Success Criteria
- [ ] `/enterprise` renders pricing with PRO $99 / ENTERPRISE $299 / MASTER $999
- [ ] Contact form submits with correct tier values
- [ ] Thank-you deleted, replaced with success redirect
- [ ] TAM dashboard archived
- [ ] TypeScript: 0 errors
