---
title: "Complete COLORS Hex P5 + WCAG + Hook Tests"
description: "Finalize Stitch AI design token migration (P5 hex cleanup), add WCAG 2.1 accessibility compliance, and write Vitest test coverage for 16 custom hooks."
status: pending
priority: P2
branch: "main"
tags: [design-tokens, wcag-accessibility, test-coverage, stitch]
blockedBy: []
blocks: []
created: "2026-07-13T04:57:19.749Z"
createdBy: "ck:plan"
source: skill
---

# Complete COLORS Hex P5 + WCAG + Hook Tests

## Overview

Finalize the Stitch AI dark-fintech redesign migration across 3 dimensions:
1. **P5 Hex Cleanup** — Migrate 46 remaining hardcoded hex values in 6 files to centralized `COLORS` tokens
2. **WCAG Accessibility** — Add landmark roles, skip-to-content links, and aria-labels for screen reader compliance
3. **Hook Test Coverage** — Write Vitest tests for 16 custom hooks in `src/hooks/`

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Phase 1 P5 Hex Cleanup](./phase-01-phase-1-p5-hex-cleanup.md) | Pending |
| 2 | [Phase 2 WCAG Accessibility](./phase-02-phase-2-wcag-accessibility.md) | Pending |
| 3 | [Phase 3 Hook Test Coverage](./phase-03-phase-3-hook-test-coverage.md) | Pending |

## Dependencies

- Built on existing plan `260713-stitch-all-pages-redesign` (P1-P4 hex migration already complete, 93% COLORS adoption)
- No blocking dependencies from other plans

## Acceptance Criteria

- [ ] 0 hardcoded hex values remain in `src/` (verified via grep)
- [ ] All 44 pages have `role="main"` landmark + skip-to-content link
- [ ] All 3 navigation files have `role="navigation"`
- [ ] All interactive elements have `aria-label` or visible label
- [ ] 16 hook files each have matching `*.test.ts` with ≥80% coverage
- [ ] `npx tsc --noEmit` passes with 0 errors
- [ ] `npx vitest run` passes all 273+ existing + new tests
- [ ] No TS6133 unused variable warnings
