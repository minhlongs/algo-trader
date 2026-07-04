# Trading Execution Pipeline — Codebase Audit

**Report Date:** 2026-05-21 | **Work Context:** `/Users/macbook/algo-trader`

---

## 1. CLI Entrypoint Flow

**File:** `src/index.ts:40-143` | **Confidence:** High

CLI initialized via Commander.js. Five commands wire into trading pipeline:

- **`gru`** → `src/commands/gru-strategy.ts:runGruStrategy()` → `GruStrategy` class (backtest/live modes)
- **`quickstart`** → `src/commands/quickstart.ts:runQuickstart()` → dry-run or live engine setup
- **`arb:auto`** → `src/commands/arb-auto.ts:runArbAuto()` → `TradingLoop` orchestrator
- **`activate`** → License key management
- **`kronos`** → `KronosStrategy` (Foundation Model)

**Key Pipeline Entry:** GRU and ARB:AUTO create strategy instances, call `initialize()` → `train()/execute()` → signals published.

---

## 2. API Entrypoint Flow

**File:** `src/app.ts` + `src/api/server.ts:104-163` | **Confidence:** High

ApiServer (Express) registers 11 route groups:

| Route | Purpose | Read/Write |
|-------|---------|-----------|
| `/api/trades` | Trade history + PnL | Both |
| `/api/signals` | Signal feed queries | Read |
| `/api/pnl` | P&L aggregates | Read |
| `/api/admin` | Risk control (kill switches) | Write |
| `/api/v1/signals` | HMAC-authenticated signal ingest (Qwen daemon) | Write |
| `/api/v1/admin/qwen` | L1/L2 Qwen rollback | Write |
| `/api/webhooks/nowpayments` | Payment callbacks | Write |
| `/api/coupons`, `/api/blog`, `/api/analytics`, `/api/revenue` | Subscription/billing | Read/Write |
| `/api/auth` | Better Auth (sign-up, session) | Write |

**Trading Routes:** Only `/api/v1/signals` and `/api/admin` directly touch trading state. All others are read-only or billing.

---

## 3. Trading Pipeline Composition

**File:** `src/trading-pipeline.ts:1-103` | **Confidence:** High

Factory function `createTradingPipeline()` wires 5 go-live modules into immutable interface:

```
TradingPipeline {
  kelly: KellyPositionSizer,         // Risk sizing
  drawdown: TieredDrawdownBreaker,   // Portfolio circuit breaker
  twap: TwapExecutor,                // Order slicing
  wallet: WalletManager,             // Fund isolation
  audit: ImmutableTradeAudit,        // Immutable log
  recordTradeOutcome()               // Single orchestration point
}
```

### 3.1 Kelly Position Sizer
**File:** `src/risk/kelly-position-sizer.ts:1-80` | **Confidence:** High

Interface: `KellySizingInput` {winProbability, winLossRatio, portfolioValue} → `KellySizingResult`

- Formula: `f* = (bp - q) / b` (Kelly criterion)
- Managed capital capped at quarter-Kelly (0.25) **always**, regardless of config
- Max position hard-capped at 5% of portfolio
- Negative Kelly returns zero (no edge = don't trade)

**Key:** Sizing is DETERMINISTIC — no state mutation. Pure function.

### 3.2 Tiered Drawdown Breaker
**File:** `src/risk/tiered-drawdown-breaker.ts:1-80` | **Confidence:** High

Interface: `TieredDrawdownState` {highWaterMark, drawdownPercent, tier, sizingMultiplier}

6-tier system from high-water mark:
- **NORMAL** (0–5%): No restriction
- **ALERT** (5%): Reduce position sizing by 25%
- **REDUCE** (10%): Halve new positions, liquidate bottom 25%
- **HALT** (15%): Stop new trades 48h, close 50% of portfolio
- **HARD_STOP** (20%): Close everything, require manual restart
- **DAILY_PAUSE**: Single-day loss >3% → pause 24h

State persisted to `~/.cashclaw/drawdown-state.json`.

### 3.3 TWAP Executor
**File:** `src/execution/twap-executor.ts:1-80` | **Confidence:** High

Interface: `TwapOrder` {marketId, side, totalSizeUsd} → `TwapResult`

For orders >$500 USD (configurable):
- Splits into $500–$2K chunks (default)
- Delays between chunks: 30s default
- Aborts if: slippage >2%, 3 consecutive failures, chunk times out, orderbook depth insufficient
- **Callback pattern:** `ExecuteChunkFn` injected (not hardcoded to exchange)

### 3.4 Wallet Manager
**File:** `src/wallet/wallet-manager.ts:1-80` | **Confidence:** High

Interface: `Wallet` {address, label, capitalAllocation, currentBalance, isolatedPnl}

Multi-wallet isolation:
- **own-capital** wallet: operator's money
- **managed-{name}** wallets: client accounts (strict fund isolation)
- Trade recording: `recordTrade(trade, walletLabel)` → updates balance & PnL by wallet
- State persisted to `~/.cashclaw/wallets.json`

### 3.5 Immutable Trade Audit
**File:** `src/audit/immutable-trade-audit.ts:1-80` | **Confidence:** High

Interface: `TradeAuditEntry` {id, sequenceNumber, eventType, hash, previousHash}

- JSONL append-only log: `~/.cashclaw/audit-log.jsonl`
- 8 event types: trade_decision, trade_executed, trade_rejected, circuit_breaker, drawdown_tier_change, kelly_sizing, twap_chunk, wallet_trade
- SHA-256 hash chain for tamper detection
- Sequence counter restored from disk on load (survives PM2 restart)

---

## 4. Execution Layer

**Files in `src/execution/`** | **Confidence:** High

| File | Purpose |
|------|---------|
| `twap-executor.ts` | Large order slicing (see 3.3) |
| `order-executor.ts` | Atomic arbitrage trade (mock: buy A + sell B) |
| `order-validator.ts` | Pre-trade checks (spread, position, daily limits) |
| `dry-run-executor.ts` | Paper trading without real orders |
| `execution-path-planner.ts` | Multi-leg order sequencing |
| `polymarket-adapter.ts` | Polymarket CLOB integration |
| `polymarket-signer.ts` | Gamma protocol signing |
| `on-chain-position-reconciler.ts` | Polygon state verification |
| `gas-batch-optimizer.ts` | TX batching for gas efficiency |
| `distributed-nonce-manager.ts` | Nonce safety across nodes |
| `multi-leg-frank-wolfe-optimizer.ts` | Portfolio rebalancing solver |
| `split-clob-entry.ts` | CLOB order fragmentation |
| `rollback-handler.ts` | Atomic rollback on failure |

**Key observation:** Execution is modular. `order-executor.ts` shows interface-driven design (callbacks for `placeOrder`, `getDepth`, `getPrice`). No tight coupling to exchange.

---

## 5. Strategy Layer

**Base Strategies** (`src/strategies/`):
- `GruStrategy.ts` (GRU neural network — backtest/live)
- `KronosStrategy.ts` (Foundation Model wrapper)
- `probability-calibrator.ts` (Confidence → win/loss ratio)

**Polymarket Strategies** (`src/strategies/polymarket/` — 30+ files):
- Book imbalance, VWAP sniper, pairs stat arb, vol sniper, orderbook depth ratio
- Cross-event drift, vol compression, whale tracker, resolution frontrunner
- Multi-leg hedge, regime-adaptive momentum, liquidation cascade
- Order flow toxicity, gamma scalping, funding rate arb, theta decay
- Microstructure alpha, sentiment momentum, smart money divergence
- Volatility surface arb, news catalyst fade, inventory rebalancing
- Kalman filter, liquidity vacuum, TWAP accumulator, correlation breakdown
- Entropy scoring, adverse selection filter

**Strategy Orchestration:** `src/wiring/strategy-wiring.ts:70-100` wires all 30+ via data-driven array. Each strategy exports `createXxxTick()` factory returning `async () => Promise<void>` tick function.

---

## 6. Signal → Trade Flow (Traced)

**File Map:**

```
src/strategies/xxx.ts (generate signal)
    ↓
src/signal/signal-publisher.ts:43-96
    ├─ signal-dedup-guard: check if duplicate in TTL bucket
    ├─ signal-store.saveSignal(): persist to DB (D1)
    ├─ signal-ttl-enforcer: register in live cache
    ├─ sseBroadcaster.broadcast(): real-time for ENTERPRISE subscribers
    ├─ telegramSignalPusher.enqueue(): push to Telegram per subscription
    └─ invalidateSignalCache(): warm REST /api/signals cache
    ↓
src/api/routes/signals.ts (GET /api/signals)
    ↓
src/api/routes/signal-ingest-routes.ts (POST /api/v1/signals with HMAC)
    ↓ [if confidence > threshold AND drawdown NOT halted]
    ↓
src/wiring/paper-trading-orchestrator.ts:51-72 (savePaperTradeV3)
    ├─ Run swarmConsensus() for multi-AI approval
    ├─ validateSignal() for validation
    ├─ reflectOnTrade() for strategy improvement
    └─ INSERT into paper_trades_v3 (source='qwen' → NEVER live)
```

**Critical:** Qwen-generated signals go to paper_trades_v3 with `source='qwen'` and are **NEVER routed to live execution** (src/wiring/paper-trading-orchestrator.ts:4 comment).

---

## 7. Arbitrage Trading Loop (ARB:AUTO)

**File:** `src/arbitrage/trading-loop.ts:1-120` | **Confidence:** High

End-to-end orchestration:

```
WebSocket Feeds (Binance, OKX, Bybit)
    ↓ [FeedAggregator]
    ↓
SpreadDetector.scan() [~50ms latency target, p95 <500ms]
    ├─ Redis price cache
    ├─ ML scoring model (createDefaultScoringModel)
    ├─ Fee + slippage calculation
    ├─ Latency-aware filtering
    └─ emit('opportunity', {id, symbol, buyEx, sellEx, spread, score})
    ↓
ExecutionEngine.execute(opportunity)
    ├─ OrderValidator.validate() [checks spread, position, daily limits]
    ├─ OrderExecutor.execute()
    │   ├─ placeOrder(buyExchange, BUY, price)
    │   ├─ placeOrder(sellExchange, SELL, price)
    │   ├─ Track fill status
    │   └─ Calculate profit
    └─ emit('execution', {result: {success, actualProfit, error}})
    ↓
TradingLoop.recordTradeOutcome()
    ├─ wallet.recordTrade(trade, label)
    ├─ drawdown.update(newValue)
    └─ audit.append('trade_executed', ...)
```

**Dry-Run Mode:** Same logic, but `OrderExecutor` in dry-run assumes 100% fills (no real exchange calls).

---

## 8. Wiring & Composition

**File:** `src/wiring/` | **Confidence:** Medium

- **`strategy-wiring.ts`:** Data-driven array of 30+ strategies. Each exports factory function. `StrategyOrchestrator` registers tick functions at configurable intervals.
- **`paper-trading-orchestrator.ts`:** End-to-end pipeline for Qwen M1 Max daemon. Signals → swarm consensus → AI validation → paper_trades_v3 (source-tagged, never live).
- **`nats-event-loop.ts`:** NATS message bus integration for event-driven updates (optional, if NATS_URL set).
- **`qwen-drawdown-monitor.ts`:** AI-gated trading eligibility (kill switch).
- **`qwen-live-eligibility-gate.ts`:** Additional gate for live execution (currently all Qwen routed to paper).
- **`vibe-controller.ts`:** State management for Vibe platform.
- **`augmented-signal-pipeline.ts`:** Signal enhancement (likely for multimodal inputs).

---

## 9. Hidden Coupling & Issues

### Issue 1: Signal Store Interface (Loose Coupling ✓)
**Location:** `src/signal/signal-publisher.ts:26-30`

```typescript
export interface SignalStore {
  saveSignal(signal: Signal): Promise<void>;
  getSubscriptions(): Promise<SignalSubscription[]>;
}
```

Good: Publisher doesn't import postgres-client directly. **BUT** in `src/api/server.ts:28`, `signalStoreD1` is hardcoded instance. If SignalStore API changes, ALL callers break.

**Confidence:** Medium

### Issue 2: Wallet Label Hardcoding
**Location:** `src/trading-pipeline.ts:47` + `src/wallet/wallet-manager.ts:11`

```typescript
export type WalletLabel = 'own-capital' | `managed-${string}`;
```

This enforces string literal union, but everywhere code assumes `walletLabel` is always present on `WalletTrade`. **If** a trade happens without wallet association, audit passes but wallet state diverges.

**Confidence:** Medium

### Issue 3: Drawdown State Persistence Async
**Location:** `src/risk/tiered-drawdown-breaker.ts` (inferred from line 15 writeJsonState import)

Drawdown state written to disk (lines 81+), but if PM2 restarts mid-write, state could be corrupt or stale. No transactional guarantee.

**Confidence:** Medium

### Issue 4: Kelly Criterion Input Validation
**Location:** `src/risk/kelly-position-sizer.ts:68-80`

If `winProbability` or `winLossRatio` NaN, function returns zero position. **Silent failure** — no error thrown, just logged at debug level. Caller might not notice bad input.

**Confidence:** High

### Issue 5: Qwen Routing Not Enforced at Type Level
**Location:** `src/wiring/paper-trading-orchestrator.ts:39-44`

```typescript
function deriveSource(strategy: string): string {
  if (strategy.startsWith('qwen')) return 'qwen';
  ...
}
```

This is **string matching**. A strategy named "qwen_live_alt" would be routed to paper. Enforcement is by convention, not type system.

**Confidence:** High

---

## 10. Open Questions

1. **Order Executor Hardcoding:** `src/execution/order-executor.ts:130-151` is a mock returning 100% fills. Where is the REAL exchange API integration? Is it injected at instantiation or does the code path differ for live?

2. **Kelly & Drawdown Coordination:** If Kelly says size=$1000 but drawdown is at ALERT tier (25% reduction), which takes precedence? Code shows independent modules. Is the reduction applied by the caller?

3. **Arbitrage Signal → Pipeline:** `arb-auto` command uses `TradingLoop` → `ExecutionEngine` directly. Does this route through the risk pipeline (Kelly + Drawdown + Audit)? Or is it separate?

4. **TWAP Chunk Execution Callback:** `src/execution/twap-executor.ts:66-72` defines `ExecuteChunkFn` callback, but where is it instantiated? Which module provides the real implementation?

5. **Signal Subscription Tiers:** `src/signal/signal-types.ts:32-48` defines FREE/PRO/ENTERPRISE delivery configs. But how does `/api/signals` route check the user's tier? Is auth enforced?

6. **Polymarket CLOB vs CEX:** 30+ polymarket strategies import `GammaClient`, `ClobClient`, `OrderManager`. But `arb-auto` uses CEX only (Binance, OKX, Bybit). Are they separate execution paths?

7. **PM2 Restart Safety:** Trading state (Kelly, Drawdown, Wallets, Audit) all persisted to `~/.cashclaw/`. On restart, are they all reloaded consistently? What if a trade was mid-execution?

---

## 11. Confidence Summary

| Component | Confidence | Notes |
|-----------|-----------|-------|
| CLI entrypoint | High | Commander.js wiring clear |
| API routes | High | Express setup well-documented |
| Trading pipeline | High | `createTradingPipeline` explicit |
| Risk (Kelly + Drawdown) | High | Logic clear, edge cases identified |
| Execution (TWAP) | Medium | Callbacks injected, but real impl location unclear |
| Signals | High | Publisher flow traced end-to-end |
| Arbitrage loop | High | TradingLoop orchestration clear |
| Strategy wiring | Medium | Data-driven, but NATS integration optional/undocumented |
| Qwen routing | Medium | String-based source derivation, not type-safe |
| Wallet isolation | Medium | Persistent state, but no transactional guarantee |

---

## Summary

**Total Lines of Code Traced:** 2,000+ | **Modules Analyzed:** 40+ | **Date:** 2026-05-21

The trading pipeline is **modular and interface-driven**, but **lacks type-safety enforcement** in a few critical paths (Qwen routing, wallet labels). Execution is abstracted (callbacks), but the real exchange API implementation location is unclear. State persistence survives PM2 restarts, but without transactional guarantees.

**Key Strength:** 5-module composition (Kelly + Drawdown + TWAP + Wallet + Audit) is orthogonal. Each owns a single concern.

**Key Risk:** Silent failures (Kelly with bad input, Drawdown disk writes) and string-based routing decisions instead of types.

