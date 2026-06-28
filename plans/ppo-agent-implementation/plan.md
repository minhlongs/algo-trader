# PPO Agent Implementation Plan

**Objective:** Create a standardized agent abstraction layer with a PPO-based trading agent for the RL framework.

## Phases

| Phase | Name | Status | Duration | Dependencies |
|-------|------|--------|----------|--------------|
| 1 | Base Agent Interface | pending | 1 day | None |
| 2 | PPOAgent Implementation | pending | 1 day | Phase 1 |
| 3 | Agent Registry | pending | 0.5 day | Phase 2 |
| 4 | Tests & Validation | pending | 1 day | Phase 1-3 |

Total: ~3 days

## Phase 1: Base Agent Interface

**Goal:** Define abstract `Agent` base class with clean, type-safe interface.

- [ ] Define `AgentConfig` dataclass in `rl/types.py`
- [ ] Create `rl/agents/base_agent.py` with abstract methods
- [ ] Document interface with docstrings and examples
- [ ] Write unit tests for base class contract

**Files:**
- `rl/agents/base_agent.py` (new)
- `rl/types.py` (extend)
- `rl/tests/test_base_agent.py` (new)

**Success:** `Agent` abstract class defines clear contract; no implementation, just interface.

## Phase 2: PPOAgent Implementation

**Goal:** Implement concrete PPOAgent that wraps `PPOTrainer` with trading-specific defaults.

- [ ] Create `rl/agents/ppo_agent.py`
- [ ] Define `PPOAgentConfig` (extends `AgentConfig`, adds PPO-specific params)
- [ ] Implement `__init__`, `act`, `train`, `evaluate`, `save`, `load`, `reset`
- [ ] Handle both `Observation` dataclass and raw vector inputs
- [ ] Add input validation at boundaries (observation shape, etc.)
- [ ] Write comprehensive unit tests

**Files:**
- `rl/agents/ppo_agent.py` (new)
- `rl/tests/test_ppo_agent.py` (new)

**Success:** PPOAgent can be instantiated with defaults, acts on observations, trains without errors.

## Phase 3: Agent Registry

**Goal:** Provide registry pattern for easy agent instantiation from config.

- [ ] Create `rl/agents/agent_registry.py`
- [ ] Implement `register_agent(name, cls)` decorator
- [ ] Implement `create_agent(name, config)` factory
- [ ] Register `PPOAgent` by default
- [ ] Write unit tests for registry

**Files:**
- `rl/agents/agent_registry.py` (new)
- `rl/tests/test_agent_registry.py` (new)
- `rl/agents/__init__.py` (update exports)

**Success:** `create_agent("ppo", config)` returns PPOAgent instance.

## Phase 4: Tests & Validation

**Goal:** Comprehensive testing, type checking, and documentation.

- [ ] Integration test: train PPOAgent on sample data, evaluate
- [ ] Type check: `mypy rl/agents/` passes (no `Any`)
- [ ] Coverage: `pytest --cov=rl/agents` ≥80%
- [ ] Performance: agent.act() latency <1ms (single step)
- [ ] Update `rl/README.md` with agent usage examples
- [ ] Create example script: `scripts/run_ppo_agent_demo.py`

**Files:**
- `rl/tests/test_agents_integration.py` (new)
- `scripts/run_ppo_agent_demo.py` (new)
- `rl/README.md` (update)

**Success:** All tests pass, type check clean, demo script runs end-to-end.

## Acceptance Criteria

- [ ] `pytest rl/tests/test_*agent*.py` all pass
- [ ] `mypy rl/agents/` passes with 0 errors
- [ ] Test coverage ≥80% for `rl/agents/` module
- [ ] No `Any` types in agent public APIs
- [ ] PPOAgent can train 1000 steps without crashing
- [ ] Registry can create agents from string name
- [ ] Documentation updated with examples

## Dependencies

- Existing: `rl.algorithms.ppo_trainer.PPOTrainer`
- Existing: `rl.types.Observation`, `TradingAction`, `TrainingConfig`
- Existing: `rl.environment.MarketEnv`

## Risks

**Risk:** Agent interface mismatches multi-agent needs
**Mitigation:** Keep interface minimal; review against multi-agent plan's `AgentState`.

**Risk:** PPO hyperparameters not suited for trading
**Mitigation:** Use conservative defaults; allow full config override.

## File Ownership

**New Files:**
- `rl/agents/__init__.py`
- `rl/agents/base_agent.py`
- `rl/agents/ppo_agent.py`
- `rl/agents/agent_registry.py`
- `rl/tests/test_base_agent.py`
- `rl/tests/test_ppo_agent.py`
- `rl/tests/test_agent_registry.py`
- `rl/tests/test_agents_integration.py`
- `scripts/run_ppo_agent_demo.py`

**Modified Files:**
- `rl/types.py` (add `AgentConfig`)
- `rl/README.md` (add agent section)

---

**Status:** Ready for implementation
**Date:** 2026-06-21
