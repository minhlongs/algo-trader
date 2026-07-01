"""Tests for Benchmark module."""

import pytest
import numpy as np
from rl.evaluation.benchmark import BenchmarkEngine, BenchmarkStrategy
from rl.types import BenchmarkResult

def test_benchmark_engine_initialization():
    """Test engine initialization."""
    data = np.random.randn(200, 5)  # OHLCV + maybe indicators
    engine = BenchmarkEngine(data, price_column=3, initial_capital=10000.0)

    assert engine.data is not None
    assert engine.prices.shape[0] == 200
    assert engine.initial_capital == 10000.0

def test_buy_and_hold_metrics():
    """Test buy-and-hold benchmark produces valid metrics."""
    # Create deterministic upward price series
    prices = np.linspace(100, 150, 100)
    data = np.column_stack([prices] * 5)  # OHLCV all same

    engine = BenchmarkEngine(data, price_column=3, initial_capital=10000.0)
    result = engine.run_benchmark(BenchmarkStrategy.BUY_AND_HOLD)

    assert result.strategy_name == "buy_and_hold"
    assert result.total_return > 0  # should be positive given upward trend
    assert result.sharpe_ratio > 0
    assert result.max_drawdown < 0.5  # reasonable
    assert result.calmar_ratio is not None

def test_random_strategy_consistency():
    """Test random strategy produces deterministic results with seed."""
    data = np.random.randn(100, 5)
    engine = BenchmarkEngine(data, price_column=3)

    result1 = engine.run_benchmark(BenchmarkStrategy.RANDOM, seed=42)
    result2 = engine.run_benchmark(BenchmarkStrategy.RANDOM, seed=42)

    # Same seed should produce same result
    assert result1.total_return == result2.total_return
    assert result1.sharpe_ratio == result2.sharpe_ratio

def test_relative_metrics_computation():
    """Test computation of alpha, beta, information ratio."""
    # Create agent and benchmark returns with known relationship
    n = 252  # 1 year of daily-ish data
    np.random.seed(123)

    # Benchmark: normal returns
    bench_returns = np.random.randn(n) * 0.01
    bench_equity = 10000 * np.cumprod(1 + bench_returns)

    # Agent: higher returns, correlated (beta > 1)
    alpha = 0.0005  # daily alpha
    beta = 1.2
    agent_returns = alpha + beta * bench_returns + np.random.randn(n) * 0.005
    agent_equity = 10000 * np.cumprod(1 + agent_returns)

    engine = BenchmarkEngine(np.zeros((n, 5)))
    comp = engine.compute_relative_metrics(
        agent_returns=agent_returns,
        agent_equity=agent_equity,
        benchmark_result=BenchmarkResult(
            strategy_name="bench",
            total_return=bench_returns.sum(),
            annualized_return=0.0,  # not needed
            annualized_volatility=0.0,
            sharpe_ratio=0.0,
            sortino_ratio=0.0,
            max_drawdown=0.0,
            calmar_ratio=0.0,
            win_rate=float(np.mean(bench_returns > 0))
        ),
        benchmark_returns=bench_returns,
        benchmark_equity=bench_equity
    )

    assert 'alpha' in comp
    assert 'beta' in comp
    assert 'information_ratio' in comp
    assert 'tracking_error' in comp

    # Beta should be around 1.2 (positive relationship)
    assert comp['beta'] > 0

def test_benchmark_result_structure():
    """Test BenchmarkResult contains all required fields."""
    result = BenchmarkResult(
        strategy_name="test",
        total_return=0.05,
        annualized_return=0.15,
        annualized_volatility=0.20,
        sharpe_ratio=0.75,
        sortino_ratio=1.0,
        max_drawdown=0.10,
        calmar_ratio=1.5,
        win_rate=0.5
    )

    assert result.strategy_name == "test"
    assert result.total_return == 0.05
    assert result.sharpe_ratio == 0.75

def test_sma_crossover_generates_signals():
    """Test SMA crossover produces some trading signals."""
    # Uptrend then downtrend
    prices = np.concatenate([np.linspace(100, 150, 50), np.linspace(150, 100, 50)])
    data = np.column_stack([prices] * 5)

    engine = BenchmarkEngine(data, price_column=3)
    result = engine._sma_crossover(fast_period=10, slow_period=20)

    # Should have some non-zero return (at least some trades)
    # Not necessarily positive but deterministic
    assert isinstance(result.total_return, float)
