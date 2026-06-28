# Phase 1: Multi-Agent Environment Foundation

**Context:** Build foundation for multi-agent simulations with shared order book and coordinated agent actions.

## Requirements

### Functional Requirements
1. Extend Gymnasium environment to support N agents with shared state
2. Implement limit order book with matching engine
3. Support agent actions: market orders, limit orders, cancellations
4. Per-agent observations with configurable market visibility
5. Per-agent rewards based on individual P&L
6. Agent lifecycle: add/remove agents mid-episode

### Non-Functional Requirements
- Type-safe, no `any` types
- ≤200 lines per file
- Unit test coverage ≥80%
- Deterministic with seed control
- Performance: 1000+ steps/sec

## Architecture

**Multi-agent coordination pattern:**
- Centralized training (single env), decentralized execution (independent agents)
- Joint observation space: (N_agents, obs_dim)
- Joint action space: list of per-agent actions
- Reward vector: (N_agents,)

**Order Book Design:**
- Price levels sorted (bid descending, ask ascending)
- O( log N ) order insertion/cancellation via sorted dict
- O(1) best bid/ask access
- Matching: price-time priority

**Key Classes:**
```python
class LimitOrderBook:
    add_order(order: LimitOrder) -> OrderId
    cancel_order(order_id: OrderId) -> bool
    match_market_order(market_order: MarketOrder) -> List[Trade]
    get_state() -> OrderBookState

class MultiAgentMarketEnv(gym.Env):
    reset() -> obs_dict
    step(actions) -> obs_dict, rewards, dones, info
    add_agent(agent_id, config) -> None
    remove_agent(agent_id) -> None
```

## Implementation Steps

1. Create `rl/environment/order_book.py` with `LimitOrderBook` class
2. Create `rl/environment/agent_state.py` with `AgentState` dataclass
3. Extend `rl/types.py` with multi-agent types
4. Create `rl/environment/multi_agent_env.py` with main environment
5. Update `rl/config/config.py` with `MultiAgentConfig`
6. Write unit tests for each component
7. Integration test: 3 agents trading simultaneously
8. Performance benchmark: measure steps/sec

## Files to Modify

### New Files
- `rl/environment/order_book.py`
- `rl/environment/agent_state.py`
- `rl/environment/multi_agent_env.py`
- `rl/tests/test_order_book.py`
- `rl/tests/test_multi_agent_env.py`

### Modified Files
- `rl/types.py` (extend)
- `rl/config/config.py` (add MultiAgentConfig)
- `rl/tests/conftest.py` (add fixtures)

## Success Criteria

- [ ] All tests pass (≥80% coverage)
- [ ] Order book matching verified against known scenarios
- [ ] 5-agent simulation runs at >1000 steps/sec
- [ ] Deterministic: same seed → identical results
- [ ] No type errors in mypy

## Risks

**Risk:** Order book state inconsistencies with concurrent access
**Mitigation:** Single-threaded event loop, atomic operations

**Risk:** Memory leaks with many agents
**Mitigation:** Proper cleanup in `remove_agent()`, weak references if needed

## Testing Strategy

1. **Unit tests** (order book):
   - Add bid/ask, verify best bid/ask updates
   - Cancel order, verify removal
   - Market buy order matches with best ask
   - Partial fills, price-time priority

2. **Integration test**:
   - 2 agents: one market maker (limit orders), one taker (market orders)
   - Verify trades occur, P&L tracked correctly
   - Episode terminates after 100 steps

3. **Performance test**:
   - 10 agents, 10,000 steps
   - Measure time, compute steps/sec
   - Should exceed 1000 steps/sec

## Acceptance Checklist

- [ ] `pytest rl/tests/test_order_book.py -v` passes
- [ ] `pytest rl/tests/test_multi_agent_env.py -v` passes
- [ ] `mypy rl/environment/multi_agent_env.py` passes
- [ ] `pytest --cov=rl/environment` shows ≥80% coverage
- [ ] Example script `scripts/run_multi_agent_demo.py` runs without errors
