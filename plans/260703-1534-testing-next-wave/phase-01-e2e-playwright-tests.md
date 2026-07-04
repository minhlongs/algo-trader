---
phase: 1
title: "E2E Playwright Tests"
status: pending
effort: M
---

# Phase 1: E2E Playwright Tests

## Overview
Create Playwright E2E tests for 5 key user flows. Playwright is configured but has 0 tests.

## Related Files
- Create: `tests/e2e/landing.spec.ts`
- Create: `tests/e2e/pricing.spec.ts`
- Create: `tests/e2e/enterprise.spec.ts`
- Create: `tests/e2e/navigation.spec.ts`
- Read: `playwright.config.ts` (if exists) or `package.json` playwright config

## Implementation Steps
1. Check existing playwright config
2. Create test: landing page — hero renders, trust bar visible, P&L ticker exists, pricing cards show
3. Create test: pricing page — 3 tiers visible (PRO $99, ENTERPRISE $299, MASTER $999), CTA links work
4. Create test: enterprise page — tab navigation works (Pricing ↔ Contact), form fields render
5. Create test: navigation — all public routes accessible (/pricing, /enterprise, /docs, /terms)
6. Create test: responsive — mobile viewport renders correctly
7. Run `npx playwright test` to verify

## Success Criteria
- [ ] 10-15 E2E tests passing
- [ ] Landing, pricing, enterprise, navigation, responsive covered
- [ ] All tests pass with `npx playwright test`
