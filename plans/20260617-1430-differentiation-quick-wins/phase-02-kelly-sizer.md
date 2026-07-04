# Phase 2: Kelly Position Sizer

**Priority:** High (risk management)
**Status:** Ready
**Group:** B

## Context

Current position sizing: fixed fractional (2% per trade) hoặc simple martingale. Cần dynamic sizing dựa trên Kelly Criterion để tối ưu growth rate và tránh ruin.

## Target Files

- `src/risk/kelly-position-sizer.ts` (new)
- `src/risk/position-sizer.ts` (modify - integrate as default)

## Kelly Formula

**Basic:**
```
f* = (winRate * (1 + edge) - 1) / edge
```
where:
- `winRate` = historical win rate (0-1)
- `edge` = average win / average loss (positive expectancy)

**Correlation-adjusted:**
```
f_adj = f* * (1 - avg_correlation_with_open_positions)
```

**Conservative cap:**
```
positionSize = min(f_adj, 0.25) * bankroll
```

## Implementation Steps

1. **Create `kelly-position-sizer.ts`:**
   ```typescript
   export interface KellyInput {
     winRate: number;        // 0-1
     edge: number;           // R:R ratio, >0
     bankroll: number;
     correlation?: number;   // 0-1, optional
   }
   export function calculateKellyPosition(input: KellyInput): number {
     // Apply formula with safety checks
     // Return position size in currency units
   }
   export function fractionalKelly(input: KellyInput, fraction: number = 0.5): number {
     // Half-Kelly for reduced volatility
   }
   ```

2. **Create backtest module (separate):**
   - `src/risk/backtests/kelly-vs-fixed.backtest.ts`
   - Simulate 1000 trades với winRate=55%, edge=2:1, bankroll=$10k
   - Compare final wealth, max drawdown, Sharpe ratio
   - Expected: Kelly 20-40% better Sharpe vs fixed 2%

3. **Integrate vào `position-sizer.ts`:**
   - Add `calculatePosition()` method sử dụng Kelly by default
   - Config: `positionSizing: 'kelly' | 'fixed' | 'martingale'`
   - Fallback to fixed 2% nếu insufficient trade history

4. **Testing:**
   - Unit tests: Kelly formula edge cases (winRate=0, edge=0, negative)
   - Backtest integration test: verify simulated improvement
   - Regression: ensure existing strategy tests pass (strategies đang dùng fixed sizing)

5. **Metrics:**
   - `position_sizer_kelly_fraction` histogram (distribution of f*)
   - `position_sizer_size_vs_fixed` ratio gauge
   - `risk_correlation_adjustment` histogram

## Acceptance Criteria

- [ ] Kelly formula matches standard definition (学术验证)
- [ ] Backtest shows Sharpe improvement ≥20% vs fixed 2%
- [ ] Max position cap 25% enforced
- [ ] Correlation adjustment reduces exposure during high correlation
- [ ] Unit test coverage ≥90%
- [ ] No breaking changes to existing `position-sizer.ts` API

## Risks

- **Overfitting:** Kelly dựa trên historical params có thể không generalize. Mitigation: use rolling 30-trade window, minimum 50 trades before applying.
- **High variance:** Kelly có thể gợi ý 0% hoặc very large nếu edge cao. Cap at 25% và minimum 0.5% để tránh extreme sizing.
- **Correlation data:** Cần correlation matrix giữa all traded markets. Nếu thiếu, skip adjustment (correlation=0).

## Related

- Phase 1 (HTTP/2) — independent
- Phase 3 (Scanner) — independent
- Existing risk module: `src/risk/` có `risk-manager.ts`, `position-limits.ts`