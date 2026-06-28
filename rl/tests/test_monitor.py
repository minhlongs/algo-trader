"""Tests for PerformanceMonitor module."""

import pytest
import numpy as np
from datetime import datetime, timedelta
from rl.evaluation.monitor import PerformanceMonitor

def test_monitor_initialization():
    """Test monitor initializes with returns."""
    returns = np.random.randn(100) * 0.001
    monitor = PerformanceMonitor(agent_returns=returns, window_size=50)

    assert len(monitor.agent_returns) == 100
    assert monitor.window_size == 50
    assert monitor.current_step == 0
    assert len(monitor.alerts) == 0

def test_rolling_metrics_computation():
    """Test rolling metrics are computed correctly."""
    np.random.seed(42)
    returns = np.random.randn(200) * 0.001 + 0.0005  # slight positive drift
    monitor = PerformanceMonitor(agent_returns=returns, window_size=100)

    metrics = monitor.compute_rolling_metrics()

    assert 'sharpe_ratio' in metrics
    assert 'max_drawdown' in metrics
    assert 'win_rate' in metrics
    assert metrics['sharpe_ratio'] > 0  # positive drift should give positive Sharpe

def test_monitor_update_tracks_history():
    """Test that update() adds to history."""
    returns = [0.001] * 50
    monitor = PerformanceMonitor(agent_returns=[], window_size=100)  # larger window to avoid trimming

    for i, r in enumerate(returns):
        monitor.update(agent_return=r, timestamp=datetime.now())

    assert len(monitor.agent_returns) == 50
    assert monitor.current_step == 50

def test_benchmark_comparison():
    """Test comparison to benchmark metrics."""
    np.random.seed(123)
    agent_returns = np.random.randn(100) * 0.001 + 0.001
    bench_returns = np.random.randn(100) * 0.001

    monitor = PerformanceMonitor(agent_returns=list(agent_returns))
    comp = monitor.compare_to_benchmark('bench', list(bench_returns))

    assert 'agent_sharpe' in comp
    assert 'benchmark_sharpe' in comp
    assert 'sharpe_diff' in comp
    assert 'alpha_annualized' in comp
    assert 'beta' in comp

def test_alerts_trigger_on_low_sharpe():
    """Test that low Sharpe triggers alert."""
    # Negative Sharpe
    returns = [-0.001] * 60
    monitor = PerformanceMonitor(agent_returns=returns, window_size=50)
    monitor.alert_thresholds['sharpe_below'] = 0.1

    # Update to fill window
    for r in returns:
        monitor.update(agent_return=r, timestamp=datetime.now())

    # Should have alert
    assert len(monitor.alerts) > 0
    recent_alerts = [a for a in monitor.alerts[-5:] if a.alert_type == 'sharpe_low']
    assert len(recent_alerts) > 0

def test_alerts_trigger_on_max_drawdown():
    """Test that high drawdown triggers alert."""
    # Simulate steady decline
    returns = [-0.005] * 50
    monitor = PerformanceMonitor(agent_returns=[], window_size=40)
    monitor.alert_thresholds['max_drawdown_above'] = 0.10

    equity = 10000
    for r in returns:
        equity *= (1 + r)
        monitor.agent_equity.append(equity)
        monitor.update(agent_return=r, timestamp=datetime.now())

    assert len(monitor.alerts) > 0
    assert any(a.alert_type == 'drawdown_high' for a in monitor.alerts)

def test_generate_report_structure():
    """Test report generation produces expected structure."""
    returns = np.random.randn(100) * 0.001
    monitor = PerformanceMonitor(agent_returns=list(returns))
    monitor.update(agent_return=0.001)  # one update

    report = monitor.generate_report()

    assert 'generated_at' in report
    assert 'current_step' in report
    assert 'rolling_metrics' in report
    assert 'alerts' in report
    assert 'summary' in report

def test_save_and_load_state(tmp_path):
    """Test state persistence."""
    returns = np.random.randn(50).tolist()
    monitor1 = PerformanceMonitor(agent_returns=returns.copy(), window_size=30)

    # Simulate updates
    for r in returns[30:]:
        monitor1.update(agent_return=r)

    # Add a benchmark
    monitor1.benchmark_returns['test'] = returns.copy()

    # Save
    state_path = tmp_path / "monitor_state.json"
    monitor1.save_state(str(state_path))

    # Load into new monitor
    monitor2 = PerformanceMonitor(agent_returns=[])
    monitor2.load_state(str(state_path))

    assert len(monitor2.agent_returns) == len(monitor1.agent_returns)
    assert 'test' in monitor2.benchmark_returns
    assert monitor2.current_step == monitor1.current_step
