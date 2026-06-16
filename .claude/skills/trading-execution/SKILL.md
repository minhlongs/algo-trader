---
name: trading-execution
description: "Trading execution for algo-trader. Covers paper trading mode, live trading execution, order routing, fill rate tracking, execution quality metrics. Triggers: execution, paper trading, live trading, order routing, fill rate, TWAP, order executor, dry run, CLOB, Polymarket execution, slippage, order validation"
---

# Trading Execution Skill

## Purpose

Guide trading execution operations: paper trading simulation, live order execution, order routing, fill tracking, and execution quality measurement for algo-trader.

## Codebase Layout

```
src/execution/
  index.ts                    # Barrel export
  order-executor.ts           # Core order execution (arbitrage focus)
  order-validator.ts          # Pre-execution validation
  dry-run-executor.ts         # Paper trading simulation
  twap-executor.ts            # Time-Weighted Average Price execution
  polymarket-adapter.ts       # Polymarket CLOB adapter
  polymarket-signer.ts        # Polymarket order signing
  split-clob-entry.ts         # Split large orders across CLOB
  execution-path-planner.ts   # Optimal execution path planning
  multi-leg-frank-wolfe-optimizer.ts  # Multi-leg optimization
  gas-batch-optimizer.ts      # Gas optimization for on-chain
  on-chain-position-reconciler.ts    # Position reconciliation
  distributed-nonce-manager.ts       # Nonce management
  rollback-handler.ts         # Trade rollback on failure
src/execution/__tests__/
  execution.test.ts
  twap-executor.test.ts
  gas-batch-optimizer.test.ts
  distributed-nonce-manager.test.ts
src/wiring/
  paper-trading-orchestrator.ts  # End-to-end paper trading pipeline
src/polymarket/
  clob-client.ts             # Polymarket CLOB API client
  clob-v2-adapter.ts         # CLOB v2 adapter
  order-manager.ts           # Order lifecycle management
  trading-pipeline.ts        # Polymarket trading pipeline
  real-trade-ledger.ts       # Real trade ledger
  polumarket-fee-calculator.ts # Fee calculation
src/strategies/dna/
  paper-executor.ts          # DNA paper trade executor
```

## Paper Trading Mode (Dry Run)

**Executor:** `src/execution/dry-run-executor.ts`

```typescript
interface DryRunConfig {
  initialBalance: number;      // Starting virtual capital
  slippagePercent: number;     // Simulated slippage (default ~0.1%)
  feePercent: number;          // Simulated fees
  simulateFillRate: number;    // 0-1, probability of fill
}
```

**Paper Account state:**
```typescript
interface PaperAccount {
  balance: number;         // Available cash
  equity: number;          // balance + unrealized PnL
  unrealizedPnl: number;
  realizedPnl: number;
}
```

**Paper Position:**
```typescript
interface PaperPosition {
  symbol: string; side: 'long' | 'short';
  quantity: number; entryPrice: number; currentPrice: number;
  unrealizedPnl: number; openedAt: number;
}
```

**Orchestrator:** `src/wiring/paper-trading-orchestrator.ts`
- Full pipeline: market data → NATS → swarm consensus → AI validation → paper order → P&L → reflection
- Persists to `data/paper-trades.json` + `paper_trades_v3` table
- Source-tagged: `qwen | deepseek | swarm | legacy` for A/B P&L comparison

**DNA Paper Executor:** `src/strategies/dna/paper-executor.ts`
- Executes DNA consensus signals in paper mode
- Writes journal entries for replay

## Live Trading Execution

### Order Executor (src/execution/order-executor.ts)

Core execution flow:
1. Validate opportunity (spread, latency, balance)
2. Place buy order on exchange A (lower price)
3. Place sell order on exchange B (higher price)
4. Track fill status
5. Handle partial fills & rollback

```typescript
interface ExecutionResult {
  id: string; status: 'PENDING' | 'EXECUTING' | 'FILLED' | 'PARTIAL' | 'FAILED' | 'ROLLBACK' | 'CANCELED';
  buyOrder?: OrderResult; sellOrder?: OrderResult;
  profit?: number; error?: string; timestamp: number;
}
```

### Order Validator (src/execution/order-validator.ts)

Pre-execution checks:
- Balance sufficiency
- Position limit compliance
- Price sanity (no negative, no extreme deviation)
- Slippage tolerance

### TWAP Executor (src/execution/twap-executor.ts)

Time-Weighted Average Price execution:
- Splits large orders over time to minimize market impact
- Configurable slice count and interval

### Polymarket Execution

**CLOB Adapter** (`src/execution/polymarket-adapter.ts`):
- Wraps Polymarket CLOB v2 API
- Handles order placement, cancellation, status polling

**Signer** (`src/execution/polymarket-signer.ts`):
- Signs orders with wallet credentials
- Uses `src/wallet/wallet-manager.ts` for key management

**Split CLOB Entry** (`src/execution/split-clob-entry.ts`):
- Splits large orders across multiple price levels
- Reduces market impact and detection

## Execution Quality Metrics

### Fill Rate Tracking
- `fillRate = filledQuantity / requestedQuantity`
- Track per-exchange, per-strategy, per-symbol

### Slippage Measurement
- `slippage = (executedPrice - expectedPrice) / expectedPrice`
- Track average, max, per-exchange

### Latency Tracking
- Order placement latency
- Fill confirmation latency
- End-to-end signal-to-fill latency

### Rollback Handler (src/execution/rollback-handler.ts)
- Automatic rollback on partial fill failure
- Idempotent rollback operations

## Order Routing

**Path Planner** (`src/execution/execution-path-planner.ts`):
- Evaluates multiple execution venues
- Selects optimal path based on: spread, latency, liquidity, fees

**Frank-Wolfe Optimizer** (`src/execution/multi-leg-frank-wolfe-optimizer.ts`):
- Optimizes multi-leg arbitrage execution
- Solves constrained optimization for basket trades

## Mode Switching

**Paper → Live transition:**
1. Verify all paper trades profitable (or acceptable drawdown)
2. Run `npm run deploy:full` with live config
3. Start with minimum position sizes
4. Monitor fill rate and slippage for first 24h
5. Scale up gradually if metrics within tolerance

**Env flag:** `DRY_RUN=true` → paper mode, `DRY_RUN=false` → live mode

## References

- `references/paper-trading-setup.md` — Paper trading configuration and monitoring
- `references/polymarket-clob-execution.md` — Polymarket CLOB execution details
- `references/execution-metrics.md` — Fill rate, slippage, and quality benchmarks
