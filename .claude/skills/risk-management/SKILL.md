---
name: risk-management
description: "Risk management for algo-trader. Covers Kelly Criterion, drawdown protection, position sizing, portfolio risk limits, circuit breakers, risk reporting. Triggers: risk, Kelly Criterion, drawdown, position sizing, portfolio risk, circuit breaker, risk limit, drawdown protection, risk report, exposure, loss streak, volatility circuit breaker"
---

# Risk Management Skill

## Purpose

Guide risk management operations: position sizing, drawdown protection, circuit breakers, portfolio limits, and risk reporting for algo-trader's live and paper trading.

## Codebase Layout

```
src/risk/
  kelly-position-sizer.ts       # Kelly Criterion position sizing
  drawdown-monitor.ts           # Daily/total drawdown tracking + halt
  circuit-breaker.ts            # Anomaly-based trading halt (loss streak, volatility)
  position-manager.ts           # Per-symbol/exposure tracking + limits
  index.ts                      # Barrel export
src/risk/__tests__/
  kelly-position-sizer.test.ts
  risk.test.ts
  tiered-drawdown-breaker.test.ts
src/polymarket/
  kelly-position-sizer.ts       # Polymarket-specific Kelly (uses CLOB prices)
src/wiring/
  qwen-drawdown-monitor.ts      # Qwen live eligibility gate (drawdown-based)
src/resilience/
  circuit-breaker.ts            # Generic circuit breaker (infrastructure)
```

## Kelly Criterion (src/risk/kelly-position-sizer.ts)

**Formula:** `f* = (p*b - q) / b` where p=win prob, q=loss prob, b=win/loss ratio

**Configuration:**
```typescript
interface KellyConfig {
  kellyFraction: number;        // 0.1-0.5, default 0.25 (quarter-Kelly)
  maxPositionFraction: number;  // default 0.05 (5% max per position)
  minPositionUsd: number;       // default $10
  isManagedCapital: boolean;    // caps fraction at 0.25
}
```

**Managed capital rule:** When `isManagedCapital=true`, fraction hard-capped at 0.25 regardless of config.

**Result:** `KellySizingResult { positionSizeUsd, kellyRaw, kellyAdjusted, cappedByMax, cappedByManaged, fractionUsed, portfolioPercent }`

## Drawdown Protection (src/risk/drawdown-monitor.ts)

**Configuration:**
```typescript
interface DrawdownConfig {
  maxDailyDrawdown: number;     // default 0.05 (5%)
  maxTotalDrawdown: number;     // default 0.15 (15%)
  maxConsecutiveLoss: number;   // default 5
  haltOnBreach: boolean;        // default true
}
```

**Metrics tracked:**
- `currentDrawdown`, `maxDrawdown`, `peakValue`, `currentValue`
- `dailyPnl`, `dailyDrawdown`, `consecutiveLosses`, `isHalted`

**Alert types:** `daily | total | consecutive` with threshold/current/triggeredAt

## Circuit Breaker (src/risk/circuit-breaker.ts)

Trading halt on anomalies:
```typescript
interface CircuitBreakerConfig {
  maxLossStreak: number;        // default 3
  maxLatencyMs: number;         // default 1000
  maxVolatilityPercent: number; // default 5.0
  cooldownMs: number;           // default 300000 (5 min)
  maxDailyDrawdown: number;     // default 0.05
}
```

**States:** `CLOSED | OPEN | HALF_OPEN`

**Triggers:**
- Consecutive losses exceed `maxLossStreak`
- Execution latency exceeds `maxLatencyMs`
- Volatility spike exceeds `maxVolatilityPercent`
- Daily drawdown exceeds `maxDailyDrawdown`

**Recovery:** Half-open after `cooldownMs`, single probe attempt, full reopen on success.

## Position Management (src/risk/position-manager.ts)

**Limits:**
```typescript
interface PositionConfig {
  maxPositionPerSymbol: number;
  maxPositionPerExchange: number;
  maxTotalExposure: number;
  maxLongExposure: number;
  maxShortExposure: number;
}
```

**Validation:** `PositionValidation { valid, reason?, currentExposure, newExposure }`

## Qwen Drawdown Gate (src/wiring/qwen-drawdown-monitor.ts)

Prevents live trading when drawdown exceeds threshold:
- `isQwenEnabled()` — returns false if drawdown breach
- `isKillSwitchActive()` — emergency halt flag

## Risk Reporting

### Key Metrics to Track
1. **Portfolio-level**: total exposure, net exposure, long/short ratio
2. **Per-strategy**: win rate, avg win/loss, max consecutive losses
3. **Per-position**: unrealized PnL, time-in-position, distance to stop-loss
4. **System-level**: circuit breaker state, drawdown status, halt reason

### Risk Dashboard Integration
Health endpoint (`src/api/routes/health.ts`) reports:
- Redis status, PostgreSQL status, trading engine status
- Paper trading mode flag (`DRY_RUN` env)
- Circuit breaker state

## Risk Limits Reference

| Limit | Default | Source |
|-------|---------|--------|
| Max position per trade | 5% portfolio | `kelly-position-sizer.ts` |
| Kelly fraction | 0.25 (quarter) | `kelly-position-sizer.ts` |
| Daily drawdown halt | 5% | `drawdown-monitor.ts` |
| Total drawdown halt | 15% | `drawdown-monitor.ts` |
| Max consecutive losses | 5 | `drawdown-monitor.ts` |
| Loss streak circuit breaker | 3 | `circuit-breaker.ts` |
| Max latency | 1000ms | `circuit-breaker.ts` |
| Max volatility spike | 5% | `circuit-breaker.ts` |
| Cooldown period | 5 min | `circuit-breaker.ts` |

## References

- `references/kelly-implementation.md` — Kelly Criterion math and edge cases
- `references/circuit-breaker-patterns.md` — Circuit breaker state machines
- `references/risk-reporting.md` — Risk report formats and metrics
