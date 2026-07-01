# ADR-003: Strategy Ownership Model

**Status:** Accepted  
**Date:** 2026-06-30  
**Deciders:** Mekong Algo Trader architecture team  
**Replaces:** None (new decision -- replaces implicit "everything in one directory" model)

---

## Context

The Algo Trader platform operates 52+ trading strategies across multiple prediction markets (Polymarket, Kalshi, Limitless, PredictIt, Smarkets) and exchange types (CEX, DEX). These strategies fall into several families:

- **Polymarket V2** (30 strategies): Spread mean reversion, delta-neutral volatility arb, Bollinger squeeze, cluster breakout, cross-correlation lag, gap fill, decay rate momentum, event deadline scalper, cycle end sniper, BTC 15-minute pattern detection, whale copy trading, and 19 more.
- **Pre-migration Polymarket** (2 strategies): Legacy strategy format pending migration to `BasePolymarketStrategy` base class.
- **CEX/DEX** (multiple): Cross-exchange arbitrage, triangular arbitrage, funding rate arbitrage.
- **DNA/ML** (1): GRU neural network strategy (Kronos foundation model).
- **Dark-edge** (experimental): Stealth execution strategies.

Subscribers on the platform pay to access these strategies through tiered plans (FREE tier gets basic strategies, ENTERPRISE tier gets all 52+).

The question: who owns the strategies, and how does the platform grant access without duplicating strategy code?

---

## Decision

**Desk owns 100% of strategy implementations. Platform provides tier-gated access via configuration, not code duplication.**

### Ownership

- **Source of truth:** `src/desk/strategies/` -- all strategy classes live here. No strategy code lives in `platform/`.
- **Evolution:** Strategies are developed, backtested, and refined by the desk operator. New strategies are added to `desk/strategies/` and registered in the strategy registry.
- **Base class:** `BasePolymarketStrategy` (303 lines) provides shared position management, exit logic, and event handling for all 32 Polymarket strategies. Concrete strategies extend this base class and are ~150-200 lines each (55% smaller than the pre-base-class versions).

### Platform access model

Platform subscribers access strategies through a **tier-gated configuration layer** without duplicating strategy logic:

```
Platform subscriber request
        │
        ▼
platform/middleware/feature-gate.ts
  ├── requireTier('PRO')        ← checks subscriber's tier
  ├── buildTenantFilter(id)     ← scopes to tenant
        │
        ▼
platform/raas/executor.ts
  ├── imports IStrategy from shared/types/
  ├── resolves strategy class from desk/strategies/ via registry
  ├── instantiates with tenant-scoped config
  └── executes in sandbox (DLP + attestation)
```

**Key principle:** Platform never contains a strategy implementation. It imports strategy classes from `desk/strategies/` through the shared `IStrategy` interface.

### The IStrategy interface

The contract between desk and platform is the `IStrategy` interface in `shared/types/`:

```typescript
// shared/types/strategy-interfaces.ts
export interface IStrategy {
  readonly name: string;
  readonly version: string;
  readonly markets: string[];
  
  evaluate(context: StrategyContext): Promise<StrategySignal | null>;
  getMetadata(): StrategyMetadata;
  validate(): ValidationResult;
}
```

- **Desk side:** Every strategy class implements `IStrategy`. The desk can evolve the interface (add methods, change signatures) as strategies grow more sophisticated.
- **Platform side:** The raas executor only knows about `IStrategy`. It does not import concrete strategy classes directly. It resolves them through a strategy registry that maps strategy names to `IStrategy` constructors.
- **Change control:** Modifying `IStrategy` is a cross-cutting change that requires updating all 52+ strategy classes in desk AND the raas executor in platform. This is intentional -- the interface is the contract, and both sides must stay in sync.

### Tier-gated strategy access

Strategy access is controlled by the `gate/` directory in `desk/`:

```
desk/gate/
├── raas-gate-validators.ts    # Validates subscriber tier against strategy requirements
├── strategy-registry.ts        # Maps strategy names → IStrategy constructors
└── tier-strategy-map.ts        # Which strategies each tier can access
```

This lives in `desk/` (not `platform/`) because strategy access is a desk-side enforcement decision. The platform passes the subscriber's tier to the gate, and the gate decides. The gate reads tier configuration from `shared/config/tiers.ts` -- it never imports from `platform/`.

### Why not put strategies in platform?

Considered and rejected: platform owns strategy copies, with desk as the "research" environment.

**Reasons for rejection:**
- Strategy duplication: every strategy would exist in two places (desk for development, platform for production). Drift between copies is inevitable.
- Ownership confusion: who fixes a strategy bug? The desk operator (who understands the strategy) or the platform team (who owns the production copy)?
- Backtesting friction: strategies developed in platform would need to be backported to desk for backtesting, or backtesting would need tenant-awareness.

### Why not make platform remote-call desk?

Considered and rejected: platform makes HTTP calls to a desk API server for strategy execution.

**Reasons for rejection:**
- Latency: Polymarket arbitrage opportunities have sub-second windows. An HTTP round-trip between platform and desk adds unacceptable latency.
- Complexity: Running and monitoring two separate services for a single trade execution is operational overhead.
- Failure modes: If the desk API is down, all subscriber trades fail. The blast radius is the entire subscriber base.

The current model (same process, shared interface) gives platform direct access to desk strategy classes without network overhead, while the `IStrategy` interface prevents platform from depending on strategy internals.

---

## Consequences

### Positive

- **Single source of truth for strategies.** One place to develop, test, backtest, and debug. No drift between copies.
- **Platform stays thin.** Platform code is about routing, auth, billing, and metering -- not about trading logic. This keeps platform maintainable as the number of strategies grows.
- **Operator velocity.** The desk operator can add a new strategy by creating one file in `desk/strategies/`, implementing `IStrategy`, and registering it. Platform picks it up automatically through the registry.
- **Test isolation.** Strategy tests live in `desk/strategies/__tests__/` and don't need platform infrastructure (auth, tenant, billing).

### Negative

- **IStrategy changes are expensive.** Modifying the interface signature requires touching all 52+ strategy implementations. Mitigation: the interface is intentionally minimal (evaluate, getMetadata, validate). Most strategy evolution happens inside the concrete class, not at the interface level.
- **Desk must not break platform.** If a desk change causes a strategy to throw on instantiation, platform subscribers lose access. Boundary tests verify that all registered strategies can be instantiated through `IStrategy`.
- **The gate/ directory straddles the boundary.** It lives in desk but makes tier-aware decisions -- a platform concern. This is the only place where desk code reasons about tiers, and it does so by reading from `shared/config/` (never from `platform/`).

### Neutral

- As the strategy count grows beyond 100, the strategy registry may need to support lazy loading or code splitting. This is a performance concern, not an architectural concern -- the ownership model does not change.

---

## References

- [ADR-001: Shared Kernel Boundary](./shared-kernel-boundary.md)
- [ADR-002: Desk-Platform Separation](./desk-platform-separation.md)
- [ADR-004: Tenant Isolation Pattern](./tenant-isolation-pattern.md)
- `src/shared/types/strategy-interfaces.ts` -- IStrategy interface definition
- `src/desk/strategies/` -- All 52+ strategy implementations
- `src/desk/gate/` -- RaaS gate validators and strategy registry
- `src/desk/strategies/polymarket/BasePolymarketStrategy.ts` -- Base class for 32 Polymarket strategies
