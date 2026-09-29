# Project: Multi-Engine Autonomous Desk Runner & Live Execution Daemon (`desk:auto`)

## Architecture
The `desk:auto` runner is the master execution daemon that orchestrates all 4 trading engines continuously:
1. **CLI Layer (`src/desk/commands/`)**:
   - `desk:auto`: Parses, validates (Zod), and launches the autonomous desk daemon with configurable capital, mode (`PAPER`, `SHADOW`, `LIVE`), exchange venues, poll intervals, and metrics port.
   - `desk:status`: Inspects active daemon status, allocations, circuit breaker tier, and recent order activity.
   - Registered in `src/index.ts` via Commander 15.
2. **Feed Multiplexer & Watchdog Layer (`src/desk/feeds/`)**:
   - `MarketDataMultiplexer`: Aggregates top-of-book and order book depth across Binance, Bybit, Polymarket CLOB, and AMMs.
   - `DynamicMidPriceProvider`: Supplies real-time mid prices to `VenueBookAggregator` and `InternalCrossingEngine`.
   - `FeedFreshnessWatchdog`: Dead-man switch monitoring tick timestamps per venue. Trips circuit breaker to `HALT` and executes fail-closed halt if tick latency > 5,000ms or heartbeat fails.
3. **Daemon & Engine Supervisor Layer (`src/desk/daemon/`)**:
   - `EngineSupervisor`: Concurrently launches and supervises 4 trading engines (Arbitrage, MARL Market Making, Prediction Market AMM Liquidity, Alpha-Lab Quant Alphas). Collects and normalizes intents into `UnifiedTradeIntent[]`.
   - `DeskDaemon`: Drives the main tick loop, feeds intents into `UnifiedTradingLoop`, verifies Zero Accounting Drift ($|\delta| < 10^{-4}$ USD), and intercepts OS signals (`SIGINT`, `SIGTERM`, `SIGHUP`) to trigger emergency halt within $\le 100\text{ms}$.
4. **Telemetry & HTTP Status Server Layer (`src/desk/daemon/`, `src/desk/telemetry/`)**:
   - `DeskMetricsRegistry`: Isolated Prometheus registry exposing 8 essential desk metrics.
   - `DeskStatusServer`: Native Node `http` server on `--metrics-port` (default 9100) providing `/health`, `/status`, `/api/desk/allocations`, and `/metrics`.
   - Error responses sanitized with `sanitizeHttpError`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Root CLI `desk:auto` | Register `desk:auto` command in `src/index.ts` with all CLI flags | M1 | ORIGINAL_REQUEST R1.1 |
| 2 | Root CLI `desk:status` | Register `desk:status` command in `src/index.ts` | M1 | ORIGINAL_REQUEST R1.1 |
| 3 | Config Loader & Zod Schema | `DeskAutoConfigSchema` validation in `src/desk/commands/desk-auto.ts` | M1 | ORIGINAL_REQUEST R1.2 |
| 4 | Live Confirmation Prompt | Interactive confirmation prompt before starting in LIVE mode | M1 | AGENTS.md Safe Autonomy |
| 5 | Status Inspector Command | CLI inspection reporting real-time engine states & allocations | M1 | ORIGINAL_REQUEST R1.3 |
| 6 | Multi-Venue Stream Aggregator | Top-of-book & depth stream aggregator across venues | M2 | ORIGINAL_REQUEST R3.1 |
| 7 | Dynamic Mid-Market Price Provider | Supplies mid prices for zero-fee netting & SOR routing | M2 | ORIGINAL_REQUEST R3.2 |
| 8 | Feed Freshness Watchdog | Dead-man switch tripping emergency halt if tick latency > 5,000ms | M2 | ORIGINAL_REQUEST R3.3 |
| 9 | 4-Engine Supervisor | Concurrently supervises Arbitrage, MARL, AMM, Alpha-Lab engines | M3 | ORIGINAL_REQUEST R2.1 |
| 10 | Priority Ingestion & Tick Loop | Main tick poller stepping `UnifiedTradingLoop` | M3 | ORIGINAL_REQUEST R2.2 |
| 11 | Fail-Closed Signal Intercept | Hooks `SIGINT`/`SIGTERM`/`SIGHUP` and triggers emergency halt $\le 100\text{ms}$ | M3 | ORIGINAL_REQUEST R2.3 |
| 12 | Isolated Prometheus Registry | Exports 8 Prometheus gauges/counters via isolated registry | M4 | ORIGINAL_REQUEST R4.2 |
| 13 | HTTP Telemetry Server | Embedded Node `http` server on port 9100 (`/health`, `/status`, `/metrics`) | M4 | ORIGINAL_REQUEST R4.1 |
| 14 | Zero Accounting Drift Invariant | Enforces $\|\delta\| < 10^{-4}$ USD across consolidated portfolio balances | M4 | ORIGINAL_REQUEST R4.3 |
| 15 | 5-Tier E2E Test Suite | Comprehensive unit, integration, boundary, and adversarial tests | M5 | Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | CLI Commands & Config Loader | `src/desk/commands/desk-auto-types.ts`, `desk-auto.ts`, `desk-status.ts`, `src/index.ts` | none | DONE |
| M2 | Feeds & Freshness Watchdog | `src/desk/feeds/feed-freshness-watchdog-types.ts`, `feed-freshness-watchdog.ts`, `market-data-multiplexer-types.ts`, `market-data-multiplexer.ts`, `dynamic-mid-price-provider.ts` | none | DONE |
| M3 | Engine Supervisor & Worker Daemon | `src/desk/daemon/engine-supervisor-types.ts`, `engine-supervisor.ts`, `desk-daemon-types.ts`, `desk-daemon.ts` | M1, M2 | DONE |
| M4 | Telemetry & HTTP Status Server | `src/desk/telemetry/desk-metrics-registry.ts`, `src/desk/daemon/desk-status-server-types.ts`, `desk-status-server.ts` | M1, M3 | DONE |
| M5 | 5-Tier E2E Test Suite & Hardening | `tests/desk/daemon/` (Tiers 1–5: Feature, Boundary, Cross-Engine, Real-World, Adversarial) | M1, M2, M3, M4 | IN_PROGRESS |

## Interface Contracts
### `desk-auto` ↔ `desk-daemon`
```typescript
export interface DeskAutoConfig {
  mode: 'PAPER' | 'SHADOW' | 'LIVE';
  capitalUsd: number;
  dryRun: boolean;
  exchanges: string[];
  symbols: string[];
  pollIntervalMs: number;
  metricsPort: number;
  durationSeconds?: number;
}
```

### `feed-freshness-watchdog` ↔ `unified-trading-loop`
```typescript
export interface FeedWatchdogOptions {
  maxStalenessMs: number; // default 5000
  heartbeatIntervalMs: number; // default 1000
  onFeedStale: (venue: string, latencyMs: number) => void;
}
```

### `engine-supervisor` ↔ `unified-trading-loop`
```typescript
export interface EngineSupervisor {
  start(): Promise<void>;
  pollCycle(): Promise<UnifiedTradeIntent[]>;
  stop(): Promise<void>;
  getEngineStatuses(): Record<string, { status: string; lastSignalTime?: number }>;
}
```

### `desk-status-server` ↔ telemetry consumer
```typescript
// GET /health -> { status: 'ok', uptimeSeconds: number }
// GET /status -> { status: string, mode: string, circuitBreakerTier: string, navUsd: number, engines: ... }
// GET /api/desk/allocations -> { allocatedCapitalUsd: Record<string, number>, unallocatedCashUsd: number, driftUsd: number }
// GET /metrics -> Prometheus text metrics format
```

## Code Layout
All new code must follow modularity rules ($\le 200$ visual LOC per file), zero `:any` types, zero `console.log` (use `@/shared/utils/logger`), and Zod validation on inputs.
- `src/desk/commands/desk-auto-types.ts`: Zod schema and types
- `src/desk/commands/desk-auto.ts`: Command handler for `desk:auto`
- `src/desk/commands/desk-status.ts`: Command handler for `desk:status`
- `src/desk/feeds/feed-freshness-watchdog-types.ts`: Watchdog types & interfaces
- `src/desk/feeds/feed-freshness-watchdog.ts`: Dead-man switch implementation
- `src/desk/feeds/market-data-multiplexer-types.ts`: Stream types & interfaces
- `src/desk/feeds/market-data-multiplexer.ts`: Top-of-book & depth stream aggregator
- `src/desk/feeds/dynamic-mid-price-provider.ts`: Mid-market pricing utility
- `src/desk/daemon/engine-supervisor-types.ts`: Supervisor types & interfaces
- `src/desk/daemon/engine-supervisor.ts`: 4-engine supervisor implementation
- `src/desk/daemon/desk-daemon-types.ts`: Daemon configuration & state types
- `src/desk/daemon/desk-daemon.ts`: Master execution loop & signal handler
- `src/desk/telemetry/desk-metrics-registry.ts`: Isolated Prometheus registry
- `src/desk/daemon/desk-status-server-types.ts`: Server route types & payloads
- `src/desk/daemon/desk-status-server.ts`: Embedded Node HTTP server
- `tests/desk/daemon/`: 5-Tier comprehensive test suite
