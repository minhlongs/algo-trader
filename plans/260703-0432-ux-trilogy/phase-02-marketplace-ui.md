---
phase: 2
title: "Marketplace UI"
status: pending
priority: P2
dependencies: []
---

# Phase 2: Marketplace UI

## Overview

Apply gold design system to marketplace pages. Update strategy listing, subscription cards, detail views.

## Files to modify
- `dashboard/src/pages/marketplace-page.tsx`
- `dashboard/src/pages/strategy-detail-page.tsx`
- `dashboard/src/pages/strategy-performance-page.tsx`
- `dashboard/src/components/marketplace-badge.tsx`
- `dashboard/src/components/subscriber-trade-table.tsx`
- `dashboard/src/components/subscriber-kpi-card.tsx`

## Implementation Steps
1. Read each marketplace component
2. Replace hardcoded old colors with gold/purple token classes
3. Update StitchBadge + StitchCard usage for consistent gold accent
4. Ensure pricing cards, strategy cards, subscription detail all use gold highlights

## Success Criteria
- [ ] Marketplace pages use gold accent consistently
- [ ] `npm run build` passes
