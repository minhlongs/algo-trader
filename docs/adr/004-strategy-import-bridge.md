# ADR 004: Strategy Import Bridge (Desk ↔ Platform)

**Date:** 2026-06-30  
**Status:** Accepted  
**Deciders:** Solo operator

## Context

Platform subscribers need access to desk strategies (52+ strategies: polymarket, cex, dex, DNA neural net). But:

- `desk/` must not import from `platform/` (boundary rule)
- `platform/` may import from `desk/` (allowed direction)
- Desk strategies are operator-owned — platform subscribers access them via tier-gated config, not by modifying desk code

We needed a bridge that lets platform code use desk strategies without:
1. Adding tenant awareness to desk code
2. Creating a network/RPC bridge (overkill for same-process)
3. Duplicating strategy logic

## Decision

**Direct import through shared `IStrategy` interface:**

```typescript
// shared/types/strategy.ts
export interface IStrategy {
  name: string;
  analyze(context: StrategyContext): Promise<StrategySignal>;
  configure(config: StrategyConfig): void;
}

// desk/strategies/polymarket/momentum-strategy.ts
export class MomentumStrategy implements IStrategy { ... }

// platform/raas/subscriber-executor.ts
import { MomentumStrategy } from '../../../desk/strategies/polymarket/momentum-strategy';
// Platform wraps desk strategy with tenant context:
async function executeForTenant(tenantId: string, market: string) {
  const tier = await getUserTier(tenantId);
  const config = TIER_CONFIG[tier].strategyConfig;
  const strategy = new MomentumStrategy();
  strategy.configure(config);
  return strategy.analyze({ market, tenantId });
}
```

**Key constraint:** Platform code provides tenant context (tier config, allocation limits). Desk strategy receives only neutral parameters (market, timeframe, risk tolerance) — never `tenantId`.

## Consequences

### Positive
- Zero latency (direct import, no network call)
- Desk code stays clean — no auth, no tenant, no tier awareness
- Platform controls access: tier-gated config, rate limiting, metering
- Type-safe through shared `IStrategy` interface

### Negative
- Same-process coupling (strategy crash affects platform)
- No isolation between subscriber executions (same Node.js process)
- Requires discipline to keep tenant logic out of desk strategies

## Alternatives Considered

| Approach | Rejected Because |
|----------|-----------------|
| gRPC bridge | Added latency, serialization overhead for same-machine access |
| Separate strategy service | Overkill for solo operator, adds deployment complexity |
| Copy strategy code into platform | Violates DRY, diverges over time |
| Subprocess per strategy | Too heavy for 52+ strategies |
