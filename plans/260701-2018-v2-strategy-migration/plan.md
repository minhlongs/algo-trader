# Phase: V2 Strategy Migration — Complete BasePolymarketStrategy Adoption

**Status: superseded — work completed under larger plans
**Priority:** High — architectural consistency + code reduction

## Overview

31/39 polymarket strategies use BasePolymarketStrategy. 8 remaining — but 3 are helpers/types, 2 are already V2. **5 real migration targets:**

| Strategy | Lines | Pattern | Value |
|----------|-------|---------|-------|
| `multi-leg-hedge` | 452 | createXxxTick factory | High — largest file, most duplicated code |
| `inventory-skew-rebalancer` | 370 | createXxxTick factory | High — portfolio-level strategy |
| `whale-copy-trader` | 194 | Class (EventEmitter) | Medium — monitoring service |
| `delta-neutral-volatility-arbitrage` | 152 | Class (EventEmitter) | Medium — straightforward |
| `delta-neutral-portfolio-monitor` | 143 | Class | Low — monitoring, may not fit pattern |

## Approach

Each migration: Extend BasePolymarketStrategy → move entry logic to scanEntries() → delete hand-rolled position mgmt, exit checks, event emission → export class with toTickFn().

## Files

- `src/desk/strategies/polymarket/base-polymarket-strategy.ts` (read-only reference)
- 5 strategy files to migrate (in-place refactor, NOT new files)

## Success

- 0 TypeScript errors
- All existing tests pass
- Migrated strategies: 50%+ line reduction
