# Phase 5: Competitive Agent Simulation

**Goal:** Run simulations with heterogeneous populations (market makers, arbitrageurs, trend followers) and study competitive dynamics.

## Agent Population Manager

```python
class AgentPopulation:
    def __init__(self):
        self.agents: Dict[AgentId, AgentConfig] = {}
        self.performance: Dict[AgentId, PerformanceStats] = {}
    
    def spawn_agent(agent_type, initial_capital, strategy_config) -> AgentId
    def deactivate_agent(agent_id, reason) -> None
    def get_top_performers(n) -> List[AgentId]
    def adjust_capital_allocation(agent_id, factor) -> None
```

## Scenarios

### Scenario 1: Liquidity Market
- 10 market makers with different spread parameters
- No exogenous noise traders
- Measure: spread distribution, agent profitability convergence

### Scenario 2: Arbitrage Competition
- 5 cross-exchange arbitrageurs
- Price discrepancies injected artificially
- Measure: arb elimination speed, profit decay

### Scenario 3: Mixed Market
- 3 market makers
- 2 arbitrage agents
- 5 trend-following agents (noise)
- Measure: overall market quality (spread, volatility)

### Scenario 4: Survival of the Fittest
- Start with 20 random agents
- Bottom 25% replaced each week with top-performer clones (mutation rate 5%)
- Measure: strategy evolution, market adaptation

## Files to Create

- `rl/simulation/agent_population.py`
- `rl/simulation/scenario_runner.py`
- `rl/simulation/scenarios/` directory:
  - `basic_liquidity.py`
  - `arbitrage_competition.py`
  - `mixed_market.py`
  - `evolutionary.py`
- `rl/tests/test_agent_population.py`
- `scripts/run_simulation.py` - CLI for batch runs

## Simulation Harness

```bash
python -m rl.cli.main simulate \
  --scenario mixed_market \
  --agents market_maker:5,arbitrage:2,trend:5 \
  --episodes 100 \
  --seed 42 \
  --output results.json
```

## Success Criteria

- [ ] Scenario runner completes 100 episodes without crashes
- [ ] Population manager handles agent spawn/death correctly
- [ ] Mixed scenario produces stable equilibrium (spread doesn't diverge)
- [ ] Evolutionary scenario shows performance improvement over generations
- [ ] Results reproducible with fixed seed

## Metrics to Collect

Per-agent: final P&L, Sharpe, max DD, win rate, trade count
Per-episode: total volume, avg spread, volatility, order book depth
Per-simulation: Gini coefficient of agent wealth, market quality index
