# Strategy Examples - Educational Repository

This directory contains sample trading strategies for learning algo-trader development.

## 🎯 Purpose

These strategies are designed to teach you how to build trading algorithms from first principles. Each example builds on the previous, introducing new concepts progressively.

---

## 📚 Learning Path

### 1. Beginner (Start Here)

#### 01. Hello World Strategy
**File**: `01-hello-world-strategy.ts`

**What you'll learn**:
- Basic strategy structure (`IStrategy` interface)
- How to implement `getName()`, `initialize()`, `execute()`
- Signal generation basics

**Next step**: Once you understand this file, move to SMA crossover.

---

#### 02. SMA Crossover Strategy
**File**: `02-sma-crossover-strategy.ts`

**What you'll learn**:
- Calculating Simple Moving Average (SMA)
- Detecting crossovers (golden cross, death cross)
- Confidence scoring
- Using metadata to pass indicator values

**Key concepts**:
```typescript
fastSMA = calculateSMA(closes, 10);
slowSMA = calculateSMA(closes, 30);

// Bullish signal when fast crosses above slow
if (prevFast <= prevSlow && currFast > currSlow) {
  return buySignal(confidence, 'SMA bullish crossover');
}
```

**Next step**: Add RSI for confirmation.

---

### 2. Intermediate

#### 03. RSI Mean Reversion Strategy
**File**: `03-rsi-mean-reversion-strategy.ts`

**What you'll learn**:
- RSI calculation from scratch
- Mean reversion logic
- Detecting oversold/overbought conditions
- RSI turning point detection

**Key concepts**:
- RSI < 30 = oversold → potential buy
- RSI > 70 = overbought → potential sell
- Wait for RSI to turn before entering

**Next step**: Combine multiple indicators.

---

#### 04. Multi-Indicator Confluence Strategy
**File**: `04-multi-indicator-confluence-strategy.ts`

**What you'll learn**:
- Combining multiple indicators (trend, momentum, volume, volatility)
- Voting/confluence systems
- Signal weighting
- Volatility-based position sizing

**Key concepts**:
- Require 3/4 indicators to agree
- Reduce position size in high volatility
- Confidence based on confluence strength

**Next step**: Add advanced risk management.

---

### 3. Advanced

#### 05. Risk-Managed Kelly Strategy
**File**: `05-risk-managed-kelly-strategy.ts`

**What you'll learn**:
- Kelly Criterion for optimal position sizing
- Dynamic risk adjustment
- Trailing stop-loss implementation
- Daily loss limits and drawdown protection
- Real-time win rate and win/loss ratio tracking

**Key concepts**:
- Kelly formula: `f* = (p × b - q) / b`
- Fractional Kelly (0.25x) for safety
- Volatility adjustment reduces position size
- Circuit breakers halt trading after drawdown threshold

---

## 📖 How to Use These Examples

### 1. Read the Code

Each strategy includes extensive educational comments:

```typescript
/**
 * Example 2: Simple Moving Average (SMA) Crossover Strategy
 *
 * This strategy demonstrates:
 * - Technical indicator calculation (SMA)
 * - Trading signal generation based on indicator crossovers
 * - Confidence scoring
 * - Position management
 *
 * STRATEGY LOGIC:
 * - Buy when fast SMA (10) crosses above slow SMA (30)
 * - Sell when fast SMA crosses below slow SMA
 * - Wait when SMAs are parallel (no clear trend)
 */
```

### 2. Build and Test

```bash
# Build the project
pnpm build

# Run unit tests (if tests exist)
pnpm test --grep "StrategyName"

# Try in paper trading mode
pnpm exec ts-node src/index.ts paper-trading \
  --strategy=hello-world \
  --capital=10000 \
  --dry-run
```

### 3. Modify and Experiment

**Try these modifications**:

- Change SMA periods: `fastPeriod: 5, slowPeriod: 20`
- Add RSI filter: Only take buy signals when RSI < 70
- Adjust confidence thresholds
- Add stop-loss logic
- Implement position scaling

**Document your changes**: Add comments explaining your reasoning.

---

## 🔄 Example Workflow

1. **Start with Hello World**
   ```bash
   cp src/strategies/examples/01-hello-world-strategy.ts src/strategies/my-first-strategy.ts
   # Rename class, adjust logic
   ```

2. **Add an indicator**
   - Implement `calculateSMA()` from `docs/code-snippets/technical-indicators.md`
   - Call it in `execute()`
   - Log results

3. **Generate signals**
   - Add crossover detection logic
   - Return buy/sell signals
   - Include metadata (indicator values)

4. **Add risk management**
   - Implement position sizing from `docs/code-snippets/risk-management.md`
   - Add stop-loss/take-profit
   - Track P&L

5. **Write tests**
   ```typescript
   // test/my-first-strategy.test.ts
   describe('MyFirstStrategy', () => {
     it('should generate buy signal on bullish crossover', async () => {
       const strategy = new MyFirstStrategy();
       const signal = await strategy.execute(uptrendCandles);
       expect(signal.action).toBe('buy');
     });
   });
   ```

6. **Backtest**
   ```typescript
   import { BacktestRunner } from 'src/execution/backtest-runner.js';
   // Run with historical data, check metrics
   ```

7. **Paper trade for 2+ weeks**
8. **Deploy to production** (if backtest and paper trading successful)

---

## 📊 Comparing Strategies

| Strategy | Complexity | Indicators | Risk Mgmt | Best For |
|----------|------------|------------|-----------|----------|
| Hello World | ⭐☆☆☆☆ | None | None | Learning interface |
| SMA Crossover | ⭐☆☆☆☆ | 2 (SMA) | None | Trend following basics |
| RSI Mean Reversion | ⭐⭐☆☆☆ | 1 (RSI) | Basic | Range-bound markets |
| Multi-Indicator | ⭐⭐⭐☆☆ | 4+ | Basic volatility | Confirmation, filtering |
| Kelly Managed | ⭐⭐⭐⭐⭐ | 2 (SMA) | Advanced (Kelly, stops, limits) | Production-ready |

---

## 🐛 Debugging Tips

### Enable Verbose Logging

```typescript
import { logger } from 'src/utils/logger.js';

// Add logging to your strategy
async execute(candles: ICandle[]): Promise<ISignal> {
  logger.debug('Executing strategy', {
    strategy: this.getName(),
    candleCount: candles.length,
    latestClose: candles[candles.length - 1]?.close,
  });

  // Your logic here
}
```

### Check Signal History

```typescript
// Add to your strategy class
private lastSignals: ISignal[] = [];

async execute(candles: ICandle[]): Promise<ISignal> {
  const signal = this.generateSignal(candles);
  this.lastSignals.push(signal);
  this.lastSignals = this.lastSignals.slice(-100); // Keep last 100
  return signal;
}

getLastSignals(): ISignal[] {
  return this.lastSignals;
}
```

---

## 📝 Best Practices

1. **Start simple**: Hello World → SMA → RSI → Multi-indicator → Advanced
2. **Write tests**: Every strategy needs unit tests
3. **Backtest rigorously**: Use walk-forward analysis
4. **Paper trade**: Minimum 2 weeks, preferably 1-3 months
5. **Monitor in production**: Set up alerts for unusual behavior
6. **Document parameters**: Explain what each parameter does and default values
7. **Handle edge cases**: Insufficient data, NaN values, stale candles

---

## 🆘 Common Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| "Insufficient data" error | Not enough history loaded | Increase initial data load or wait for more candles |
| All signals are "wait" | Logic bug or thresholds too strict | Add debug logging to check indicator values |
| Strategy not trading | Cooldown too long or confidence too high | Reduce cooldown or threshold |
| High memory usage | Unlimited history array | Cap `this.priceHistory` with `slice(-N)` |
| Backtest results don't match paper | Data quality or timing issues | Check data alignment, timezone, missing bars |

---

## 📚 Additional Resources

- **Complete API Reference**: `docs/api-reference.md`
- **Code Snippets**: `docs/code-snippets/`
  - `technical-indicators.md` — All indicator implementations
  - `risk-management.md` — Position sizing, stops, Kelly
  - `backtesting.md` — Backtest runner, metrics, validation
- **Strategy Development Guide**: `docs/education/strategy-development-guide.md`
- **Video Tutorials**: `docs/education/video-tutorials-curriculum.md`
- **Production Strategies**: `src/strategies/polymarket/` (40+ real strategies)

---

## 🤝 Contributing

Want to add your own example strategy?

1. Fork the repository
2. Add your strategy file with comprehensive comments
3. Include unit tests
4. Update this README with your strategy description
5. Submit a pull request

**Guidelines**:
- File name: `NN-strategy-name.ts` (use sequential number)
- Include JSDoc comments explaining:
  - What the strategy does
  - Key parameters and their effects
  - When to use it (market regime)
  - Limitations and risks
- Keep it educational, not overly optimized
- Test with at least 2 different market conditions

---

## 📈 Next Steps

After mastering these examples:

1. Study production strategies in `src/strategies/polymarket/`
2. Read the full [Strategy Development Guide](../education/strategy-development-guide.md)
3. Implement your own custom strategy
4. Backtest thoroughly
5. Paper trade for 2+ weeks
6. Deploy to staging → production
7. Monitor and iterate

---

**Happy coding! 📊🚀**

For questions, see `docs/developer-onboarding.md` or open a GitHub discussion.
