# Phase 02: Unified Execution Engine

## Context Links
- Plan: [plan.md](./plan.md)
- Existing types: `src/desk/arbitrage/types.ts`
- Existing executors: `executor.ts`, `binary-arbitrage-executor.ts`, `split-merge-arb-executor.ts`

## Overview
- **Priority:** Critical
- **Status:** In Progress
- **Description:** Create a single `UnifiedExecutionEngine` that handles all arbitrage types via strategy routing

## Key Insights
- Current codebase has fragmented executors: `ExecutionEngine` (generic), `BinaryArbitrageExecutor`, `split-merge-arb-executor` (functions)
- Need unified interface: `execute(opportunity: ArbitrageOpportunity): Promise<ExecutionResult>`
- Each strategy has unique config but shares: dry-run, audit logging, risk guards

## Requirements

### Functional
- Route by `opportunity.type`: `cross-exchange`, `triangular`, `dex-cex`, `funding-rate`, `binary-arb`, `settlement-arb`
- Support cross-market ILP basket execution (`cross-market` type)
- Maintain per-strategy config (Kelly fraction, drawdown, slippage, etc.)
- Preserve existing audit logging to `tenant-audit-log`

### Non-Functional
- Zero breaking changes to existing modules
- Type-safe strategy routing
- p95 latency < 500ms target maintained

## Architecture

```
UnifiedExecutionEngine
├── config: UnifiedExecutorConfig
├── executors: Map<ArbType, StrategyExecutor>
├── execute(opportunity) -> routes to correct executor
└── getMetrics() -> aggregated metrics
```

### StrategyExecutor Interface
```typescript
interface StrategyExecutor {
  execute(opp: ArbitrageOpportunity): Promise<ExecutionResult>;
  validate(opp: ArbitrageOpportunity): boolean;
  getMetrics(): StrategyMetrics;
}
```

## Related Code Files

### Modify
- `src/desk/arbitrage/types.ts` — Add `UnifiedExecutorConfig`, `StrategyExecutor` interface
- `src/desk/arbitrage/executor.ts` — Refactor to implement `StrategyExecutor` for cross-exchange/triangular/dex-cex/funding-rate

### Create
- `src/desk/arbitrage/unified-executor.ts` — Main unified engine
- `src/desk/arbitrage/strategy-router.ts` — Routing logic
- `src/desk/arbitrage/__tests__/unified-executor.test.ts` — Unit tests

## Implementation Steps

1. **Extend types.ts**
   - Add `UnifiedExecutorConfig` combining all strategy configs
   - Add `StrategyExecutor` interface
   - Add `StrategyMetrics` type

2. **Refactor executor.ts**
   - Implement `StrategyExecutor` interface
   - Handle: `cross-exchange`, `triangular`, `dex-cex`, `funding-rate`

3. **Create unified-executor.ts**
   - Compose all strategy executors
   - Route by `opportunity.type`
   - Aggregate metrics

4. **Create strategy-router.ts**
   - Type-safe routing logic
   - Default executor fallback

5. **Write tests**
   - Test routing for each type
   - Test dry-run / live modes
   - Test error handling

## Todo List
- [ ] Extend types.ts with unified config
- [ ] Refactor executor.ts to implement StrategyExecutor
- [ ] Create unified-executor.ts
- [ ] Create strategy-router.ts
- [ ] Write unified-executor.test.ts
- [ ] Run tests: `npm test -- unified-executor`

## Success Criteria
- All existing arbitrage tests pass
- New unified executor tests pass
- TypeScript compiles with 0 errors
- Dry-run mode works for all strategy types

## Risk Assessment
- **Breaking changes:** Mitigated by keeping existing classes, adding interface layer
- **Config bloat:** Mitigated by sensible defaults, optional overrides
- **Routing errors:** Mitigated by exhaustive type checking, default fallback

## Next Steps
→ Phase 03: Strategy Orchestrator