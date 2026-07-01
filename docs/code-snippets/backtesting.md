# Code Snippets: Backtesting

Complete backtesting patterns and best practices for strategy validation.

## Table of Contents

1. [Basic Backtest Loop](#basic-backtest-loop)
2. [Performance Metrics](#performance-metrics)
3. [Trade Tracking](#trade-tracking)
4. [Walk-Forward Analysis](#walk-forward-analysis)
5. [Monte Carlo Simulation](#monte-carlo-simulation)
6. [Slippage Modeling](#slippage-modeling)
7. [Common Pitfalls](#common-pitfalls)

---

## Basic Backtest Loop

```typescript
interface Trade {
  id: string;
  entryTime: number;
  exitTime: number;
  side: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  size: number;
  pnl: number;
  commission: number;
}

interface BacktestResult {
  trades: Trade[];
  finalBalance: number;
  totalReturn: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
  sortinoRatio: number;
}

/**
 * Basic backtest runner (simplified)
 */
async function runBacktest(
  candles: ICandle[],
  strategy: IStrategy,
  initialBalance: number = 10000
): Promise<BacktestResult> {
  const trades: Trade[] = [];
  let balance = initialBalance;
  let position: Position | null = null;
  let peakBalance = initialBalance;
  let maxDrawdown = 0;

  for (let i = 0; i < candles.length; i++) {
    const currentCandle = candles[i]!;
    const lookback = candles.slice(Math.max(0, i - 100), i + 1);

    // Get signal from strategy
    const signal = await strategy.execute(lookback);

    // Check for exit if position open
    if (position) {
      const exitSignal = shouldExit(position, signal, currentCandle);
      if (exitSignal) {
        const exitPrice = currentCandle.close;
        const pnl = calculatePnL(position, exitPrice);

        const trade: Trade = {
          id: generateId(),
          entryTime: position.entryTime,
          exitTime: currentCandle.timestamp,
          side: position.side,
          entryPrice: position.entryPrice,
          exitPrice,
          size: position.size,
          pnl,
          commission: pnl * 0.001, // 0.1% commission
        };

        trades.push(trade);
        balance += pnl - trade.commission;
        position = null;

        // Update drawdown
        peakBalance = Math.max(peakBalance, balance);
        const drawdown = (peakBalance - balance) / peakBalance;
        maxDrawdown = Math.max(maxDrawdown, drawdown);
      }
    }

    // Check for entry if no position
    if (!position && signal.action === 'buy' || signal.action === 'sell') {
      const positionSize = calculatePositionSize(
        balance,
        signal,
        currentCandle.close
      );

      position = {
        side: signal.action,
        entryPrice: currentCandle.close,
        size: positionSize,
        entryTime: currentCandle.timestamp,
      };
    }
  }

  // Close any open position at end
  if (position && candles.length > 0) {
    const lastCandle = candles[candles.length - 1]!;
    const pnl = calculatePnL(position, lastCandle.close);
    trades.push({
      id: generateId(),
      entryTime: position.entryTime,
      exitTime: lastCandle.timestamp,
      side: position.side,
      entryPrice: position.entryPrice,
      exitPrice: lastCandle.close,
      size: position.size,
      pnl,
      commission: pnl * 0.001,
    });
    balance += pnl;
  }

  return calculateMetrics(trades, initialBalance, maxDrawdown);
}

function calculatePnL(position: Position, exitPrice: number): number {
  if (position.side === 'long') {
    return (exitPrice - position.entryPrice) * position.size;
  } else {
    return (position.entryPrice - exitPrice) * position.size;
  }
}

function shouldExit(
  position: Position,
  signal: ISignal,
  currentCandle: ICandle
): boolean {
  // Exit on opposite signal
  if (position.side === 'long' && signal.action === 'sell') return true;
  if (position.side === 'short' && signal.action === 'buy') return true;

  // Or check stop-loss/take-profit (if configured in signal.metadata)
  if (signal.metadata?.stopLoss) {
    if (position.side === 'long' && currentCandle.low <= signal.metadata.stopLoss) {
      return true;
    }
    if (position.side === 'short' && currentCandle.high >= signal.metadata.stopLoss) {
      return true;
    }
  }

  return false;
}
```

---

## Performance Metrics

```typescript
interface BacktestMetrics {
  totalReturn: number;
  annualizedReturn: number;
  annualizedVolatility: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownDuration: number;
  totalTrades: number;
  avgTradePnL: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  expectancy: number;
}

function calculateMetrics(
  trades: Trade[],
  initialBalance: number,
  maxDrawdown: number
): BacktestResult {
  const totalReturn = trades.reduce((sum, t) => sum + t.pnl, 0);
  const winningTrades = trades.filter(t => t.pnl > 0);
  const losingTrades = trades.filter(t => t.pnl <= 0);

  const winRate = trades.length > 0 ? winningTrades.length / trades.length : 0;
  const avgWin = winningTrades.length > 0
    ? winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length
    : 0;
  const avgLoss = losingTrades.length > 0
    ? losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length
    : 0;
  const profitFactor = Math.abs(avgWin / avgLoss);

  // Expectancy: average expected P&L per trade
  const expectancy = (winRate * avgWin) + ((1 - winRate) * avgLoss);

  // Sharpe ratio (assuming daily trading)
  const returns = trades.map(t => t.pnl / initialBalance);
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const volatility = Math.sqrt(
    returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
  );
  const sharpeRatio = volatility > 0 ? avgReturn / volatility : 0;

  return {
    trades,
    finalBalance: initialBalance + totalReturn,
    totalReturn,
    winRate,
    profitFactor,
    maxDrawdown,
    sharpeRatio,
    sortinoRatio: 0, // Calculated separately using downside dev
    calmarRatio: 0,  // Return / max drawdown
  };
}

// Downside deviation for Sortino
function calculateDownsideDeviation(returns: number[], target: number = 0): number {
  const negativeReturns = returns.filter(r => r < target);
  if (negativeReturns.length === 0) return 0;

  const squaredDeviations = negativeReturns.map(r => Math.pow(r - target, 2));
  const variance = squaredDeviations.reduce((a, b) => a + b, 0) / negativeReturns.length;
  return Math.sqrt(variance);
}

// Calmar Ratio = Annual Return / Max Drawdown
function calculateCalmarRatio(
  totalReturn: number,
  initialBalance: number,
  years: number,
  maxDrawdown: number
): number {
  if (maxDrawdown === 0) return 0;
  const annualReturn = ((1 + totalReturn / initialBalance) ** (1 / years) - 1);
  return annualReturn / maxDrawdown;
}
```

---

## Trade Tracking

```typescript
class TradeTracker {
  private trades: Trade[] = [];
  private equityCurve: number[] = [];
  private balance: number;

  constructor(initialBalance: number) {
    this.balance = initialBalance;
    this.equityCurve.push(initialBalance);
  }

  recordTrade(trade: Trade): void {
    this.trades.push(trade);
    this.balance += trade.pnl - trade.commission;
    this.equityCurve.push(this.balance);
  }

  getEquityCurve(): number[] {
    return [...this.equityCurve];
  }

  getUnderwaterPeriod(): number {
    // Time (in trades) from peak to recovery
    let underwater = 0;
    let maxUnderwater = 0;
    let peak = this.equityCurve[0]!;

    for (const equity of this.equityCurve) {
      if (equity > peak) {
        peak = equity;
        underwater = 0;
      } else {
        underwater++;
        maxUnderwater = Math.max(maxUnderwater, underwater);
      }
    }

    return maxUnderwater;
  }

  getConsecutiveWins(): number {
    let max = 0;
    let current = 0;

    for (const trade of this.trades) {
      if (trade.pnl > 0) {
        current++;
        max = Math.max(max, current);
      } else {
        current = 0;
      }
    }

    return max;
  }

  getExpectancy(): number {
    if (this.trades.length === 0) return 0;

    const winning = this.trades.filter(t => t.pnl > 0);
    const losing = this.trades.filter(t => t.pnl <= 0);

    const winRate = winning.length / this.trades.length;
    const avgWin = winning.reduce((s, t) => s + t.pnl, 0) / (winning.length || 1);
    const avgLoss = losing.reduce((s, t) => s + t.pnl, 0) / (losing.length || 1);

    return winRate * avgWin + (1 - winRate) * avgLoss;
  }
}
```

---

## Walk-Forward Analysis

Rolling window validation to test strategy robustness.

```typescript
interface WalkForwardConfig {
  trainingWindow: number;  // Bars to optimize parameters
  testingWindow: number;   // Bars to test optimized params
  stepSize: number;        // How many bars to roll forward
  optimize: (trainingData: ICandle[]) => Record<string, any>;
}

interface WalkForwardResult {
  segments: Array<{
    trainStart: number;
    trainEnd: number;
    testStart: number;
    testEnd: number;
    optimizedParams: Record<string, any>;
    performance: BacktestMetrics;
  }>;
  aggregatedMetrics: BacktestMetrics;
  parameterStability: Record<string, number[]>; // Track param values across segments
}

/**
 * Run walk-forward analysis
 */
async function performWalkForwardAnalysis(
  candles: ICandle[],
  config: WalkForwardConfig
): Promise<WalkForwardResult> {
  const segments: WalkForwardResult['segments'] = [];
  const paramHistory: Record<string, number[]> = {};

  for (let start = 0; start + config.trainingWindow + config.testingWindow <= candles.length; start += config.stepSize) {
    const trainStart = start;
    const trainEnd = start + config.trainingWindow;
    const testStart = trainEnd;
    const testEnd = testStart + config.testingWindow;

    // 1. Optimize on training set
    const trainingData = candles.slice(trainStart, trainEnd);
    const optimizedParams = config.optimize(trainingData);

    // Track parameter values
    for (const [key, value] of Object.entries(optimizedParams)) {
      if (typeof value === 'number') {
        if (!paramHistory[key]) paramHistory[key] = [];
        paramHistory[key]!.push(value);
      }
    }

    // 2. Test on out-of-sample data
    const testingData = candles.slice(testStart, testEnd);
    const result = await runBacktest(testingData, createStrategyWithParams(optimizedParams));

    segments.push({
      trainStart,
      trainEnd,
      testStart,
      testEnd,
      optimizedParams,
      performance: result,
    });
  }

  // Aggregate metrics
  const allTrades = segments.flatMap(s => s.performance.trades);
  const aggregatedMetrics = calculateAggregateMetrics(allTrades);

  return {
    segments,
    aggregatedMetrics,
    parameterStability: paramHistory,
  };
}

function calculateAggregateMetrics(trades: Trade[]): BacktestMetrics {
  // Calculate metrics across all segments
  const totalReturn = trades.reduce((sum, t) => sum + t.pnl, 0);
  const winRate = trades.filter(t => t.pnl > 0).length / trades.length;

  return {
    totalReturn,
    winRate,
    // ... other aggregated metrics
    trades,
    finalBalance: 0,
    profitFactor: 0,
    maxDrawdown: 0,
    sharpeRatio: 0,
    sortinoRatio: 0,
    calmarRatio: 0,
  };
}

/**
 * Validate walk-forward results
 */
function validateWalkForward(result: WalkForwardResult): {
  passed: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Check consistency of parameters
  for (const [param, values] of Object.entries(result.parameterStability)) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(
      values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
    );
    const cv = stdDev / mean; // Coefficient of variation

    if (cv > 0.5) {
      issues.push(`${param} unstable: CV=${(cv * 100).toFixed(1)}%`);
    }
  }

  // Check performance consistency
  const performances = result.segments.map(s => s.performance.totalReturn);
  const negativeSegments = performances.filter(p => p <= 0).length;
  if (negativeSegments > performances.length * 0.3) {
    issues.push(`Too many losing segments: ${negativeSegments}/${performances.length}`);
  }

  return {
    passed: issues.length === 0,
    issues,
  };
}
```

---

## Monte Carlo Simulation

Test strategy robustness by randomizing trade order.

```typescript
interface MonteCarloConfig {
  numSimulations: number;
  sampleWithReplacement: boolean;
}

interface MonteCarloResult {
  simulations: Array<{
    finalBalance: number;
    maxDrawdown: number;
    winRate: number;
  }>;
  metrics: {
    avgFinalBalance: number;
    stdDevFinalBalance: number;
    worstCaseBalance: number;
    bestCaseBalance: number;
    percentProfitable: number;
    medianDrawdown: number;
  };
}

/**
 * Run Monte Carlo simulation
 */
function runMonteCarlo(
  baselineTrades: Trade[],
  baselineBalance: number,
  config: MonteCarloConfig
): MonteCarloResult {
  const simulations: MonteCarloResult['simulations'] = [];

  for (let i = 0; i < config.numSimulations; i++) {
    // Resample trades (preserve correlation patterns if needed)
    const sampledTrades = sampleTrades(baselineTrades, config.sampleWithReplacement);

    // Run simulation
    let balance = baselineBalance;
    let peak = balance;
    let maxDrawdown = 0;
    let wins = 0;

    for (const trade of sampledTrades) {
      balance += trade.pnl;
      peak = Math.max(peak, balance);
      const drawdown = (peak - balance) / peak;
      maxDrawdown = Math.max(maxDrawdown, drawdown);

      if (trade.pnl > 0) wins++;
    }

    simulations.push({
      finalBalance: balance,
      maxDrawdown,
      winRate: wins / sampledTrades.length,
    });
  }

  // Calculate aggregate metrics
  const finalBalances = simulations.map(s => s.finalBalance);
  const profitableCount = simulations.filter(s => s.finalBalance > baselineBalance).length;

  const metrics = {
    avgFinalBalance: finalBalances.reduce((a, b) => a + b, 0) / simulations.length,
    stdDevFinalBalance: calculateStdDev(finalBalances),
    worstCaseBalance: Math.min(...finalBalances),
    bestCaseBalance: Math.max(...finalBalances),
    percentProfitable: profitableCount / simulations.length,
    medianDrawdown: median(simulations.map(s => s.maxDrawdown)),
  };

  return { simulations, metrics };
}

function sampleTrades(trades: Trade[], withReplacement: boolean): Trade[] {
  const result: Trade[] = [];
  const n = trades.length;

  if (withReplacement) {
    // Bootstrap sampling (can have duplicates)
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(Math.random() * n);
      result.push(trades[idx]!);
    }
  } else {
    // Shuffle without replacement
    const shuffled = [...trades].sort(() => Math.random() - 0.5);
    result.push(...shuffled);
  }

  return result;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}
```

---

## Slippage Modeling

```typescript
interface OrderBookLevel {
  price: number;
  size: number;
}

interface SlippageEstimate {
  expectedSlippage: number;
  expectedFillPrice: number;
  fillProbability: number;
  maxSlippage: number;
}

/**
 * Estimate slippage based on order book depth
 */
function estimateSlippage(
  orderBook: { bids: OrderBookLevel[]; asks: OrderBookLevel[] },
  tradeSize: number,
  side: 'buy' | 'sell',
  config?: { slippageFactor?: number }
): SlippageEstimate {
  const levels = side === 'buy' ? orderBook.asks : orderBook.bids;
  const slippageFactor = config?.slippageFactor ?? 1.0;

  let remainingSize = tradeSize;
  let totalCost = 0;
  let maxSlippage = 0;
  let filledSize = 0;

  const bestPrice = levels[0]?.price ?? 0;

  for (const level of levels) {
    if (remainingSize <= 0) break;

    const availableSize = level.size;
    const filled = Math.min(availableSize, remainingSize);
    const priceImpact = level.price - bestPrice;
    const adjustedPrice = level.price + (priceImpact * slippageFactor);

    totalCost += adjustedPrice * filled;
    filledSize += filled;
    remainingSize -= filled;
    maxSlippage = Math.max(maxSlippage, priceImpact);

    if (filledSize >= tradeSize) break;
  }

  if (filledSize < tradeSize) {
    // Not enough liquidity - expect worse fill
    return {
      expectedSlippage: maxSlippage * 2,
      expectedFillPrice: bestPrice + maxSlippage * 2,
      fillProbability: filledSize / tradeSize,
      maxSlippage: maxSlippage * 2,
    };
  }

  const avgPrice = totalCost / tradeSize;
  const expectedSlippage = avgPrice - bestPrice;

  return {
    expectedSlippage,
    expectedFillPrice: avgPrice,
    fillProbability: 1.0,
    maxSlippage,
  };
}

/**
 * Incorporate slippage into backtest
 */
function applySlippage(
  entryPrice: number,
  tradeSize: number,
  side: 'long' | 'short',
  orderBook: OrderBook,
  slippageModel?: SlippageModel
): number {
  const estimate = estimateSlippage(orderBook, tradeSize, side === 'long' ? 'buy' : 'sell');

  if (slippageModel === 'conservative') {
    return entryPrice + estimate.maxSlippage * 2 * (side === 'long' ? 1 : -1);
  }

  return entryPrice + estimate.expectedSlippage * (side === 'long' ? 1 : -1);
}
```

---

## Common Pitfalls

### Look-Ahead Bias

```typescript
// BAD: Using future information
function badExecute(candles: ICandle[]): ISignal {
  // Using candle[i+1] - future data!
  const futureClose = candles[1]?.close; // ❌

  return {
    action: futureClose > candles[0]!.close ? 'buy' : 'sell',
    confidence: 0.9,
    reason: 'Tomorrow price higher',
  };
}

// GOOD: Only use current and past data
function goodExecute(candles: ICandle[]): ISignal {
  const current = candles[candles.length - 1]!.close;
  const prev = candles[candles.length - 2]?.close;

  // Only use current and historical data
  const momentum = current - (prev ?? current);
  return {
    action: momentum > 0 ? 'buy' : 'sell',
    confidence: Math.min(Math.abs(momentum) / current * 100, 1),
    reason: `Momentum: ${momentum.toFixed(2)}`,
  };
}
```

### Survivorship Bias

```typescript
// Test on delisted stocks? Use full historical universe, not just current constituents
const allHistoricalSymbols = getAllSymbolsAtDate(testDate);
const currentSymbols = getCurrentSymbols(); // ❌ Survivorship bias

// Include:
// - Delisted stocks
// - Failed companies
// - Illiquid symbols
```

### Overfitting

```typescript
// BAD: Too many parameters tuned to past data
const params = {
  rsiPeriod: 14.27,    // ❌ Hyper-specific
  smaFast: 9.87,
  smaSlow: 25.14,
  threshold: 0.723,
};

// GOOD: Rounded, sensible parameters
const params = {
  rsiPeriod: 14,      // Industry standard
  smaFast: 10,        // Round number
  smaSlow: 30,
  threshold: 0.70,    // Reasonable threshold
};

// Validate with:
// - Walk-forward analysis
// - Monte Carlo simulations
// - Out-of-sample testing
// - Parameter stability checks
```

---

## Best Practices

1. **Track everything**: Record every trade, signal, and state change
2. **Include costs**: Commission, slippage, spread, financing
3. **Use realistic data**: Tick data for HFT, 1-min for day trading, daily for swing
4. **Avoid look-ahead**: No future data leakage
5. **Test on unseen data**: Train/validation/test split
6. **Check parameter stability**: Parameters shouldn't vary wildly across periods
7. **Run Monte Carlo**: Test robustness to trade order changes
8. **Measure risk-adjusted returns**: Sharpe > Sortino > Raw returns

---

## References

- `src/strategies/examples/` - Example strategies with backtest-ready code
- `docs/api-reference.md` - BacktestRunner API
- `src/execution/backtest-runner.ts` - Production backtest implementation
- `docs/code-snippets/technical-indicators.md` - Indicator calculations
