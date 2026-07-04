# Phase 2: Market Making Agent Implementation

**Goal:** Build RL-based market maker that provides liquidity and profits from bid-ask spread.

## Core Components

### MarketMakingAgent Class
- Policy network outputs: bid_price_offset, ask_price_offset, bid_size, ask_size
- Inventory management: penalize large positions (mean-reverting inventory target)
- Observation features: order imbalance, mid-price, spread, volatility, agent's own inventory

### Reward Function
```python
reward = (
    spread_capture_pnl  # from filled quotes
    - inventory_penalty  # (inventory / max_inventory)^2 * penalty_coef
    - turnover_penalty  # excessive trading
    + fill_rate_bonus  # reward for providing liquidity
)
```

### Action Space (Continuous)
- `bid_offset`: relative to mid-price (-max_offset, +max_offset)
- `ask_offset`: relative to mid-price (-max_offset, +max_offset)
- `bid_size`: fraction of capital (0, 1)
- `ask_size`: fraction of capital (0, 1)

## Files to Create

- `rl/agents/base_agent.py` - Abstract base with `observe()`, `act()`, `reset()`
- `rl/agents/market_maker.py` - Market making implementation
- `rl/environment/reward_market_making.py` - MM-specific reward calculator
- `rl/environment/state_features.py` - Additional features (order imbalance, spread)
- `rl/tests/test_market_maker.py` - Unit tests

## Tests

1. **Market maker places quotes**: Verify bid < ask, sizes > 0
2. **Quotes get filled**: When agent hits bid, buyer takes bid → fill at bid price
3. **Inventory management**: Large long inventory → penalty increases
4. **Backtest against passive baseline**: Random quotes should lose money

## Success Criteria

- [ ] Market maker survives 1000-step episodes without bankruptcy
- [ ] Sharpe ratio > 1.0 on test set (vs random baseline < 0)
- [ ] Average spread capture > 0.05% per trade
- [ ] Inventory stays within ±20% of max position
