"""Evaluation package for RL trading."""

from rl.evaluation.backtest import Backtester, BacktestResults
from rl.evaluation.metrics import (
    calculate_sharpe_ratio,
    calculate_sortino_ratio,
    calculate_calmar_ratio,
    compute_drawdowns,
    compute_returns,
    calculate_performance_metrics
)
from rl.evaluation.visualizer import (
    plot_equity_curve,
    plot_drawdown_chart,
    plot_returns_distribution,
    plot_trade_analysis,
    save_plots
)

__all__ = [
    "Backtester",
    "BacktestResults",
    "calculate_sharpe_ratio",
    "calculate_sortino_ratio",
    "calculate_calmar_ratio",
    "compute_drawdowns",
    "compute_returns",
    "calculate_performance_metrics",
    "plot_equity_curve",
    "plot_drawdown_chart",
    "plot_returns_distribution",
    "plot_trade_analysis",
    "save_plots",
]
