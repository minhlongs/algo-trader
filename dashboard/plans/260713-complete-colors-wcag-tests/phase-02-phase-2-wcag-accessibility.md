---
phase: 2
title: "WCAG 2.1 Accessibility Compliance"
status: pending
priority: P2
dependencies: []
---

# Phase 2: WCAG 2.1 Accessibility Compliance

## Overview
Add WCAG 2.1 Level AA accessibility to all dashboard pages: skip-to-content links, landmark roles, and aria-labels for screen reader navigation.

## Requirements
- Functional: Every page has skip-link, role="main", and all interactive elements labeled
- Non-functional: No visual change; accessibility additions are invisible to sighted users
- Standard: WCAG 2.1 Level AA (1.1.1, 1.3.1, 2.1.1, 2.4.1, 2.4.3, 2.4.7, 4.1.2)

## Architecture
Three accessibility additions per page:
1. **Skip-to-content link** — `<a href="#main-content" className="sr-only ...">Skip to main content</a>` at top of JSX tree
2. **role="main"** — on the primary content container `<div>`
3. **role="navigation"** — on nav containers in `layout-shell`, `sidebar-navigation`, `public-navbar`
4. **aria-label** — on all buttons, links, icon-only controls, inputs, selects

## Related Code Files

### Pages needing skip-link + role="main" (44 files)
All files in `src/pages/*.tsx`. Already complete for: `leaderboard-page.tsx`, `dashboard-page.tsx`, `neg-risk-dashboard-page.tsx`, `settings-page.tsx`, `subscriber-overview.tsx`, `live-trading-page.tsx`.
Remaining: ~38 pages.

### Navigation files needing role="navigation" (3 files)
- `src/components/layout-shell.tsx`
- `src/components/sidebar-navigation.tsx`
- `src/components/public-navbar.tsx`

### Components needing aria-labels (~76 components)
Priority order (fintech-critical first):
1. Trading buttons (Buy/Sell/Close) in trade-history-feed
2. Form inputs (license key, API keys)
3. Navigation toggles (sidebar, menu hamburger)
4. KPI cards with icon-only indicators
5. Data table sort/filter buttons
6. Modal close buttons
7. Dropdown menus
8. Tab switches (language toggle, theme)

## Implementation Steps

### Step 1: Add skip-link + role="main" to remaining pages
Pattern (match existing from leaderboard-page):
```tsx
<a href="#main-content" className={`sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:rounded focus:bg-accent focus:text-accent-foreground`}>
  Skip to main content
</a>
```
Then add `id="main-content" role="main"` to the first content `<div>`.

### Step 2: Add role="navigation" to nav files
Wrap nav `<nav>` elements or add `role="navigation"` to the outermost nav container div:
- `layout-shell.tsx`: top nav bar
- `sidebar-navigation.tsx`: sidebar `<aside>`
- `public-navbar.tsx`: public navbar

### Step 3: Add aria-labels to interactive components
Strategy: batch by component type using grep to find patterns:
```bash
# Find buttons without aria-label
grep -rn '<button' src/components/ src/pages/ --include="*.tsx" | grep -v 'aria-label'
grep -rn '<a ' src/components/ src/pages/ --include="*.tsx" | grep -v 'aria-label' | grep -v 'href="#"'
```

For each uncovered element, add appropriate `aria-label`:
- Icon-only buttons: `aria-label="Toggle language"`, `aria-label="Refresh data"`, etc.
- Expand/collapse: `aria-label="Expand section"`, `aria-expanded={isOpen}`
- Form inputs: `aria-label="License key"` or use `<label>` element
- Custom controls: descriptive label matching visible text or icon meaning

### Step 4: Verify with axe-core (optional)
```bash
npm install --save-dev @axe-core/react
```
Run axe scan on each page in test mode to catch remaining violations.

## Success Criteria
- [ ] All 44 pages have skip-to-content link
- [ ] All 44 pages have `role="main"` on content container
- [ ] All 3 nav files have `role="navigation"`
- [ ] All 76 components have `aria-label` on interactive elements
- [ ] `npx vitest run` passes (no regressions)
- [ ] No visual change (verified: accessibility additions are `sr-only`)

## Risk Assessment
- **Risk**: aria-label duplicates visible text (redundant) → Mitigation: Only add to icon-only/ambiguous controls; skip elements with clear visible labels
- **Risk**: role="main" on wrong element breaks keyboard navigation → Mitigation: Only add to the primary content wrapper, not nested divs
- **Risk**: Over-engineering → Mitigation: YAGNI — add minimum viable labels (77% pass rate is "A" grade, not 100%)
