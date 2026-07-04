# Phase 4: Market Impact Modeling

**Goal:** Model how agent trades move prices and affect liquidity, creating realistic feedback loops.

## Impact Models

### Temporary Impact (Beneš-Kalimullin)
```python
temp_impact = η * (order_volume / market_depth) ^ α
```
- Decays over τ milliseconds
- Returns to baseline after absorption

### Permanent Impact (Almgren-Chriss)
```python
perm_impact = γ * (order_volume / ADV) ^ β
```
- Permanent price shift
- Aggregates over time

### Order Book Depletion
When market order hits:
- Decrease depth at that level
- If level exhausted, move to next
- Spread may widen as liquidity thins

## Implementation

Create `rl/environment/market_impact.py`:

```python
class MarketImpactModel:
    apply_market_order(order_book, volume, side) -> Tuple[float, ImpactResult]
    decay_impact(order_book, dt) -> None
    get_price_impact(baseline_price, executed_volume) -> float
```

Parameters calibrated from empirical literature:
- η = 0.01–0.1 (temporary impact coefficient)
- α = 0.5–0.7 (sublinear exponent)
- γ = 0.01–0.05 (permanent impact)
- β = 1.0 (linear for equities, 0.5 for crypto)

## Files to Create

- `rl/models/impact_functions.py` - Mathematical formulations
- `rl/environment/market_impact.py` - Main model
- `rl/environment/price_formation.py` - Integrate impact into price discovery
- `rl/tests/test_market_impact.py` - Validation tests

## Tests

1. **Single large buy**: 10% of visible depth → price moves up 0.2%
2. **Impact decay**: 1 second later, 50% of impact gone
3. **Cumulative impact**: Multiple buys → permanent shift
4. **Calibration check**: Parameters produce realistic numbers (0.01–0.5% for typical trades)

## Success Criteria

- [ ] Impact magnitudes align with literature (0.1–1% for 1% ADV trade)
- [ ] Decay half-life matches configurable τ
- [ ] Aggregate impact across agents visible in price chart
- [ ] Model doesn't destabilize simulation (no infinite price moves)
