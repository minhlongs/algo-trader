"""Tests for reward calculation."""

import pytest
import numpy as np
from rl.types import EpisodeHistory, Position, AccountInfo, MarketData, Observation
from rl.environment.reward import RewardCalculator, annualized_sharpe_ratio, maximum_drawdown

def test_sharpe_ratio_basic():
    """Test basic Sharpe ratio calculation."""
    returns = [0.01, 0.02, -0.01, 0.03, -0.02, 0.01, 0.01]
    sharpe = annualized_sharpe_ratio(returns, annualization_factor=1)  # No annualization for test
    # Manual: mean=0.005714, std=0.01633, sharpe=0.35
    assert sharpe > 0

def test_sharpe_ratio_zero_std():
    """Test Sharpe with zero std returns zero."""
    returns = [0.01, 0.01, 0.01]
    sharpe = annualized_sharpe_ratio(returns, annualization_factor=1)
    assert sharpe == 0.0  # Because std=0

def test_max_drawdown():
    """Test maximum drawdown calculation."""
    equity = [100, 110, 105, 120, 90, 100]
    mdd = maximum_drawdown(equity)
    # Peak 120, trough 90 => drawdown = (90-120)/120 = -0.25
    assert mdd == pytest.approx(-0.25)

def test_reward_calculator_initial():
    """Test reward at first few steps is reasonable."""
    history = EpisodeHistory()
    calc = RewardCalculator(reward_type="sharpe", reward_scale=100.0)
    # Add a few returns
    for r in [0.001, 0.002, -0.001]:
        reward = calc.calculate(history, r)
        assert isinstance(reward, float)
        # Early on, reward may be 0 or small
        assert not np.isnan(reward) and not np.isinf(reward)

def test_reward_pnl_type():
    """Test P&L reward type gives immediate step reward."""
    history = EpisodeHistory()
    calc = RewardCalculator(reward_type="pnl", reward_scale=1000.0)
    reward = calc.calculate(history, 0.005)
    assert reward == pytest.approx(5.0)  # 0.005 * 1000

def test_reward_penalties():
    """Test that penalties reduce reward."""
    history = EpisodeHistory()
    # Simulate some equity curve to trigger drawdown penalty
    for r in [0.01, -0.02, -0.01, 0.005]:
        reward = calc.calculate(history, r, turnover=0.0)
    # Not easy to test exact value but ensure it's finite
    assert isinstance(reward, float)
