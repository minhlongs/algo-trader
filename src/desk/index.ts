/**
 * Desk — Solo Proprietary Trading Context
 *
 * Operator-only modules. No tenant awareness, no tier gating, no auth.
 * All desk modules operate on the trader's own capital and accounts.
 *
 * Architecture rule: desk/ MUST NOT import from platform/.
 * Communication with platform happens only through shared/ types.
 *
 * Path alias: `@desk/*` → `src/desk/*`
 *
 * Key modules:
 *   strategies/    52+ strategies (polymarket V2, CEX, DEX, DNA/GRU, dark-edge)
 *   execution/     Polymarket CLOB adapter, order management
 *   risk/          Kelly criterion, drawdown protection, circuit breaker
 *   signal/        Signal pipeline: fusion, TTL, dedup, publishing
 *   intelligence/  Alpha-ear client, LLM router, market intelligence
 *   market-data/   Provider failover, gap detection, SLA tracking
 *   wiring/        Strategy orchestration, paper trading, NATS event loop
 *   feeds/         Price feeds (Kalshi, Polymarket, CEX)
 *   cli/           Commander.js CLI — algo scan, status, risk
 *   arbitrage/     Split-merge arb, cross-platform basis
 *   gate/          RaaS gate validators, tier config (desk-side enforcement)
 *   sandbox/       Tenant isolation for paper trading simulation
 */

// Strategy barrel (most cross-referenced module)
export * from './strategies/polymarket/index';

// Execution
export * from './execution/index';

// Risk
export * from './risk/index';

// Signal pipeline
export * from './signal/index';

// Market data feeds — NB: not re-exported due to PolymarketOrderBook ambiguity with execution/
// Use `import { ... } from '@desk/feeds'` directly

// Arbitrage
export * from './arbitrage/index';

// RaaS gate config
export * from './gate/config/index';

// Backtesting
export * from './backtesting/index';

// Sandbox
export * from './sandbox/index';
