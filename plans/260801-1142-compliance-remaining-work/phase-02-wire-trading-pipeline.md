# Phase 2: Wire emitTradeAuditEvent in Trading Pipeline

**Agent:** fullstack-developer
**Depends on:** Phase 1 not strictly required (different files), but run after for logical flow.

## Files to modify

| File | Change |
|------|--------|
| `src/desk/trading-pipeline.ts` | Add `emitTradeAuditEvent` call for trade_executed and trade_rejected |

## Context

`trading-pipeline.ts` uses `audit.append(...)` from `ImmutableTradeAudit` (file-based append-only log). This satisfies the file-based audit requirement but does NOT invoke `appendTenantAuditLog` (the PostgreSQL-backed immutable chain required by AUD-001). We need to add calls to `emitTradeAuditEvent` at the same decision points.

## Steps

1. Add import at top of `trading-pipeline.ts`:
   ```ts
   import { emitTradeAuditEvent } from '../platform/audit/audit-hooks';
   ```
   (Note: trading-pipeline.ts is in `src/desk/`; the import path `../platform/audit/audit-hooks` resolves to `src/platform/audit/audit-hooks.ts`)

2. In `recordTradeOutcome`, after the drawdown HALT check (line 84–93), before the try block, emit `trade_rejected`:
   ```ts
   if (state.tier === 'HALT' || state.tier === 'HARD_STOP') {
     logger.warn(`[TradingPipeline] Trade blocked...`);
     // Audit the rejection via tenant audit log
     await emitTradeAuditEvent({
       eventType: 'trade_rejected',
       tenantId: walletLabel, // walletLabel serves as tenant identifier
       actionBy: 'system',
       reason: `Drawdown breaker halted: tier=${state.tier}`,
       metadata: {
         drawdownTier: state.tier,
         portfolioValue: newPortfolioValue,
         drawdownPercent: state.drawdownPercent,
       },
     });
     return;
   }
   ```

3. In the try block, after `await wallet.recordTrade(trade, walletLabel)` succeeds (line 98–112), emit `trade_executed`:
   ```ts
   // 3. Audit the trade execution via tenant audit log
   await emitTradeAuditEvent({
     eventType: 'trade_executed',
     tenantId: walletLabel,
     actionBy: 'system',
     reason: `${trade.side} $${trade.sizeUsd} on ${trade.marketId} → PnL $${trade.pnl.toFixed(2)}`,
     metadata: {
       pnl: trade.pnl,
       drawdownTier: state.tier,
       portfolioValue: newPortfolioValue,
       marketId: trade.marketId,
       side: trade.side,
       sizeUsd: trade.sizeUsd,
     },
   });
   ```
   Keep the existing `audit.append('trade_executed', ...)` call (line 101) — that writes to the file-based immutable log. The `emitTradeAuditEvent` call writes to PostgreSQL. Both are required for dual coverage.

## Caveats

- `walletLabel` is used as the `tenantId` — this matches the existing pattern in the ImmutableTradeAudit calls (they use `trade.walletLabel`).
- `emitTradeAuditEvent` is async and may fail. If it fails, the trade has already been recorded in the wallet — we should NOT throw (trade recording succeeded). Wrap in try-catch, log warning on failure.
- The `emitTradeAuditEvent` already handles `params.metadata ?? {}` internally (audit-hooks.ts line 69).
