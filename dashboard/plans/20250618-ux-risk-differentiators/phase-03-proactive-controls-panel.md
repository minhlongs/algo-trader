---
phase: 03
title: Proactive controls panel
status: completed
priority: P1
---

# Phase 03 — Proactive Controls Panel

## Context

Panel allowing users to configure automatic risk mitigation rules: position auto-close thresholds and circuit breaker conditions. Integrated with NegRiskScanner for real-time monitoring.

## Architecture

- Form-based UI using StitchInput, StitchButton
- Two sections: Auto-Close Rules, Circuit Breaker Rules
- Validation (min/max values, dependencies)
- Save to RiskPreferencesStore
- Real-time status indicator showing if rules are active

## Implementation Steps

1. **Create auto-close form** (`src/components/risk/auto-close-form.tsx`):
   - Toggle enable/disable
   - Inputs: profit target %, stop loss %, trailing stop %
   - Validation: profit > stop loss, reasonable ranges (0-100)
   - Save button with loading state
   - <100 lines

2. **Create circuit breaker form** (`src/components/risk/circuit-breaker-form.tsx`):
   - Toggle enable/disable
   - Checkboxes for trigger conditions:
     - Max drawdown threshold (input %)
     - Consecutive losses threshold (input number)
     - Cooldown period (input minutes)
   - Validation: thresholds > 0, cooldown reasonable
   - Save button
   - <100 lines

3. **Create main panel** (`src/components/risk/ProactiveControlsPanel.tsx`):
   - Container with tabs or sections for the two forms
   - Status header showing "Active" / "Inactive" based on preferences
   - Real-time risk metrics display (current drawdown, open positions)
   - Subscribe to RiskPreferencesStore and TradingStore
   - <150 lines

4. **Integrate with neg-risk scanner store**:
   - Add `riskPreferences` slice to `useNegRiskScannerStore` OR reference RiskPreferencesStore directly
   - Add method `checkAutoCloseConditions(position)` called on position updates
   - Add method `checkCircuitBreaker()` called on trade executions
   - Emit events when rules trigger (toast notifications)

5. **Add tests** (`src/components/risk/__tests__/proactive-controls.test.tsx`):
   - Test forms render and validate
   - Test save functionality (store updates)
   - Test form reset/cancel
   - Mock store for isolation

## Files to Create

- `src/components/risk/auto-close-form.tsx`
- `src/components/risk/circuit-breaker-form.tsx`
- `src/components/risk/ProactiveControlsPanel.tsx`
- `src/components/risk/__tests__/proactive-controls.test.tsx`

## Files to Modify

- `src/stores/neg-risk-scanner-store.ts` (add integration hooks)
- `src/pages/neg-risk-dashboard-page.tsx` (embed panel)
- `src/pages/dashboard-page.tsx` (optional embed)

## Success Criteria

- Forms render and collect user input correctly
- Validation prevents invalid configurations
- Preferences saved to store and persist
- Rules can be enabled/disabled
- Integration with neg-risk store triggers notifications on conditions
- Tests cover forms and store logic

## Risk Assessment

- Medium: Rule evaluation performance → debounce checks, only on relevant updates
- Medium: Infinite loops in reactive checks → careful dependency management
- Low: Complexity in circuit breaker logic → keep simple, clear documentation
