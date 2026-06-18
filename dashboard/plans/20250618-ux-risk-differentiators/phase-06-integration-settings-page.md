---
phase: 06
title: Integration & settings page
status: completed
priority: P1
---

# Phase 06 — Integration & Settings Page

## Context

Integrate all new components into existing pages, add dedicated risk settings page, update navigation, and ensure cohesive user experience.

## Architecture

- Risk settings page: `/app/risk-settings` with all preferences in one place
- Dashboard embedding: risk widgets on main dashboard
- Neg-risk page enhancements: embed visualization and aids
- Sidebar navigation updates
- Responsive layout (mobile/desktop)

## Implementation Steps

1. **Create Risk Settings Page** (`src/pages/risk-settings-page.tsx`):
   - Use LayoutShell wrapper (consistent with other /app pages)
   - Tabs or accordion sections:
     - Risk Limits (forms from ProactiveControlsPanel)
     - Notification Preferences
     - Alert Rules (circuit breaker)
   - Save all at once or per-section with feedback
   - Reset to defaults button
   - <200 lines

2. **Add route** (`src/App.tsx`):
   ```tsx
   <Route path="/app/risk-settings" element={<AuthGuard><LayoutShell><RiskSettingsPage /></LayoutShell></AuthGuard>} />
   ```

3. **Update sidebar navigation**:
   - Add "Risk Management" or "Risk Settings" link pointing to `/app/risk-settings`
   - Position appropriately (maybe under Settings or separate section)

4. **Embed into Dashboard** (`src/pages/dashboard-page.tsx`):
   - Add RiskGauge showing current portfolio risk score (calculate from positions)
   - Optionally add mini ExposureHeatmap (top symbols only)
   - Place in prominent position (top section after stats cards)
   - Use StitchCard wrapper

5. **Enhance Neg-Risk Page** (`src/pages/neg-risk-dashboard-page.tsx`):
   - Add ProactiveControlsPanel to sidebar (below threshold slider) or as collapsible section
   - Add DecisionAidsPanel to main content (right column or below table)
   - Ensure responsive layout doesn't break

6. **Export stores** (`src/stores/index.ts`):
   - Add `export { useRiskPreferencesStore } from './risk-preferences-store'`
   - Keep consistency with other store exports

7. **Final verification**:
   - Run TypeScript compiler: `pnpm tsc --noEmit`
   - Run tests: `pnpm vitest run`
   - Build: `pnpm build`
   - Manual smoke test: navigate to all affected pages

## Files to Create

- `src/pages/risk-settings-page.tsx`
- `src/components/risk/RiskSettingsPanel.tsx` (wrapper combining all forms, optional)

## Files to Modify

- `src/App.tsx` (add route and potentially ToastContainer)
- `src/pages/dashboard-page.tsx` (embed risk visualizations)
- `src/pages/neg-risk-dashboard-page.tsx` (embed controls and aids panels)
- `src/components/layout-shell.tsx` or sidebar component (add navigation link)
- `src/stores/index.ts` (export new store)

## Success Criteria

- Risk settings page loads and all forms work
- Navigation link appears and routes correctly
- Dashboard shows risk visualizations without layout shift
- Neg-risk page enhanced with controls and aids, still usable
- All integrations respect existing auth and layout contracts
- No console errors or test failures

## Risk Assessment

- High: Layout breakage on small screens → test responsive, use Tailwind responsive classes
- Medium: Performance degradation from many visualizations → lazy load heavy components, memoize calculations
- Low: Navigation confusion → clear labeling, maybe tooltips, user testing

## Cross-Cutting Verification

After full integration:
- TypeScript: `pnpm tsc --noEmit` passes
- Tests: `pnpm vitest run` passes (target >80% coverage on new code)
- Build: `pnpm build` succeeds
- Manual QA: all routes accessible, no console errors
- Responsive: test at 320px, 768px, 1024px widths
