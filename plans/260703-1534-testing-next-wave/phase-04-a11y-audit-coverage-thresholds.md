---
phase: 4
title: "A11y Audit + Coverage Thresholds"
status: pending
effort: S
---

# Phase 4: A11y Audit + Coverage Thresholds

## Overview
WCAG AA accessibility scan of dashboard pages + configure vitest coverage thresholds.

## Implementation Steps
1. Install @axe-core/cli: `npm install -g @axe-core/cli`
2. Run scan on landing page: `axe http://localhost:5174/dashboard/ --save a11y-landing.json`
3. Run scan on pricing page: `axe http://localhost:5174/dashboard/pricing --save a11y-pricing.json`
4. Document any critical violations found
5. Configure vitest coverage threshold in vitest.config.ts: 80%+ for branches, functions, lines, statements
6. Add coverage badge to README if desired

## Success Criteria
- [ ] axe-core scans complete on 2+ pages
- [ ] No critical WCAG violations (or documented exceptions)
- [ ] Vitest coverage threshold set to 80%+
- [ ] `npx vitest --coverage` passes threshold
