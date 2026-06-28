# Strategy Development Guide: From Hello World to Production

A comprehensive, hands-on tutorial for developing trading strategies in algo-trader. Follow these modules sequentially to build your skills from beginner to production-ready.

---

## Table of Contents

1. [Module 1: Your First Strategy](#module-1-hello-world)
2. [Module 2: Understanding the Architecture](#module-2-architecture)
3. [Module 3: Technical Indicators](#module-3-technical-indicators)
4. [Module 4: Signal Generation](#module-4-signal-generation)
5. [Module 5: Testing & Validation](#module-5-testing)
6. [Module 6: Risk Management](#module-6-risk-management)
7. [Module 7: Backtesting](#module-7-backtesting)
8. [Module 8: Paper Trading](#module-8-paper-trading)
9. [Module 9: Deployment & Monitoring](#module-9-deployment)
10. [Module 10: Production Considerations](#module-10-production)

---

## Module 1: Hello World

### Objective

Create a minimal strategy that implements the required interface and returns signals.

### What You'll Build

A "Hello World" strategy that always returns "wait" signals.

### Step 1: Understand the Interface

All strategies must implement `IStrategy`:

```typescript
interface IStrategy {
  getName(): string;
  initialize(): Promise<void>;
  execute(candles: ICandle[]): Promise<ISignal>;
  getStatus?(): Record<string, any>;
  dispose?(): void;
}

interface ISignal {
  action: 'buy' | 'sell' | 'wait';
  confidence: number;  // 0.0 - 1.0
  reason: string;
  metadata?: Record<string, any>;
}

interface ICandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
```

### Step 2: Create Strategy File

Location: `src/strategies/examples/01-hello-world-strategy.ts`

```typescript
import type { IStrategy, ICandle, ISignal } from '../../interfaces/IStrategy.js';
import { logger } from '../../utils/logger.js';

const STRATEGY_NAME = 'HelloWorld';

export class HelloWorldStrategy implements IStrategy {
  getName(): string {
    return STRATEGY_NAME;
  }

  async initialize(): Promise<void> {
    logger.info('[HelloWorld] Strategy initialized');
  }

  async execute(candles: ICandle[]): Promise<ISignal> {
    return {
      action: 'wait',
      confidence: 0,
      reason: 'Hello World - not yet implemented',
    };
  }
}
```

### Step 3: Test Your Strategy

```bash
# Build TypeScript
pnpm build

# Run in dev mode
pnpm dev

# View logs to confirm strategy loaded
tail -f logs/strategy.log
```

### Step 4: Verify

Check that:
- Strategy compiles without errors
- No runtime exceptions in initialization
- Log shows strategy name and initialization message

---

## Module 2: Architecture

### How Strategies Fit Into the System

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Durable Objects                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  StrategyShard (one per 52 strategies)              │   │
│  │  • Loads strategy implementations                    │   │
│  │  • Manages lifecycle (init, execute, dispose)       │   │
│  │  • Persists state (positions, metrics)              │   │
│  │  • Emits signals to execution engine                │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                Execution Pipeline                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │  Market  │ │   Risk   │ │  Order   │ │Exchange  │    │
│  │  Data    │ │ Manager  │ │Executor  │ │ Adapter  │    │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Strategy Loading

Strategies are discovered and loaded via the strategy router:

```typescript
// src/strategies/loader.ts
const STRATEGY_REGISTRY = new Map<string, () => IStrategy>([
  ['hello-world', () => new HelloWorldStrategy()],
  ['sma-crossover', () => new SmaCrossoverStrategy()],
  // ... more strategies
]);

function loadStrategy(name: string): IStrategy {
  const factory = STRATEGY_REGISTRY.get(name);
  if (!factory) throw new Error(`Unknown strategy: ${name}`);
  return factory();
}
```

### Configuration

Strategies receive configuration via environment or runtime parameters:

```typescript
const strategy = new SmaCrossoverStrategy({
  fastPeriod: 10,
  slowPeriod: 30,
  confidenceThreshold: 0.7,
});

// Or via environment:
// FAST_PERIOD=10 SLOW_PERIOD=30
```

---

## Module 3: Technical Indicators

### What You'll Learn

- Calculate technical indicators from price data
- Use indicators to generate trading signals
- Understand indicator strengths and weaknesses

### Price Data Structure

```typescript
interface ICandle {
  timestamp: number;  // Unix timestamp (milliseconds)
  open: number;       // Opening price
  high: number;       // Highest price in period
  low: number;        // Lowest price in period
  close: number;      // Closing price
  volume: number;     // Trading volume
}
```

### Common Indicators

See `docs/code-snippets/technical-indicators.md` for complete implementations.

#### Simple Moving Average (SMA)

```typescript
function calculateSMA(data: number[], period: number): number {
  const recent = data.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / period;
}
```

Use: Trend identification, support/resistance levels.

#### Exponential Moving Average (EMA)

```typescript
function calculateEMA(data: number[], period: number): number {
  const multiplier = 2 / (period + 1);
  let ema = calculateSMA(data.slice(0, period), period);

  for (let i = period; i < data.length; i++) {
    ema = data[i]! * multiplier + ema * (1 - multiplier);
  }

  return ema;
}
```

Use: More responsive than SMA, good for trending markets.

#### RSI (Relative Strength Index)

```typescript
function calculateRSI(closes: number[], period: number = 14): number {
  // See full implementation in code-snippets
  // Range: 0-100
  // < 30: Oversold (buy)
  // > 70: Overbought (sell)
}
```

Use: Mean reversion, overbought/oversold detection.

#### Bollinger Bands

```typescript
function calculateBollingerBands(
  closes: number[],
  period: number = 20,
  stdDev: number = 2
): { upper: number; middle: number; lower: number } {
  const middle = calculateSMA(closes, period);
  const std = calculateStdDev(closes.slice(-period), middle);
  return {
    middle,
    upper: middle + std * stdDev,
    lower: middle - std * stdDev,
  };
}
```

Use: Volatility measurement, breakout detection.

### Indicator Best Practices

1. **Use multiple timeframes**: Short (10-20), medium (50), long (200)
2. **Combine indicators**: RSI + MACD + volume for confirmation
3. **Avoid repainting**: Indicators should not change after candle closes
4. **Watch for divergences**: Price-indicator divergence signals reversals
5. **Consider market regime**: Trend vs range indicators differ

---

## Module 4: Signal Generation

### Signal Structure

```typescript
interface ISignal {
  action: 'buy' | 'sell' | 'wait';
  confidence: number;  // 0.0 - 1.0 (must be calibrated)
  reason: string;      // Human-readable explanation
  metadata?: {         // Optional additional data
    entryPrice?: number;
    targetPrice?: number;
    stopLoss?: number;
    positionSize?: number;
    indicators?: Record<string, number>;
  };
}
```

### Signal Generation Patterns

#### Threshold-Based

```typescript
if (rsi < 30) {
  return this.buySignal(0.8, 'RSI oversold', { rsi });
}
```

#### Crossover Detection

```typescript
// Check for golden cross (fast MA crosses above slow MA)
const prevFast = calculateSMA(prevCloses, fastPeriod);
const prevSlow = calculateSMA(prevCloses, slowPeriod);
const currFast = calculateSMA(currCloses, fastPeriod);
const currSlow = calculateSMA(currCloses, slowPeriod);

if (prevFast <= prevSlow && currFast > currSlow) {
  return this.buySignal(0.9, 'Golden cross', { fast: currFast, slow: currSlow });
}
```

#### Multi-Indicator Confluence

```typescript
const signals = [
  trendIndicator.signal,      // +1 or -1
  momentumIndicator.signal,   // +1 or -1
  volatilityIndicator.signal, // +1 or -1
];

const bullishCount = signals.filter(s => s > 0).length;
const bearishCount = signals.filter(s => s < 0).length;

if (bullishCount >= 2) {
  const confidence = bullishCount / signals.length;
  return this.buySignal(confidence, 'Multi-indicator confluence');
}
```

#### Confidence Scoring

```typescript
function calculateConfidence(
  indicatorStrength: number,  // Normalized to 0-1
  volumeConfirms: boolean,
  trendAlignment: number     // -1 to +1
): number {
  let confidence = indicatorStrength;

  if (volumeConfirms) confidence += 0.2;
  if (Math.abs(trendAlignment) > 0.5) confidence += 0.2;

  return Math.min(confidence, 1.0);
}
```

### Signal Cooldown

Prevent signal spam:

```typescript
private lastSignalTime = 0;
private readonly cooldownMs = 60_000; // 1 minute

async execute(candles: ICandle[]): Promise<ISignal> {
  const now = Date.now();
  if (now - this.lastSignalTime < this.cooldownMs) {
    return this.waitSignal('Cooldown active');
  }

  const signal = this.generateSignal(candles);
  if (signal.action !== 'wait') {
    this.lastSignalTime = now;
  }

  return signal;
}
```

---

## Module 5: Testing

### Unit Testing Strategy Logic

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { HelloWorldStrategy } from './01-hello-world-strategy';

describe('HelloWorldStrategy', () => {
  let strategy: HelloWorldStrategy;

  beforeEach(() => {
    strategy = new HelloWorldStrategy();
  });

  it('should initialize without errors', async () => {
    await expect(strategy.initialize()).resolves.not.toThrow();
  });

  it('should return wait signal with insufficient data', async () => {
    const candles: ICandle[] = [
      { timestamp: 1, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
    ];

    const signal = await strategy.execute(candles);
    expect(signal.action).toBe('wait');
    expect(signal.confidence).toBe(0);
    expect(signal.reason).toContain('insufficient');
  });

  it('should have correct name', () => {
    expect(strategy.getName()).toBe('HelloWorld');
  });
});
```

### Integration Testing

```typescript
describe('SmaCrossoverStrategy Integration', () => {
  it('should detect golden cross', async () => {
    const strategy = new SmaCrossoverStrategy({ fastPeriod: 3, slowPeriod: 5 });

    // Create data where fast MA crosses above slow MA
    const candles = generateUptrendData(50);

    const signal = await strategy.execute(candles);
    expect(signal.action).toBe('buy');
    expect(signal.confidence).toBeGreaterThan(0.7);
  });
});
```

### Test Data Generation

```typescript
function generateUptrendData(length: number): ICandle[] {
  const candles: ICandle[] = [];
  let price = 100;

  for (let i = 0; i < length; i++) {
    price += Math.random() * 2 - 0.5; // Slight upward bias
    candles.push({
      timestamp: Date.now() + i * 60_000,
      open: price,
      high: price + Math.random(),
      low: price - Math.random(),
      close: price,
      volume: 1000 + Math.random() * 500,
    });
  }

  return candles;
}
```

---

## Module 6: Risk Management

### Essential Risk Controls

1. **Position Sizing**: Never risk more than 1-2% per trade
2. **Stop-Loss**: Always define exit before entry
3. **Maximum Drawdown**: Halt trading after X% drawdown
4. **Daily Loss Limit**: Prevent blow-up
5. **Maximum Position Size**: Cap as % of account

### Implementation Pattern

```typescript
class RiskManagedStrategy implements IStrategy {
  private position: Position | null = null;
  private riskMetrics: RiskMetrics;

  async execute(candles: ICandle[]): Promise<ISignal> {
    // 1. Check risk limits first
    const riskCheck = this.checkRiskLimits();
    if (!riskCheck.pass) {
      return this.waitSignal(`Risk limit: ${riskCheck.reason}`);
    }

    // 2. Check trailing stops if position open
    if (this.position) {
      const stopResult = this.checkTrailingStop(candles[candles.length - 1]!.close);
      if (stopResult.triggered) {
        return this.sellSignal(1.0, 'Trailing stop', stopResult.metadata);
      }
    }

    // 3. Generate signal
    const signal = this.generateTradingSignal(candles);

    // 4. Apply position sizing based on risk
    if (signal.action !== 'wait') {
      const positionSize = this.calculatePositionSize(signal, candles);
      signal.metadata = { ...signal.metadata, positionSize };
    }

    return signal;
  }
}
```

### Kelly Criterion (Optimal Position Sizing)

See complete implementation in `examples/05-risk-managed-kelly-strategy.ts`

Key formula:
```
f* = (p × b - q) / b
where:
  p = win rate
  b = win/loss ratio
  q = 1 - p
```

Use fractional Kelly (0.25x or 0.5x) for safety.

---

## Module 7: Backtesting

### Why Backtest?

- Validate strategy logic before risking real money
- Optimize parameters (cautiously)
- Understand historical performance
- Identify regime dependencies

### Basic Backtest Loop

```typescript
async function backtest(
  candles: ICandle[],
  strategy: IStrategy,
  initialBalance: number
): BacktestResult {
  let balance = initialBalance;
  let position: Position | null = null;
  const trades: Trade[] = [];

  for (let i = 0; i < candles.length; i++) {
    const current = candles[i]!;
    const history = candles.slice(Math.max(0, i - 100), i + 1);

    // Get signal
    const signal = await strategy.execute(history);

    // Check exit
    if (position && shouldExit(position, signal, current)) {
      const pnl = calculatePnL(position, current.close);
      balance += pnl;
      trades.push(createTradeRecord(position, current, pnl));
      position = null;
    }

    // Check entry
    if (!position && signal.action !== 'wait') {
      const size = calculatePositionSize(balance, signal, current.close);
      position = {
        side: signal.action,
        entryPrice: current.close,
        size,
        entryTime: current.timestamp,
      };
    }
  }

  return calculateMetrics(trades, initialBalance);
}
```

### Critical Backtest Components

1. **Realistic commission**: 0.1-0.5% per trade
2. **Slippage modeling**: Order book impact
3. **Look-ahead protection**: Never use future data
4. **Survivorship bias avoidance**: Include delisted symbols
5. **Out-of-sample testing**: Never optimize on full dataset

### Walk-Forward Analysis

Rolling window validation:

```typescript
// Train on 200 days, test on 50 days, roll forward
for (let start = 0; start + 250 <= data.length; start += 50) {
  const train = data.slice(start, start + 200);
  const test = data.slice(start + 200, start + 250);

  const params = optimize(train);
  const result = backtestWithParams(test, params);

  results.push(result);
}
```

Check parameter stability - they should be consistent across segments.

---

## Module 8: Paper Trading

### What is Paper Trading?

Simulated trading with live market data but no real money.

### Setup Paper Trading

```bash
# Start paper trading mode
pnpm exec ts-node src/index.ts paper-trading \
  --strategy=sma-crossover \
  --capital=10000 \
  --dry-run
```

### Paper Trading Benefits

1. **Validate backtest results** in live conditions
2. **Test execution logic** (orders, fills, fees)
3. **Monitor latency** and system performance
4. **Test psychology** without financial risk
5. **Catch data issues** (missing bars, bad timestamps)

### Paper Trading Checklist

- [ ] Strategy executes on schedule (every candle/interval)
- [ ] Signals match backtest expectations
- [ ] Order fills at realistic prices (consider slippage)
- [ ] Commissions calculated correctly
- [ ] Position tracking accurate
- [ ] P&L calculation correct
- [ ] No exceptions/crashes
- [ ] Memory usage stable

### Paper Trading Duration

- Minimum: 2-4 weeks
- Preferable: 1-3 months
- Must include different market conditions:
  - Trending markets
  - Range-bound markets
  - High volatility events
  - Low liquidity periods

---

## Module 9: Deployment & Monitoring

### Deploy Strategy to Production

```bash
# 1. Build
pnpm build

# 2. Test
pnpm test

# 3. Deploy to Cloudflare Workers
pnpm build:worker
wrangler deploy --env production
```

### Enable Strategy

```bash
# Via API
curl -X POST https://api.algo-trader.workers.dev/api/v1/strategy/enable \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"strategy": "sma-crossover", "config": {}}'

# Or via CLI
pnpm exec ts-node src/cli/enable-strategy.ts \
  --strategy=sma-crossover \
  --env=production
```

### Monitoring Dashboard

Key metrics to watch:

```
Strategy Metrics:
├── Signals Generated (per minute/hour/day)
├── Win Rate (%)
├── Profit Factor (gross profit / gross loss)
├── Sharpe Ratio (risk-adjusted return)
├── Max Drawdown (%)
├── Current Position
│   ├── Entry Price
│   ├── Current P&L (unrealized)
│   └── Days Held
└── Risk Limits
    ├── Daily P&L
    ├── Account Balance
    └── Exposure (% of account)
```

### Log Analysis

```bash
# View real-time logs
wrangler tail

# Filter by strategy
wrangler tail --format json | jq 'select(.strategy == "sma-crossover")'

# Count signals by type
wrangler tail --format json | jq -r '.signal.action' | sort | uniq -c
```

---

## Module 10: Production Considerations

### Performance Optimization

1. **Indicator caching**: Don't recalculate on every tick
2. **Incremental updates**: Update EMA with new price, don't recalculate full history
3. **Memory limits**: Cap price history (e.g., last 1000 candles)
4. **Async efficiency**: Use batch operations where possible

### Error Handling

```typescript
async execute(candles: ICandle[]): Promise<ISignal> {
  try {
    // Strategy logic
    return this.generateSignal(candles);
  } catch (error) {
    logger.error('[Strategy] Execution error', {
      strategy: this.getName(),
      error: error instanceof Error ? error.message : String(error),
      candlesCount: candles.length,
    });

    // Fail gracefully
    return this.waitSignal('Strategy error - check logs');
  }
}
```

### Circuit Breakers

```typescript
class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private readonly failureThreshold = 5;
  private readonly timeoutMs = 60_000; // 1 minute

  async execute<T>(fn: () => Promise<T>): Promise<T | null> {
    if (this.state === 'open') {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed < this.timeoutMs) {
        return null; // Circuit open
      }
      this.state = 'half-open';
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'open';
    }
  }
}
```

### Production Readiness Checklist

- [ ] **Strategy Logic**
  - [ ] All signals have clear reasoning
  - [ ] Confidence properly calibrated (0.0-1.0)
  - [ ] No hardcoded values (configurable)
  - [ ] Handles edge cases (missing data, NaN values)

- [ ] **Risk Management**
  - [ ] Position sizing implemented
  - [ ] Stop-loss always set
  - [ ] Maximum position limits enforced
  - [ ] Daily loss limits configured
  - [ ] Drawdown circuit breaker active

- [ ] **Testing**
  - [ ] Unit tests pass (>80% coverage)
  - [ ] Integration tests pass
  - [ ] Paper trading successful (2+ weeks)
  - [ ] Backtest shows positive expectancy
  - [ ] Walk-forward analysis stable

- [ ] **Monitoring**
  - [ ] Logs structured and searchable
  - [ ] Metrics exported (Prometheus/StatsD)
  - [ ] Alerts configured (errors, no signals, high drawdown)
  - [ ] Dashboard updated

- [ ] **Documentation**
  - [ ] Strategy description and logic documented
  - [ ] Parameters explained with defaults
  - [ ] Risk profile described
  - [ ] Known limitations listed
  - [ ] Troubleshooting guide available

- [ ] **Operational**
  - [ ] Deployment script tested
  - [ ] Rollback procedure documented
  - [ ] Runbook created
  - [ ] On-call aware of strategy
  - [ ] Incident response plan ready

---

## Next Steps

After completing this guide:

1. **Study existing strategies** in `src/strategies/polymarket/`
2. **Review risk management** in `src/risk/`
3. **Understand backtesting** in `src/execution/backtest-runner.ts`
4. **Explore production deployment** in `docs/deployment-guide.md`
5. **Learn monitoring** in `docs/metrics-reference.md`

---

## Resources

- **Complete Examples**: `src/strategies/examples/`
- **Production Strategies**: `src/strategies/polymarket/`
- **API Reference**: `docs/api-reference.md`
- **Code Snippets**: `docs/code-snippets/`
- **System Architecture**: `docs/system-architecture.md`

---

**Questions?** Check `docs/developer-onboarding.md` or ask in `#algo-trader-dev`
