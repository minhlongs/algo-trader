---
phase: 1
title: "xAI Dashboard"
status: pending
priority: P2
dependencies: []
---

# Phase 1: xAI Dashboard

## Overview

Polish xAI dashboard with gold design system tokens. Update existing xAI components (counterfactual-viewer, explanation-panel, feature-importance-chart, strategy-rules-viewer) to use gold/purple accent colors.

## Files to modify
- `dashboard/src/pages/xai-dashboard-page.tsx`
- `dashboard/src/components/xai/counterfactual-viewer.tsx`
- `dashboard/src/components/xai/explanation-panel.tsx`
- `dashboard/src/components/xai/feature-importance-chart.tsx`
- `dashboard/src/components/xai/strategy-rules-viewer.tsx`

## Implementation Steps
1. Read each xAI component, check for hardcoded colors
2. Replace any cyan `#00C8E8` or old accent colors with gold `#text-accent`/`#bg-accent` classes
3. Ensure consistent card styling, section headers, badge colors

## Success Criteria
- [ ] All xAI components use gold/purple accent classes
- [ ] `npm run build` passes
