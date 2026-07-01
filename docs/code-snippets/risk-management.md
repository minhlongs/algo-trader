# Code Snippets: Risk Management

Essential risk management patterns and calculations for trading strategies.

## Table of Contents

1. [Position Sizing](#position-sizing)
2. [Stop-Loss Strategies](#stop-loss-strategies)
3. [Take-Profit Strategies](#take-profit-strategies)
4. [Portfolio Risk Controls](#portfolio-risk-controls)
5. [Kelly Criterion](#kelly-criterion)
6. [Drawdown Protection](#drawdown-protection)
7. [Volatility Adjustment](#volatility-adjustment)
8. [Daily Loss Limits](#daily-loss-limits)

---

## Position Sizing

### Fixed Percentage Risk

The simplest approach: risk a fixed percentage of account per trade.

```typescript
/**
 * Calculate position size based on fixed percentage risk
 * @param accountBalance Current account balance
 * @param riskPercent Percentage to risk (e.g., 0.01 = 1%)
 * @param entryPrice Entry price per unit
 * @param stopLossPrice Stop-loss price per unit
 * @returns Number of units to buy/sell
 */
function calculateFixedRiskPosition(
  accountBalance: number,
  riskPercent: number,
  entryPrice: number,
  stopLossPrice: number
): number {
  const riskAmount = accountBalance * riskPercent;
  const riskPerUnit = Math.abs(entryPrice - stopLossPrice);

  if (riskPerUnit === 0) {
    throw new Error('Risk per unit cannot be zero (entry == stop)');
  }

  const positionSize = riskAmount / riskPerUnit;
  return Math.floor(positionSize);
}

// Example: $10,000 account, risk 1%, entry $100, stop $95
const position = calculateFixedRiskPosition(10000, 0.01, 100, 95);
// position = 200 units ($2000 notional, $100 at risk)

// Position notional value
const notionalValue = position * entryPrice; // $20,000

// Check position doesn't exceed account
if (notionalValue > accountBalance * 2) {
  // Too large, reduce size
}
```

---

## Stop-Loss Strategies

### Fixed Percentage Stop

```typescript
interface StopLossConfig {
  stopLossPercent: number; // e.g., 0.02 = 2%
  side: 'long' | 'short';
}

function calculateFixedPercentStop(
  entryPrice: number,
  config: StopLossConfig
): number {
  if (config.side === 'long') {
    return entryPrice * (1 - config.stopLossPercent);
  } else {
    return entryPrice * (1 + config.stopLossPercent);
  }
}

// For long position, stop below entry; for short, stop above entry
const longStop = calculateFixedPercentStop(100, { stopLossPercent: 0.02, side: 'long' }); // 98
const shortStop = calculateFixedPercentStop(100, { stopLossPercent: 0.02, side: 'short' }); // 102
```

### ATR-Based Stop (Dynamic)

```typescript
/**
 * Calculate stop-loss based on Average True Range
 * Provides larger stops in volatile markets
 */
function calculateATRStop(
  entryPrice: number,
  atr: number,
  atrMultiplier: number = 2,
  side: 'long' | 'short'
): number {
  const stopDistance = atr * atrMultiplier;

  if (side === 'long') {
    return entryPrice - stopDistance;
  } else {
    return entryPrice + stopDistance;
  }
}

// Adjust multiplier based on strategy tolerance
// Conservative: 3x ATR
// Moderate: 2x ATR (default)
// Aggressive: 1x ATR
```

### Trailing Stop

```typescript
interface TrailingStopState {
  highestPrice: number;   // Highest price since entry (for long)
  lowestPrice: number;    // Lowest price since entry (for short)
  stopPrice: number;
}

/**
 * Initialize trailing stop
 */
function initTrailingStop(
  entryPrice: number,
  config: { trailingStopPercent: number },
  side: 'long' | 'short'
): TrailingStopState {
  const initialStop = config.trailingStopPercent;

  if (side === 'long') {
    return {
      highestPrice: entryPrice,
      lowestPrice: entryPrice,
      stopPrice: entryPrice * (1 - initialStop),
    };
  } else {
    return {
      highestPrice: entryPrice,
      lowestPrice: entryPrice,
      stopPrice: entryPrice * (1 + initialStop),
    };
  }
}

/**
 * Update trailing stop on each new price
 */
function updateTrailingStop(
  currentPrice: number,
  state: TrailingStopState,
  config: { trailingStopPercent: number },
  side: 'long' | 'short'
): { state: TrailingStopState; stopHit: boolean } {
  const stopDistancePercent = config.trailingStopPercent;

  if (side === 'long') {
    // Update high water mark
    if (currentPrice > state.highestPrice) {
      state.highestPrice = currentPrice;
      state.stopPrice = currentPrice * (1 - stopDistancePercent);
    }

    // Check if stop hit
    if (currentPrice <= state.stopPrice) {
      return { state, stopHit: true };
    }
  } else {
    // Update low water mark
    if (currentPrice < state.lowestPrice) {
      state.lowestPrice = currentPrice;
      state.stopPrice = currentPrice * (1 + stopDistancePercent);
    }

    if (currentPrice >= state.stopPrice) {
      return { state, stopHit: true };
    }
  }

  return { state, stopHit: false };
}

// Usage:
let trailingState = initTrailingStop(100, { trailingStopPercent: 0.02 }, 'long');
// state.stopPrice = 98

// Price moves to 105
const result = updateTrailingStop(105, trailingState, { trailingStopPercent: 0.02 }, 'long');
// result.state.stopPrice = 102.9 (105 * 0.98)
// trailing stop moved up
```

---

## Take-Profit Strategies

### Fixed Ratio (R Multiple)

```typescript
/**
 * Calculate take-profit as multiple of risk
 * e.g., 2R = 2x the amount risked
 */
function calculateTakeProfit(
  entryPrice: number,
  stopLossPrice: number,
  riskRewardRatio: number,
  side: 'long' | 'short'
): number {
  const risk = Math.abs(entryPrice - stopLossPrice);
  const reward = risk * riskRewardRatio;

  if (side === 'long') {
    return entryPrice + reward;
  } else {
    return entryPrice - reward;
  }
}

// Example: Entry $100, stop $95 (risk $5), 2:1 reward
const tp = calculateTakeProfit(100, 95, 2, 'long'); // $110
```

### Partial Take-Profit Scaling

```typescript
interface ScaleTarget {
  price: number;
  percent: number; // Percent of position to exit
}

function calculatePartialTakeProfits(
  entryPrice: number,
  stopLossPrice: number,
  targets: Array<{ rMultiple: number; percent: number }>,
  side: 'long' | 'short'
): ScaleTarget[] {
  const risk = Math.abs(entryPrice - stopLossPrice);

  return targets.map(target => {
    const reward = risk * target.rMultiple;
    const price = side === 'long'
      ? entryPrice + reward
      : entryPrice - reward;

    return { price, percent: target.percent };
  });
}

// Example: 3-tier exit
const targets = calculatePartialTakeProfits(100, 95, [
  { rMultiple: 1, percent: 0.33 },  // Exit 33% at $105
  { rMultiple: 2, percent: 0.33 },  // Exit 33% at $110
  { rMultiple: 3, percent: 0.34 },  // Exit 34% at $115
], 'long');
```

---

## Portfolio Risk Controls

### Maximum Position Size

```typescript
/**
 * Enforce maximum position size as % of account
 */
function calculateLimitedPosition(
  accountBalance: number,
  maxPositionPercent: number,
  desiredSize: number,
  entryPrice: number
): number {
  const maxNotional = accountBalance * maxPositionPercent;
  const desiredNotional = desiredSize * entryPrice;

  const limitedNotional = Math.min(desiredNotional, maxNotional);
  return Math.floor(limitedNotional / entryPrice);
}

// Example: Account $10k, max position 20% = $2k
const position = calculateLimitedPosition(10000, 0.2, 500, 100); // 20 shares ($2000)
```

### Position Concentration Limit

```typescript
/**
 * Track position exposure across multiple strategies
 */
class PortfolioRiskManager {
  private positions: Map<string, { notional: number; account: string }> = new Map();
  private maxConcentration: number; // Max % of total capital in single position

  constructor(maxConcentrationPercent: number) {
    this.maxConcentration = maxConcentrationPercent;
  }

  canAddPosition(
    accountBalance: number,
    proposedNotional: number,
    existingTotalNotional: number
  ): boolean {
    const totalNotional = existingTotalNotional + proposedNotional;
    const concentration = proposedNotional / totalNotional;

    return concentration <= this.maxConcentration;
  }

  getTotalExposure(): number {
    return Array.from(this.positions.values())
      .reduce((sum, pos) => sum + pos.notional, 0);
  }
}
```

---

## Kelly Criterion

Mathematical formula for optimal bet sizing.

```typescript
/**
 * Calculate optimal position size using Kelly Criterion
 * Kelly formula: f* = (p * b - q) / b
 * where:
 *   p = probability of winning
 *   b = win/loss ratio (average win / average loss)
 *   q = 1 - p
 *
 * WARNING: Full Kelly is aggressive. Use fractional Kelly (0.5x or 0.25x)
 */
function calculateKellyFraction(
  winRate: number,
  winLossRatio: number,
  fractionalKelly: number = 0.25
): number {
  if (winLossRatio <= 0) return 0;

  const p = winRate;
  const q = 1 - p;
  const b = winLossRatio;

  const kelly = (p * b - q) / b;

  // Apply fractional Kelly for safety
  const fractional = kelly * fractionalKelly;

  return Math.max(0, fractional); // Never negative
}

/**
 * Calculate Kelly-based position size with volatility adjustment
 */
function calculateKellyPosition(
  accountBalance: number,
  winRate: number,
  winLossRatio: number,
  currentPrice: number,
  volatility: number,
  options: {
    maxPositionPercent?: number;
    fractionalKelly?: number;
    volatilityPenalty?: number;
  } = {}
): {
  size: number;
  confidence: number;
  riskPercent: number;
} {
  const {
    maxPositionPercent = 0.02,
    fractionalKelly = 0.25,
    volatilityPenalty = 2,
  } = options;

  // Base Kelly fraction
  const baseKelly = calculateKellyFraction(winRate, winLossRatio, fractionalKelly);

  // Volatility adjustment: reduce size in volatile markets
  const volatilityAdjustment = Math.max(0.5, 1 - volatility * volatilityPenalty);

  // Final risk percentage
  const riskPercent = baseKelly * volatilityAdjustment * maxPositionPercent;

  // Position size in units
  const positionValue = accountBalance * riskPercent;
  const size = positionValue / currentPrice;

  return {
    size: Math.floor(size),
    confidence: winRate * volatilityAdjustment,
    riskPercent,
  };
}

// Example usage:
const position = calculateKellyPosition(10000, 0.6, 1.5, 100, 0.02);
// size: 18 shares, confidence: 0.54, riskPercent: 0.45%
```

---

## Drawdown Protection

```typescript
/**
 * Monitor and limit drawdown
 */
function checkDrawdown(
  currentBalance: number,
  peakBalance: number,
  maxDrawdownPercent: number = 0.10
): { exceeded: boolean; drawdownPercent: number } {
  const drawdown = (peakBalance - currentBalance) / peakBalance;
  const exceeded = drawdown > maxDrawdownPercent;

  return {
    exceeded,
    drawdownPercent: drawdown,
  };
}

/**
 * Circuit breaker: stop trading after drawdown threshold
 */
function shouldStopTrading(
  currentBalance: number,
  peakBalance: number,
  maxDrawdownPercent: number,
  minTimeBetweenResets: number,
  lastResetTime: number
): {
  shouldStop: boolean;
  reason?: string;
} {
  const { exceeded, drawdownPercent } = checkDrawdown(
    currentBalance,
    peakBalance,
    maxDrawdownPercent
  );

  if (exceeded) {
    return {
      shouldStop: true,
      reason: `Max drawdown hit: ${(drawdownPercent * 100).toFixed(2)}%`,
    };
  }

  const timeSinceReset = Date.now() - lastResetTime;
  if (timeSinceReset < minTimeBetweenResets) {
    return {
      shouldStop: true,
      reason: `Minimum time between resets not met: ${Math.floor(timeSinceReset / 1000)}s`,
    };
  }

  return { shouldStop: false };
}
```

---

## Daily Loss Limits

```typescript
/**
 * Track and enforce daily loss limits
 */
class DailyLossLimiter {
  private dailyPnL: number = 0;
  private dailyStartTime: number;
  private dailyLossLimit: number;
  private resetThreshold: number; // When to reset daily stats

  constructor(dailyLossLimit: number, resetThreshold?: number) {
    this.dailyLossLimit = dailyLossLimit;
    this.dailyStartTime = Date.now();
    this.resetThreshold = resetThreshold ?? 24 * 60 * 60 * 1000; // 24 hours
  }

  recordPnL(pnl: number): void {
    this.dailyPnL += pnl;
  }

  checkLimit(): { hit: boolean; remaining: number; pnl: number } {
    const remaining = this.dailyLossLimit - Math.abs(this.dailyPnL);
    const hit = this.dailyPnL <= -this.dailyLossLimit;

    return {
      hit,
      remaining: Math.max(0, remaining),
      pnl: this.dailyPnL,
    };
  }

  shouldHaltTrading(): boolean {
    const { hit } = this.checkLimit();
    return hit;
  }

  /**
   * Check if we should reset daily stats
   */
  shouldReset(): boolean {
    const elapsed = Date.now() - this.dailyStartTime;
    return elapsed >= this.resetThreshold;
  }

  reset(): void {
    this.dailyPnL = 0;
    this.dailyStartTime = Date.now();
  }
}

// Usage:
const limiter = new DailyLossLimiter(500); // $500 daily loss limit

// Each trade:
limiter.recordPnL(trade.pnl);

// Before taking new trade:
if (limiter.shouldHaltTrading()) {
  // Stop trading for the day
  logger.warn('Daily loss limit hit, halting');
}
```

---

## Volatility Adjustment

Scale position size based on market volatility.

```typescript
/**
 * Adjust position size inversely with volatility
 */
function calculateVolatilityAdjustedPosition(
  basePosition: number,
  volatility: number,
  referenceVolatility: number,
  minAdjustment: number = 0.25,
  maxAdjustment: number = 1.0
): number {
  // Ratio: lower volatility = larger size
  const volatilityRatio = referenceVolatility / Math.max(volatility, 0.001);

  // Normalize to adjustment factor
  const adjustment = Math.max(minAdjustment, Math.min(maxAdjustment, volatilityRatio));

  return Math.floor(basePosition * adjustment);
}

// Example:
// Base position: 100 shares
// Current vol: 5%, Reference: 2%
// Adjustment = 2/5 = 0.4x
// Final position = 40 shares
```

---

## Complete Risk Manager Example

```typescript
class RiskManager {
  private accountBalance: number;
  private peakBalance: number;
  private maxPositionPercent: number;
  private maxDailyLoss: number;
  private maxDrawdownPercent: number;
  private dailyPnL: number = 0;
  private dailyResetTime: number;

  constructor(config: {
    accountBalance: number;
    maxPositionPercent?: number;
    maxDailyLoss?: number;
    maxDrawdownPercent?: number;
  }) {
    this.accountBalance = config.accountBalance;
    this.peakBalance = config.accountBalance;
    this.maxPositionPercent = config.maxPositionPercent ?? 0.02;
    this.maxDailyLoss = config.maxDailyLoss ?? 500;
    this.maxDrawdownPercent = config.maxDrawdownPercent ?? 0.10;
    this.dailyResetTime = Date.now();
  }

  canEnterTrade(
    entryPrice: number,
    stopLossPrice: number,
    currentVolatility: number
  ): { allowed: boolean; reasons: string[]; positionSize: number } {
    const reasons: string[] = [];

    // 1. Check daily loss limit
    if (Math.abs(this.dailyPnL) >= this.maxDailyLoss) {
      reasons.push('Daily loss limit hit');
      return { allowed: false, reasons, positionSize: 0 };
    }

    // 2. Check drawdown
    const drawdown = (this.peakBalance - this.accountBalance) / this.peakBalance;
    if (drawdown >= this.maxDrawdownPercent) {
      reasons.push(`Max drawdown hit: ${(drawdown * 100).toFixed(2)}%`);
      return { allowed: false, reasons, positionSize: 0 };
    }

    // 3. Calculate position size
    const riskAmount = this.accountBalance * this.maxPositionPercent;
    const riskPerUnit = Math.abs(entryPrice - stopLossPrice);

    if (riskPerUnit === 0) {
      reasons.push('Invalid stop-loss (same as entry)');
      return { allowed: false, reasons, positionSize: 0 };
    }

    let positionSize = Math.floor(riskAmount / riskPerUnit);

    // 4. Volatility adjustment
    const volatilityAdjustment = Math.max(0.25, 1 - currentVolatility * 2);
    positionSize = Math.floor(positionSize * volatilityAdjustment);

    // 5. Position notional limit
    const notional = positionSize * entryPrice;
    if (notional > this.accountBalance * 0.5) {
      reasons.push('Position exceeds 50% of account');
      positionSize = Math.floor((this.accountBalance * 0.5) / entryPrice);
    }

    return { allowed: true, reasons, positionSize };
  }

  recordTrade(pnl: number): void {
    this.dailyPnL += pnl;
    this.accountBalance += pnl;
    this.peakBalance = Math.max(this.peakBalance, this.accountBalance);
  }

  resetDailyLimitsIfNeeded(): void {
    const elapsed = Date.now() - this.dailyResetTime;
    if (elapsed >= 24 * 60 * 60 * 1000) {
      this.dailyPnL = 0;
      this.dailyResetTime = Date.now();
    }
  }
}
```

---

## Best Practices

1. **Always define stop-loss before entry** - Know your risk upfront
2. **Position size first** - Calculate size based on risk, not arbitrary units
3. **Use volatility-adjusted stops** - Wider stops in volatile markets
4. **Monitor portfolio concentration** - Don't over-allocate to single position
5. **Implement daily loss limits** - Prevents blow-up
6. **Track peak balance for drawdown** - Reset only on new all-time high
7. **Log all risk metrics** - Essential for debugging and optimization

---

## Testing

```typescript
describe('Risk Management', () => {
  it('calculates position size correctly', () => {
    const size = calculateFixedRiskPosition(10000, 0.01, 100, 95);
    expect(size).toBe(200);
  });

  it('throws on zero risk per unit', () => {
    expect(() => calculateFixedRiskPosition(10000, 0.01, 100, 100))
      .toThrow('Risk per unit cannot be zero');
  });

  it('respects daily loss limit', () => {
    const limiter = new DailyLossLimiter(500);
    limiter.recordPnL(-300);
    expect(limiter.shouldHaltTrading()).toBe(false);

    limiter.recordPnL(-250);
    expect(limiter.shouldHaltTrading()).toBe(true);
  });
});
```

---

## References

- `docs/code-snippets/technical-indicators.md` - Indicator calculations
- `src/utils/risk-manager.ts` - Production risk management
- `src/strategies/examples/05-risk-managed-kelly-strategy.ts` - Complete example
- `docs/api-reference.md` - RiskManager API
