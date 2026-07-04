# Phase 3: Arbitrage Agent Implementation

**Goal:** Implement agent that detects and executes arbitrage opportunities (cross-market, triangular, statistical).

## Arbitrage Types

1. **Cross-Exchange Arbitrage**: Same asset on different exchanges (Binance vs OKX)
2. **Triangular Arbitrage**: Three-leg cycle within single exchange (BTC→ETH→USDT→BTC)
3. **Statistical Arbitrage**: Pairs trading, mean reversion on correlated assets

## Components

### ArbitrageDetector
```python
class ArbitrageDetector:
    detect_cross_exchange(bids, asks, fees) -> List[ArbOpportunity]
    detect_triangular(order_books, base_asset) -> List[TriArbOpportunity]
    detect_statistical(prices, window=20) -> List[StatArbOpportunity
```

### ArbitrageAgent
- Observation: prices across markets, own inventory, recent arb opportunities
- Action: for each detected arb, decide: execute (True/False) or skip
- Multi-leg coordination: all legs must execute simultaneously or none
- Latency modeling: arb window closes after X ms (realistic)

### Reward
```
reward = realized_pnl - execution_cost - slippage_penalty - missed_opp_cost
```

## Files to Create

- `rl/agents/arbitrage_agent.py`
- `rl/agents/arbitrage_detector.py`
- `rl/environment/reward_arbitrage.py`
- `rl/tests/test_arbitrage_agent.py`
- `rl/tests/test_arbitrage_detector.py`

## Tests

1. **Cross-exchange detection**: BTC $50,000 on Binance, $50,100 on OKX → detect $100 arb (net of fees)
2. **Triangular cycle**: BTC→ETH→BNB→BTC yields 0.5% → detect
3. **Execution simulation**: All legs match or full rollback
4. **Latency sensitivity**: Higher latency → fewer arbs executed

## Success Criteria

- [ ] Detects cross-exchange arbs with >90% accuracy (labeled dataset)
- [ ] Triangular arb detection finds profitable cycles
- [ ] Execution success rate >95% (slippage-controlled)
- [ ] Overall Sharpe > 2.0 on arbitrage-focused backtest
