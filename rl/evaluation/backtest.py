"""
Backtesting engine for trained policies.
"""

from typing import List, Dict, Any
import numpy as np
from rl.types import EpisodeHistory
from rl.environment import MarketEnv
from rl.algorithms import BaseTrainer
from rl.utils.metrics import calculate_performance_metrics

class BacktestResults:
    """Container for backtest results."""

    def __init__(
        self,
        total_reward: float,
        episode_lengths: List[int],
        episode_rewards: List[float],
        trades: List,
        final_equity: float,
        sharpe: float,
        max_drawdown: float,
        win_rate: float
    ):
        self.total_reward = total_reward
        self.episode_lengths = episode_lengths
        self.episode_rewards = episode_rewards
        self.trades = trades
        self.final_equity = final_equity
        self.sharpe = sharpe
        self.max_drawdown = max_drawdown
        self.win_rate = win_rate

    def to_dict(self) -> Dict[str, Any]:
        return {
            "total_reward": self.total_reward,
            "avg_episode_length": float(np.mean(self.episode_lengths)) if self.episode_lengths else 0.0,
            "avg_episode_reward": float(np.mean(self.episode_rewards)) if self.episode_rewards else 0.0,
            "final_equity": self.final_equity,
            "sharpe_ratio": self.sharpe,
            "max_drawdown": self.max_drawdown,
            "win_rate": self.win_rate,
            "num_episodes": len(self.episode_rewards),
            "num_trades": len(self.trades)
        }

class Backtester:
    """
    Runs backtests on historical data using a trained policy.
    """

    def __init__(self, env: MarketEnv):
        self.env = env

    def run(
        self,
        predict_func,
        n_episodes: int = 1,
        start_index: int = 0
    ) -> BacktestResults:
        """
        Run backtest.

        Args:
            predict_func: Function that takes observation and returns action
            n_episodes: Number of episodes to run
            start_index: Starting index in data

        Returns:
            BacktestResults object
        """
        total_reward = 0.0
        episode_lengths = []
        episode_rewards = []
        all_trades = []

        for _ in range(n_episodes):
            obs, info = self.env.reset(options={"start_idx": start_index})
            done = False
            episode_reward = 0.0
            steps = 0

            while not done:
                action = predict_func(obs)
                obs, reward, terminated, truncated, info = self.env.step(action)
                episode_reward += reward
                steps += 1
                done = terminated or truncated

                if "trade" in info and info["trade"] is not None:
                    all_trades.append(info["trade"])

            episode_rewards.append(episode_reward)
            episode_lengths.append(steps)
            total_reward += episode_reward

        # Compute metrics from env history
        if hasattr(self.env, 'episode_history') and self.env.episode_history:
            history = self.env.episode_history
            returns = history.returns
            equity = history.equity_curve
            perf = calculate_performance_metrics(returns, equity) if returns and equity else {}
        else:
            perf = {}

        results = BacktestResults(
            total_reward=total_reward,
            episode_lengths=episode_lengths,
            episode_rewards=episode_rewards,
            trades=all_trades,
            final_equity=self.env.account.equity if hasattr(self.env, 'account') else 0.0,
            sharpe=perf.get("sharpe_ratio", 0.0),
            max_drawdown=perf.get("max_drawdown", 0.0),
            win_rate=perf.get("win_rate", 0.0)
        )
        return results
