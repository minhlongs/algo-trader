---
phase: 1
title: "Scout & Verify"
status: pending
effort: S
---

# Phase 1: Scout & Verify

## Overview
Pre-flight check: read the files that will be modified, verify backend endpoints exist, run baseline tests.

## Related Code Files
- Read: `dashboard/src/pages/enterprise-pricing-page.tsx`
- Read: `dashboard/src/pages/enterprise-contact-page.tsx`
- Read: `dashboard/src/pages/enterprise-tam-dashboard-page.tsx`
- Read: `dashboard/src/lib/enterprise-plans.ts`
- Read: `dashboard/src/App.tsx`
- Read: `src/platform/billing/enterprise-inquiry-store.ts`
- Read: `src/platform/api/routes/enterprise-routes.ts` (if exists)

## Implementation Steps
1. Read all enterprise-related source files
2. Check if `POST /api/enterprise/inquiries` endpoint is wired
3. Verify enterprise-inquiry-store.ts accepts the new tier values (PRO/ENTERPRISE/MASTER vs old growth/scale/unlimited)
4. Run `npx vitest run` to record baseline test count
5. Report findings before Phase 2/4 start

## Success Criteria
- [ ] All enterprise source files read and understood
- [ ] Backend endpoint status confirmed (if it exists, works with new tiers)
- [ ] Baseline tests recorded
