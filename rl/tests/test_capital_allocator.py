"""Tests for Capital Allocator module."""

import pytest
import numpy as np
from datetime import datetime
from rl.training.capital_allocator import CapitalAllocator, CapitalAllocationConfig, AllocationAction

def test_capital_allocator_initialization():
    """Test allocator initializes with first stage."""
    config = CapitalAllocationConfig(
        total_capital=100000.0,
        allocation_stages=[0.01, 0.05, 0.10]
    )
    allocator = CapitalAllocator(config=config)

    assert allocator.current_allocation_pct == 0.01
    assert allocator.allocated_capital == 1000.0
    assert allocator.available_capital == 99000.0
    assert allocator.stage_index == 0

def test_allocation_increase_on_good_performance():
    """Test allocation increases when Sharpe threshold met."""
    config = CapitalAllocationConfig(
        total_capital=100000.0,
        allocation_stages=[0.01, 0.05, 0.10],
        sharpe_threshold_up=1.5,
        cooldown_period=0  # disable for test
    )
    allocator = CapitalAllocator(config=config)

    # Simulate good performance
    allocator.update_performance(sharpe_ratio=2.0, max_drawdown=0.05, recent_returns=[0.001] * 10)
    decision = allocator.evaluate({'sharpe_ratio': 2.0, 'max_drawdown': 0.05})

    assert decision.adjusted
    assert decision.reason == "performance_up"
    assert allocator.current_allocation_pct == 0.05
    assert allocator.stage_index == 1

def test_allocation_decrease_on_poor_performance():
    """Test allocation decreases when Sharpe below threshold."""
    config = CapitalAllocationConfig(
        total_capital=100000.0,
        allocation_stages=[0.05, 0.10],
        sharpe_threshold_down=0.5,
        cooldown_period=0
    )
    allocator = CapitalAllocator(config=config)
    allocator.current_allocation_pct = 0.10
    allocator.stage_index = 1
    allocator.allocated_capital = 10000.0
    allocator.available_capital = 90000.0

    # Simulate poor performance
    allocator.update_performance(sharpe_ratio=0.3, max_drawdown=0.12, recent_returns=[-0.001] * 10)
    decision = allocator.evaluate({'sharpe_ratio': 0.3, 'max_drawdown': 0.12})

    assert decision.adjusted
    assert decision.reason == "performance_down"
    assert allocator.current_allocation_pct == 0.05
    assert allocator.stage_index == 0

def test_drawdown_limit_triggers_decrease():
    """Test max drawdown limit forces allocation decrease."""
    config = CapitalAllocationConfig(
        total_capital=100000.0,
        allocation_stages=[0.05, 0.10],
        max_drawdown_limit=0.10,
        cooldown_period=0
    )
    allocator = CapitalAllocator(config=config)
    allocator.current_allocation_pct = 0.10
    allocator.stage_index = 1

    # Exceed drawdown limit
    allocator.update_performance(sharpe_ratio=1.0, max_drawdown=0.15, recent_returns=[])
    decision = allocator.evaluate({'sharpe_ratio': 1.0, 'max_drawdown': 0.15})

    assert decision.adjusted
    assert decision.reason == "performance_down"  # drawdown triggers decrease
    assert allocator.current_allocation_pct == 0.05

def test_cooldown_period_prevents_changes():
    """Test cooldown prevents frequent adjustments."""
    config = CapitalAllocationConfig(
        total_capital=100000.0,
        allocation_stages=[0.01, 0.05],
        cooldown_period=5
    )
    allocator = CapitalAllocator(config=config)

    # First adjustment
    allocator.current_step = 0
    allocator.update_performance(sharpe_ratio=2.0, max_drawdown=0.02, recent_returns=[0.001] * 5)  # 5 consecutive wins
    decision1 = allocator.evaluate({'sharpe_ratio': 2.0})
    assert decision1.adjusted
    allocator.current_step = 1
    allocator.last_adjustment_step = 1

    # Try immediate second adjustment (should be blocked)
    allocator.current_step = 2
    decision2 = allocator.evaluate({'sharpe_ratio': 2.0})
    assert not decision2.adjusted
    assert decision2.reason == "cooldown"

def test_consecutive_wins_required():
    """Test that consecutive wins are needed for increase."""
    config = CapitalAllocationConfig(
        total_capital=100000.0,
        allocation_stages=[0.01, 0.05],
        sharpe_threshold_up=1.5,
        consecutive_wins=3,
        cooldown_period=0
    )
    allocator = CapitalAllocator(config=config)

    # Only 2 positive returns (need 3)
    allocator.update_performance(sharpe_ratio=2.0, max_drawdown=0.02, recent_returns=[0.001, 0.002])
    decision = allocator.evaluate({'sharpe_ratio': 2.0})
    assert not decision.adjusted

    # Add third positive
    allocator.update_performance(sharpe_ratio=2.0, max_drawdown=0.02, recent_returns=[0.001, 0.002, 0.0015])
    decision = allocator.evaluate({'sharpe_ratio': 2.0})
    assert decision.adjusted

def test_get_allocation_summary():
    """Test summary generation."""
    config = CapitalAllocationConfig(total_capital=100000.0, allocation_stages=[0.01, 0.05])
    allocator = CapitalAllocator(config=config)
    allocator.current_allocation_pct = 0.05
    allocator.allocated_capital = 5000.0
    allocator.available_capital = 95000.0
    allocator.performance_history = [1.2, 1.3, 1.4]
    allocator.drawdown_history = [0.02, 0.025, 0.03]

    summary = allocator.get_allocation_summary()

    assert summary['total_capital'] == 100000.0
    assert summary['allocation_pct'] == 0.05
    assert summary['allocated_capital'] == 5000.0
    assert summary['current_stage'] == "2/2"
    assert summary['recent_sharpe'] == pytest.approx(1.3)

def test_save_allocation_history(tmp_path):
    """Test saving allocation history to CSV."""
    config = CapitalAllocationConfig(
        total_capital=100000.0,
        allocation_stages=[0.01, 0.05],
        cooldown_period=0
    )
    allocator = CapitalAllocator(config=config)

    # Make some decisions
    allocator.update_performance(sharpe_ratio=2.0, max_drawdown=0.02, recent_returns=[])
    allocator.evaluate({'sharpe_ratio': 2.0})  # increases to 5%

    csv_path = tmp_path / "alloc_history.csv"
    allocator.save_history(str(csv_path))

    assert csv_path.exists()
    import csv
    with open(csv_path, 'r') as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        assert len(rows) > 0
        assert 'allocation_pct' in rows[0]
