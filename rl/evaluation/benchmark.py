"""
Benchmark strategies for comparing RL agent performance.

Provides baseline strategies like buy-and-hold, equal-weight, and random.
"""

import numpy as np
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
import logging
from enum import Enum

from rl.types import BenchmarkResult

logger = logging.getLogger(__name__)


class BenchmarkStrategy(Enum):
    """Available benchmark strategies."""
    BUY_AND_HOLD = "buy_and_hold"
    EQUAL_WEIGHT = "equal_weight"  # For multi-asset (future)
    RANDOM = "random"
    SMA_CROSSOVER = "sma_crossover"  # Simple technical benchmark


class BenchmarkEngine:
    """
    Runs benchmark strategies and computes performance metrics.

    Benchmarks are run on the same data as the RL agent for fair comparison.
    Metrics include alpha, beta, information ratio, tracking error.
    """

    def __init__(
        self,
        data: np.ndarray,
        price_column: int = 3,  # Assuming 'close' is 4th column (0-indexed 3)
        initial_capital: float = 10000.0
    ):
        """
        Initialize benchmark engine.

        Args:
            data: Preprocessed market data array
            price_column: Index of price column in data
            initial_capital: Starting capital
        """
        self.data = data
        self.price_column = price_column
        self.initial_capital = initial_capital
        self.prices = data[:, price_column]

    def run_benchmark(
        self,
        strategy: BenchmarkStrategy,
        **kwargs
    ) -> BenchmarkResult:
        """
        Run a single benchmark strategy.

        Args:
            strategy: Benchmark strategy to run
            **kwargs: Strategy-specific parameters

        Returns:
            BenchmarkResult with metrics
        """
        logger.info(f"Running benchmark: {strategy.value}")

        if strategy == BenchmarkStrategy.BUY_AND_HOLD:
            result = self._buy_and_hold()
        elif strategy == BenchmarkStrategy.RANDOM:
            result = self._random_strategy()
        elif strategy == BenchmarkStrategy.SMA_CROSSOVER:
            fast = kwargs.get('fast_period', 10)
            slow = kwargs.get('slow_period', 50)
            result = self._sma_crossover(fast, slow)
        else:
            raise ValueError(f"Unsupported benchmark: {strategy}")

        return result

    def _buy_and_hold(self) -> BenchmarkResult:
        """
        Simple buy-and-hold: buy at start, hold to end.

        Returns:
            BenchmarkResult
        """
        initial_price = self.prices[0]
        final_price = self.prices[-1]

        # Simple return (no rebalancing)
        total_return = (final_price - initial_price) / initial_price

        # Simulate equity curve
        equity_curve = self.initial_capital * (self.prices / initial_price)

        # Compute metrics
        returns = np.diff(equity_curve) / equity_curve[:-1]

        result = BenchmarkResult(
            strategy_name=BenchmarkStrategy.BUY_AND_HOLD.value,
            total_return=total_return,
            annualized_return=self._annualize_return(total_return, len(self.prices)),
            annualized_volatility=self._annualize_volatility(np.std(returns)),
            sharpe_ratio=self._compute_sharpe(returns),
            sortino_ratio=self._compute_sortino(returns),
            max_drawdown=self._compute_max_drawdown(equity_curve),
            calmar_ratio=self._compute_calmar(returns, equity_curve),
            win_rate=float(np.mean(returns > 0))
        )

        logger.info(f"Buy-and-hold: total_return={total_return:.2%}, sharpe={result.sharpe_ratio:.3f}")

        return result

    def _random_strategy(self, seed: int = 42) -> BenchmarkResult:
        """
        Random trading: random buy/sell/hold each step.

        Returns:
            BenchmarkResult
        """
        np.random.seed(seed)
        n_steps = len(self.prices)

        # Random actions: -1 (sell), 0 (hold), 1 (buy) with equal probability
        actions = np.random.choice([-1, 0, 1], size=n_steps, p=[1/3, 1/3, 1/3])

        # Simulate P&L
        position = 0  # Net position: units held
        cash = self.initial_capital
        equity_curve = np.zeros(n_steps)
        trades = []

        price = self.prices[0]

        for t in range(n_steps):
            price = self.prices[t]

            # Execute action (simplified: immediate at close)
            if t > 0:
                price_change = self.prices[t] - self.prices[t-1]
                pnl = position * price_change
                cash += pnl

            if actions[t] != 0:
                # Trade (fixed size for simplicity)
                trade_size = 10  # Fixed units
                if actions[t] == 1:  # buy
                    position += trade_size
                    cash -= price * trade_size
                else:  # sell
                    position -= trade_size
                    cash += price * trade_size

            equity = cash + position * price
            equity_curve[t] = equity

        # Compute metrics
        total_return = (equity_curve[-1] - self.initial_capital) / self.initial_capital
        returns = np.diff(equity_curve) / equity_curve[:-1]

        result = BenchmarkResult(
            strategy_name=BenchmarkStrategy.RANDOM.value,
            total_return=total_return,
            annualized_return=self._annualize_return(total_return, n_steps),
            annualized_volatility=self._annualize_volatility(np.std(returns)),
            sharpe_ratio=self._compute_sharpe(returns),
            sortino_ratio=self._compute_sortino(returns),
            max_drawdown=self._compute_max_drawdown(equity_curve),
            calmar_ratio=self._compute_calmar(returns, equity_curve),
            win_rate=np.mean(returns > 0) if len(returns) > 0 else 0.0
        )

        logger.info(f"Random: total_return={total_return:.2%}, sharpe={result.sharpe_ratio:.3f}")

        return result

    def _sma_crossover(self, fast_period: int = 10, slow_period: int = 50) -> BenchmarkResult:
        """
        Simple moving average crossover strategy.

        Buy when fast SMA > slow SMA, sell when fast < slow.

        Returns:
            BenchmarkResult
        """
        from scipy import stats  # or use numpy for SMA

        # Compute SMAs
        fast_sma = self._compute_sma(fast_period)
        slow_sma = self._compute_sma(slow_period)

        # Generate signals
        signals = np.zeros_like(self.prices)
        signals[fast_sma > slow_sma] = 1  # long
        signals[fast_sma < slow_sma] = -1  # short or cash

        # Simulate equity curve
        position = 0
        cash = self.initial_capital
        equity_curve = np.zeros_like(self.prices)

        for t in range(len(self.prices)):
            price = self.prices[t]

            if t > 0:
                price_change = self.prices[t] - self.prices[t-1]
                pnl = position * price_change
                cash += pnl

            # Update position based on signal
            new_position = signals[t] * 10  # Fixed 10 units
            position = new_position

            equity = cash + position * price
            equity_curve[t] = equity

        # Compute metrics
        total_return = (equity_curve[-1] - self.initial_capital) / self.initial_capital
        returns = np.diff(equity_curve) / equity_curve[:-1]

        result = BenchmarkResult(
            strategy_name=f"sma_{fast_period}_{slow_period}",
            total_return=total_return,
            annualized_return=self._annualize_return(total_return, len(self.prices)),
            annualized_volatility=self._annualize_volatility(np.std(returns)),
            sharpe_ratio=self._compute_sharpe(returns),
            sortino_ratio=self._compute_sortino(returns),
            max_drawdown=self._compute_max_drawdown(equity_curve),
            calmar_ratio=self._compute_calmar(returns, equity_curve),
            win_rate=float(np.mean(returns > 0)) if len(returns) > 0 else 0.0
        )

        logger.info(f"SMA crossover: total_return={total_return:.2%}, sharpe={result.sharpe_ratio:.3f}")

        return result

    def _compute_sma(self, period: int) -> np.ndarray:
        """Compute simple moving average."""
        sma = np.zeros_like(self.prices)
        for i in range(len(self.prices)):
            start = max(0, i - period + 1)
            sma[i] = np.mean(self.prices[start:i+1])
        return sma

    def _annualize_return(self, total_return: float, n_steps: int, steps_per_year: int = 252 * 24 * 12) -> float:
        """Annualize total return."""
        years = n_steps / steps_per_year
        if years == 0:
            return 0.0
        return (1 + total_return) ** (1 / years) - 1

    def _annualize_volatility(self, vol: float, steps_per_year: int = 252 * 24 * 12) -> float:
        """Annualize volatility."""
        return vol * np.sqrt(steps_per_year)

    def _compute_sharpe(self, returns: np.ndarray, risk_free_rate: float = 0.0, steps_per_year: int = 252 * 24 * 12) -> float:
        """Compute annualized Sharpe ratio."""
        if len(returns) < 2:
            return 0.0
        mean_return = np.mean(returns) - risk_free_rate / steps_per_year
        std_return = np.std(returns, ddof=1)
        if std_return == 0:
            return 0.0
        sharpe = mean_return / std_return
        return sharpe * np.sqrt(steps_per_year)

    def _compute_sortino(self, returns: np.ndarray, risk_free_rate: float = 0.0, steps_per_year: int = 252 * 24 * 12) -> float:
        """Compute annualized Sortino ratio."""
        if len(returns) < 2:
            return 0.0
        mean_return = np.mean(returns) - risk_free_rate / steps_per_year
        downside_returns = returns[returns < 0]
        if len(downside_returns) == 0:
            return np.inf if mean_return > 0 else 0.0
        downside_dev = np.std(downside_returns, ddof=1)
        if downside_dev == 0:
            return 0.0
        sortino = mean_return / downside_dev
        return sortino * np.sqrt(steps_per_year)

    def _compute_max_drawdown(self, equity_curve: np.ndarray) -> float:
        """Compute maximum drawdown."""
        if len(equity_curve) < 2:
            return 0.0
        running_max = np.maximum.accumulate(equity_curve)
        drawdown = (equity_curve - running_max) / running_max
        return float(np.min(drawdown))

    def _compute_calmar(self, returns: np.ndarray, equity_curve: np.ndarray, steps_per_year: int = 252 * 24 * 12) -> float:
        """Compute Calmar ratio."""
        if len(returns) < 2:
            return 0.0
        mean_return = np.mean(returns) * steps_per_year
        max_dd = self._compute_max_drawdown(equity_curve)
        if max_dd == 0:
            return 0.0
        return mean_return / abs(max_dd)

    def compute_relative_metrics(
        self,
        agent_returns: np.ndarray,
        agent_equity: np.ndarray,
        benchmark_result: BenchmarkResult,
        benchmark_returns: np.ndarray,
        benchmark_equity: np.ndarray
    ) -> Dict[str, float]:
        """
        Compute agent performance relative to benchmark.

        Args:
            agent_returns: Array of agent returns
            agent_equity: Array of agent equity curve
            benchmark_result: BenchmarkResult object
            benchmark_returns: Array of benchmark returns
            benchmark_equity: Array of benchmark equity curve

        Returns:
            Dictionary with alpha, beta, information ratio, tracking error
        """
        # Align lengths
        min_len = min(len(agent_returns), len(benchmark_returns))
        agent_returns = agent_returns[:min_len]
        benchmark_returns = benchmark_returns[:min_len]

        # Beta: covariance(agent, bench) / variance(bench)
        covariance = np.cov(agent_returns, benchmark_returns)[0, 1]
        benchmark_variance = np.var(benchmark_returns)
        beta = covariance / benchmark_variance if benchmark_variance != 0 else 0.0

        # Alpha: agent_return - (risk_free + beta * (benchmark_return - risk_free))
        # Simplified: annualized excess return
        agent_annual_return = self._annualize_return((agent_equity[-1] - agent_equity[0]) / agent_equity[0], min_len)
        bench_annual_return = benchmark_result.annualized_return
        alpha = agent_annual_return - bench_annual_return

        # Tracking error: std(agent_return - benchmark_return)
        excess_returns = agent_returns - benchmark_returns
        tracking_error = self._annualize_volatility(np.std(excess_returns))

        # Information ratio: alpha / tracking_error
        information_ratio = alpha / tracking_error if tracking_error != 0 else 0.0

        return {
            'alpha': alpha,
            'beta': beta,
            'information_ratio': information_ratio,
            'tracking_error': tracking_error
        }
