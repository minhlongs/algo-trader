"""
Reward calculation for trading environment.

Supports multiple reward metrics: Sharpe, Sortino, Calmar, raw P&L.
Optional penalties for drawdown and turnover.
"""

from typing import List
import numpy as np
from rl.types import EpisodeHistory, Trade

def annualized_sharpe_ratio(returns: List[float], annualization_factor: float = 252 * 24 * 12) -> float:
    """Compute annualized Sharpe ratio from a list of returns."""
    if len(returns) < 2:
        return 0.0
    returns_array = np.array(returns)
    mean = np.mean(returns_array)
    std = np.std(returns_array, ddof=1)
    if std == 0:
        return 0.0
    return (mean / std) * np.sqrt(annualization_factor)

def maximum_drawdown(equity_curve: List[float]) -> float:
    """Compute maximum drawdown from equity curve."""
    if len(equity_curve) < 2:
        return 0.0
    equity = np.array(equity_curve)
    running_max = np.maximum.accumulate(equity)
    drawdown = (equity - running_max) / running_max
    return float(np.min(drawdown))

def compute_daily_returns_from_equity(equity_curve: List[float]) -> List[float]:
    """Convert equity curve to daily returns (or period returns)."""
    if len(equity_curve) < 2:
        return []
    arr = np.array(equity_curve)
    returns = np.diff(arr) / arr[:-1]
    return returns.tolist()

class RewardCalculator:
    """
    Calculates reward signals for the trading environment.

    Supports multiple reward types and optional penalties.
    """

    def __init__(
        self,
        reward_type: str = "sharpe",
        window: int = 100,
        max_drawdown_penalty: float = 0.0,
        turnover_penalty: float = 0.0,
        reward_scale: float = 100.0,
        **kwargs
    ):
        """
        Initialize reward calculator.

        Args:
            reward_type: One of "sharpe", "sortino", "calmar", "pnl"
            window: Rolling window length for calculating metrics
            max_drawdown_penalty: Coefficient to penalize drawdown (0 = no penalty)
            turnover_penalty: Coefficient to penalize turnover (fraction of capital traded)
            reward_scale: Multiplier to scale reward to typical RL range
        """
        self.reward_type = reward_type
        self.window = window
        self.max_drawdown_penalty = max_drawdown_penalty
        self.turnover_penalty = turnover_penalty
        self.reward_scale = reward_scale

    def calculate(self, history: EpisodeHistory, step_return: float, turnover: float = 0.0) -> float:
        """
        Compute reward for a single step.

        Args:
            history: Episode history up to current step
            step_return: Return for this step (P&L change relative to previous equity)
            turnover: Fraction of capital that changed hands this step

        Returns:
            Scaled reward as float
        """
        # Add the step return to history
        history.add_return(step_return)
        if len(history.equity_curve) > 0:
            # Equity already updated in env; ensure consistency
            pass

        # Compute base reward based on type
        if self.reward_type == "sharpe":
            base_reward = annualized_sharpe_ratio(history.returns[-self.window:])
        elif self.reward_type == "sortino":
            # Sortino: use downside deviation
            if len(history.returns) < 2:
                base_reward = 0.0
            else:
                returns_array = np.array(history.returns[-self.window:])
                mean = np.mean(returns_array)
                downside = returns_array[returns_array < 0]
                if len(downside) == 0:
                    base_reward = np.inf if mean > 0 else 0.0
                else:
                    downside_std = np.std(downside, ddof=1)
                    if downside_std == 0:
                        base_reward = 0.0
                    else:
                        base_reward = mean / downside_std * np.sqrt(252 * 24 * 12)
        elif self.reward_type == "calmar":
            # Calmar = annualized return / max drawdown
            if len(history.equity_curve) < 2:
                base_reward = 0.0
            else:
                returns_annual = np.mean(history.returns[-self.window:]) * (252 * 24 * 12)
                mdd = maximum_drawdown(history.equity_curve[-self.window:])
                if mdd == 0:
                    base_reward = 0.0
                else:
                    base_reward = returns_annual / abs(mdd)
        elif self.reward_type == "pnl":
            # Raw step P&L scaled
            base_reward = step_return * 1000.0  # scale to meaningful magnitude
        else:
            raise ValueError(f"Unknown reward_type: {self.reward_type}")

        # Apply penalties
        penalty = 0.0
        if self.max_drawdown_penalty > 0 and len(history.equity_curve) >= 2:
            mdd = maximum_drawdown(history.equity_curve[-self.window:])
            penalty += self.max_drawdown_penalty * abs(mdd)
        if self.turnover_penalty > 0:
            penalty += self.turnover_penalty * turnover

        # Combine and scale
        reward = base_reward - penalty
        reward = reward * self.reward_scale

        # Clip to avoid extreme values
        reward = np.clip(reward, -10.0 * self.reward_scale, 10.0 * self.reward_scale)
        return float(reward)
