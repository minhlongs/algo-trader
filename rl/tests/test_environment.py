"""Tests for MarketEnv, ActionSpace, StateBuilder, and RewardCalculator."""

import pytest
import numpy as np
from rl.environment import MarketEnv, DiscreteActionSpace, ContinuousActionSpace
from rl.environment.reward import RewardCalculator
from rl.types import EpisodeHistory, Position, AccountInfo, MarketData, Observation
from rl.config import RLConfig

def test_discrete_action_space(sample_config):
    """Test discrete action space sampling and decoding."""
    space = DiscreteActionSpace(n_position_levels=5)
    assert space.n_actions == 11  # hold + 5 buy levels + 5 sell levels

    # Test sampling
    for _ in range(10):
        action = space.sample()
        assert 0 <= action < space.n_actions

    # Test decode
    hold = space.decode(0)
    assert hold.action_type == 0 and hold.position_size == 0.0

    buy_level1 = space.decode(1)
    assert buy_level1.action_type == 1 and buy_level1.position_size == pytest.approx(0.2)

    sell_level3 = space.decode(8)  # 5+3
    assert sell_level3.action_type == 2 and sell_level3.position_size == pytest.approx(0.6)

    # Test encode
    idx = space.encode(1, 0.4)
    assert idx == 2  # 0.4 -> level 2
    idx = space.encode(2, 0.6)
    assert idx == 5 + 3  # 5 (base) + level 3

def test_continuous_action_space(sample_config):
    """Test continuous action space sampling and decoding."""
    space = ContinuousActionSpace(position_limit=1.0)
    # Sample
    action = space.sample()
    assert isinstance(action, np.ndarray)
    assert action.shape == (4,)
    assert np.all(action >= 0) and np.all(action <= 1)  # first three and pos limit

    # Test decode
    decoded = space.decode(np.array([0.1, 0.7, 0.2, 0.5]))
    assert decoded.action_type == 1  # buy has highest prob
    assert decoded.position_size == 0.5

    # Test encode
    encoded = space.encode(1, 0.8)
    assert encoded[1] == 1.0 and encoded[3] == 0.8

def test_market_env_creation(sample_config, data_loader):
    """Test environment can be created with data."""
    _, data = data_loader
    env = MarketEnv(config=sample_config, data=data)
    assert env.action_space is not None
    assert env.observation_space is not None

def test_market_env_reset(env):
    """Test environment reset returns valid observation."""
    obs, info = env.reset()
    assert isinstance(obs, np.ndarray)
    assert len(obs) == env.observation_space.shape[0]
    assert "step" in info
    assert "balance" in info

def test_market_env_step(env):
    """Test environment step with a random action."""
    env.reset()
    action = env.action_space.sample()
    obs, reward, terminated, truncated, info = env.step(action)
    assert isinstance(obs, np.ndarray)
    assert isinstance(reward, float)
    assert isinstance(terminated, bool)
    assert isinstance(truncated, bool)
    assert isinstance(info, dict)

def test_episode_termination(sample_config, data_loader):
    """Test that episode terminates on bankruptcy or max steps."""
    _, data = data_loader
    # Use a small max_episode_steps
    sample_config.max_episode_steps = 5
    env = MarketEnv(config=sample_config, data=data)
    env.reset()
    steps = 0
    while True:
        action = env.action_space.sample()
        _, _, terminated, truncated, _ = env.step(action)
        steps += 1
        if terminated or truncated:
            break
    assert steps <= 5  # Should not exceed max steps

def test_reward_calculator_sharpe():
    """Test Sharpe ratio reward calculation."""
    history = EpisodeHistory()
    calculator = RewardCalculator(reward_type="sharpe", reward_scale=1.0)
    # Simulate some returns
    returns = [0.001, 0.002, -0.001, 0.003, -0.002]
    for r in returns:
        reward = calculator.calculate(history, r)
        # After few steps, Sharpe should be computed
    assert len(history.returns) == len(returns)

def test_reward_calculator_pnl():
    """Test raw P&L reward."""
    history = EpisodeHistory()
    calculator = RewardCalculator(reward_type="pnl", reward_scale=1.0)
    reward = calculator.calculate(history, 0.01)
    assert reward == pytest.approx(10.0)  # 0.01 * 1000

def test_observation_consistency(env):
    """Test that observation vector size matches declared space."""
    obs, _ = env.reset()
    assert len(obs) == env.observation_space.shape[0]
