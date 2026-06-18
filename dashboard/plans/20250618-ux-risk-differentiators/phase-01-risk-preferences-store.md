---
phase: 01
title: Risk preferences store (Zustand)
status: completed
priority: P1
---

# Phase 01 — Risk Preferences Store

## Context

Centralized state management for all user risk settings needed across multiple components:
- Auto-close thresholds (per market, global)
- Circuit breaker rules (pause trading after X consecutive losses)
- Alert preferences (channels: toast, email, sound; severity levels)
- Dashboard layout (which widgets visible, positions)
- Confidence score thresholds for trade suggestions

## Architecture

Use Zustand with persist to localStorage for durability. Match existing store patterns in `src/stores/`.

```typescript
interface RiskPreferences {
  // Auto-close
  autoCloseEnabled: boolean;
  maxLossPerTrade: number; // USD
  maxPositionSizePercent: number; // 0-1
  // Circuit breaker
  circuitBreakerEnabled: boolean;
  maxConsecutiveLosses: number;
  // Alerts
  alertChannels: {
    toast: boolean;
    email: boolean;
    sound: boolean;
  };
  minAlertSeverity: 'low' | 'medium' | 'high' | 'critical';
  // Dashboard
  visibleWidgets: string[];
  widgetOrder: string[];
  // Confidence
  minConfidenceToTrade: number; // 0-1
}
```

## Implementation Steps

1. Create `src/stores/risk-preferences-store.ts`
2. Define `RiskPreferences` interface with defaults
3. Implement `useRiskPreferencesStore` with `set`, `reset` actions
4. Add `persist` middleware to sync to `localStorage` key `algo-trader-risk-preferences`
5. Export store and types
6. Write unit tests: `src/stores/__tests__/risk-preferences-store.test.ts`
   - Test default values
   - Test persistence (mock localStorage)
   - Test update actions

## Files to Create

- `src/stores/risk-preferences-store.ts`
- `src/types/risk-preferences.ts`

## Files to Modify

- None (new store)

## Success Criteria

- Store compiles with `pnpm tsc --noEmit`
- Tests pass: `pnpm vitest run src/stores/__tests__/risk-preferences-store.test.ts`
- Store matches existing Zustand pattern (see `src/stores/trading-store.ts` for reference)
- localStorage persistence verified in tests

## Risk Assessment

- Low risk: isolated store, no external contracts
- Mitigation: follow existing store patterns precisely

## Security Considerations

- No sensitive data stored (only UI preferences)
- localStorage safe for this use case
