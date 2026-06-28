"""
Standalone metric calculation functions for RL trading.
"""

from typing import List, Dict
import numpy as np

def calculate_sharpe_ratio(
    returns: List[float],
    annualization_factor: float = 252 * 24 * 12
) -> float:
    """Compute annualized Sharpe ratio."""
    if len(returns) < 2:
        return 0.0
    arr = np.array(returns)
    mean = np.mean(arr)
    std = np.std(arr, ddof=1)
    if std == 0:
        return 0.0
    return (mean / std) * np.sqrt(annualization_factor)

def calculate_sortino_ratio(
    returns: List[float],
    annualization_factor: float = 252 * 24 * 12
) -> float:
    """Compute annualized Sortino ratio."""
    if len(returns) < 2:
        return 0.0
    arr = np.array(returns)
    mean = np.mean(arr)
    downside = arr[arr < 0]
    if len(downside) == 0:
        return np.inf if mean > 0 else 0.0
    downside_std = np.std(downside, ddof=1)
    if downside_std == 0:
        return 0.0
    return (mean / downside_std) * np.sqrt(annualization_factor)

def calculate_calmar_ratio(
    returns: List[float],
    equity_curve: List[float],
    annualization_factor: float = 252 * 24 * 12
) -> float:
    """Compute annualized Calmar ratio (return / max drawdown)."""
    if len(returns) < 2 or len(equity_curve) < 2:
        return 0.0
    mean_annual = np.mean(returns) * annualization_factor
    mdd = compute_drawdowns(equity_curve)
    if mdd == 0:
        return 0.0
    return mean_annual / abs(mdd)

def compute_drawdowns(equity_curve: List[float]) -> float:
    """Compute maximum drawdown from equity curve."""
    if len(equity_curve) < 2:
        return 0.0
    arr = np.array(equity_curve)
    running_max = np.maximum.accumulate(arr)
    drawdown = (arr - running_max) / running_max
    return float(np.min(drawdown))

def compute_returns(equity_curve: List[float]) -> List[float]:
    """Compute period returns from equity curve."""
    if len(equity_curve) < 2:
        return []
    arr = np.array(equity_curve)
    returns = np.diff(arr) / arr[:-1]
    return returns.tolist()

def calculate_performance_metrics(
    returns: List[float],
    equity_curve: List[float]
) -> Dict[str, float]:
    """
    Compute comprehensive performance metrics.

    Returns:
        Dict with Sharpe, Sortino, Calmar, MaxDD, TotalReturn, etc.
    """
    if len(returns) == 0:
        return {}
    total_return = (equity_curve[-1] / equity_curve[0] - 1) if len(equity_curve) > 1 else 0.0
    sharpe = calculate_sharpe_ratio(returns)
    sortino = calculate_sortino_ratio(returns)
    mdd = compute_drawdowns(equity_curve)
    calmar = calculate_calmar_ratio(returns, equity_curve)
    volatility = np.std(returns) * np.sqrt(252 * 24 * 12) if len(returns) > 1 else 0.0
    mean_return = np.mean(returns) * (252 * 24 * 12)

    return {
        "total_return": total_return,
        "annualized_return": mean_return,
        "annualized_volatility": volatility,
        "sharpe_ratio": sharpe,
        "sortino_ratio": sortino,
        "calmar_ratio": calmar,
        "max_drawdown": mdd,
        "win_rate": (np.sum(np.array(returns) > 0) / len(returns)) if len(returns) > 0 else 0.0,
    }
