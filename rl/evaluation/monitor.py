"""
Performance monitoring and alerting for RL trading agents.

Tracks agent performance over time, compares against benchmarks,
and generates alerts for underperformance.
"""

import numpy as np
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
import logging
from datetime import datetime, timedelta
import json
from pathlib import Path

from rl.types import PerformanceMonitor, BenchmarkResult
from rl.evaluation.benchmark import BenchmarkEngine

logger = logging.getLogger(__name__)


@dataclass
class PerformanceAlert:
    """Represents a performance alert."""
    timestamp: datetime
    alert_type: str  # "underperformance", "drawdown", "regime_change"
    severity: str  # "low", "medium", "high", "critical"
    message: str
    metrics: Dict[str, float]
    threshold: Optional[float] = None


class PerformanceMonitor:
    """
    Monitors agent performance against benchmarks and triggers alerts.

    Features:
    - Rolling window performance calculation
    - Benchmark comparison (alpha, beta, IR, tracking error)
    - Configurable alert thresholds
    - Daily/weekly report generation
    - Performance history persistence
    """

    def __init__(
        self,
        agent_returns: List[float],
        benchmark_engine: Optional[BenchmarkEngine] = None,
        window_size: int = 100,
        alert_thresholds: Optional[Dict[str, float]] = None
    ):
        """
        Initialize performance monitor.

        Args:
            agent_returns: Initial agent returns
            benchmark_engine: Optional benchmark engine for comparison
            window_size: Rolling window size for metrics
            alert_thresholds: Dict of threshold configs
        """
        self.agent_returns = agent_returns.copy()
        self.benchmark_engine = benchmark_engine
        self.window_size = window_size

        # Rolling buffers
        self.agent_equity: List[float] = [10000.0 * (1 + r) for r in np.cumprod(1 + np.array(agent_returns[:10]))] if len(agent_returns) > 0 else [10000.0]

        # Benchmark returns per strategy
        self.benchmark_returns: Dict[str, List[float]] = {}
        self.benchmark_results: Dict[str, BenchmarkResult] = {}

        # Alert thresholds
        self.alert_thresholds = alert_thresholds or {
            'sharpe_below': 0.3,
            'max_drawdown_above': 0.15,
            'underperformance_vs_bh': -0.02,  # 2% underperformance annualized
            'consecutive_losses': 5
        }

        # State
        self.alerts: List[PerformanceAlert] = []
        self.comparison_metrics: Dict[str, Dict[str, float]] = {}  # timestamp -> metrics
        self.current_step = 0

        logger.info(f"PerformanceMonitor initialized: window={window_size}")

    def update(
        self,
        agent_return: float,
        agent_equity: Optional[float] = None,
        timestamp: Optional[datetime] = None
    ) -> None:
        """
        Update monitor with new agent performance data.

        Args:
            agent_return: Latest step return
            agent_equity: Latest equity value (optional)
            timestamp: Timestamp for this update (default: now)
        """
        self.current_step += 1
        ts = timestamp or datetime.now()

        # Update agent data
        self.agent_returns.append(agent_return)
        if agent_equity is not None:
            self.agent_equity.append(agent_equity)

        # Trim buffers
        if len(self.agent_returns) > self.window_size * 2:
            self.agent_returns = self.agent_returns[-self.window_size * 2:]
        if len(self.agent_equity) > self.window_size * 2:
            self.agent_equity = self.agent_equity[-self.window_size * 2:]

        # Run checks
        self._check_alerts(ts)

    def compute_rolling_metrics(
        self,
        window: Optional[int] = None
    ) -> Dict[str, float]:
        """
        Compute performance metrics over rolling window.

        Args:
            window: Window size (default: self.window_size)

        Returns:
            Dictionary of metrics
        """
        w = window or self.window_size
        returns = np.array(self.agent_returns[-w:])

        if len(returns) < 2:
            return {}

        metrics = {
            'total_return': np.sum(returns),
            'mean_return': np.mean(returns),
            'volatility': np.std(returns, ddof=1),
            'sharpe_ratio': self._annualized_sharpe(returns),
            'max_drawdown': self._max_drawdown_from_equity(self.agent_equity[-w-1:]),
            'win_rate': np.mean(returns > 0),
            'skewness': self._skewness(returns),
            'kurtosis': self._kurtosis(returns)
        }

        return metrics

    def compare_to_benchmark(
        self,
        benchmark_name: str,
        benchmark_returns: List[float],
        compute_relative: bool = True
    ) -> Dict[str, float]:
        """
        Compare agent performance to a benchmark.

        Args:
            benchmark_name: Name of benchmark strategy
            benchmark_returns: Benchmark returns series
            compute_relative: Whether to compute alpha, beta, IR

        Returns:
            Dictionary with comparison metrics
        """
        agent_returns = np.array(self.agent_returns[-len(benchmark_returns):])
        bench_returns = np.array(benchmark_returns[:len(agent_returns)])

        if len(agent_returns) != len(bench_returns):
            logger.warning(f"Length mismatch: agent={len(agent_returns)}, bench={len(benchmark_returns)}")
            min_len = min(len(agent_returns), len(benchmark_returns))
            agent_returns = agent_returns[:min_len]
            bench_returns = bench_returns[:min_len]

        # Basic metrics
        agent_sharpe = self._annualized_sharpe(agent_returns)
        bench_sharpe = self._annualized_sharpe(bench_returns)

        comparison = {
            'agent_sharpe': agent_sharpe,
            'benchmark_sharpe': bench_sharpe,
            'sharpe_diff': agent_sharpe - bench_sharpe
        }

        if compute_relative:
            # Compute alpha, beta, information ratio
            beta = np.cov(agent_returns, bench_returns)[0, 1] / np.var(bench_returns) if np.var(bench_returns) != 0 else 0.0
            alpha = np.mean(agent_returns) - beta * np.mean(bench_returns)

            # Tracking error
            excess_returns = agent_returns - bench_returns
            tracking_error = np.std(excess_returns, ddof=1) * np.sqrt(252 * 24 * 12)

            information_ratio = alpha / tracking_error if tracking_error != 0 else 0.0

            comparison.update({
                'alpha_annualized': alpha * 252 * 24 * 12,
                'beta': beta,
                'information_ratio': information_ratio,
                'tracking_error': tracking_error,
                'correlation': np.corrcoef(agent_returns, bench_returns)[0, 1]
            })

        # Store
        ts_str = datetime.now().isoformat()
        self.comparison_metrics[ts_str] = comparison

        logger.info(f"Comparison vs {benchmark_name}: sharpe_diff={comparison['sharpe_diff']:.3f}, "
                   f"alpha={comparison.get('alpha_annualized', 0):.2%}")

        return comparison

    def _check_alerts(self, timestamp: datetime) -> None:
        """Check for alert conditions."""
        if len(self.agent_returns) < self.window_size:
            return

        metrics = self.compute_rolling_metrics()

        # Sharpe too low
        if metrics.get('sharpe_ratio', 0) < self.alert_thresholds['sharpe_below']:
            self._create_alert(
                timestamp, "sharpe_low", "medium",
                f"Sharpe ratio {metrics['sharpe_ratio']:.3f} below threshold {self.alert_thresholds['sharpe_below']}",
                metrics
            )

        # Max drawdown too high
        if metrics.get('max_drawdown', 0) > self.alert_thresholds['max_drawdown_above']:
            self._create_alert(
                timestamp, "drawdown_high", "high",
                f"Max drawdown {metrics['max_drawdown']:.2%} exceeds threshold {self.alert_thresholds['max_drawdown_above']:.2%}",
                metrics
            )

        # Consecutive losses
        recent_returns = self.agent_returns[-self.alert_thresholds.get('consecutive_losses', 5):]
        if all(r < 0 for r in recent_returns):
            self._create_alert(
                timestamp, "consecutive_losses", "medium",
                f"{len(recent_returns)} consecutive losing steps",
                {'consecutive_losses': len(recent_returns)}
            )

        # Underperformance vs benchmark
        if 'buy_and_hold' in self.benchmark_returns:
            comp = self.compare_to_benchmark('buy_and_hold', self.benchmark_returns['buy_and_hold'])
            sharpe_diff = comp.get('sharpe_diff', 0)
            if sharpe_diff < self.alert_thresholds['underperformance_vs_bh']:
                self._create_alert(
                    timestamp, "underperformance", "high",
                    f"Agent underperforming buy-and-hold by {sharpe_diff:.3f} Sharpe",
                    comp
                )

    def _create_alert(
        self,
        timestamp: datetime,
        alert_type: str,
        severity: str,
        message: str,
        metrics: Dict[str, float]
    ) -> None:
        """Create and record an alert."""
        alert = PerformanceAlert(
            timestamp=timestamp,
            alert_type=alert_type,
            severity=severity,
            message=message,
            metrics=metrics.copy(),
            threshold=None  # Could add threshold value
        )
        self.alerts.append(alert)
        logger.warning(f"Alert [{severity}]: {message}")

    def _annualized_sharpe(self, returns: np.ndarray, risk_free_rate: float = 0.0) -> float:
        """Compute annualized Sharpe ratio."""
        if len(returns) < 2:
            return 0.0
        mean_return = np.mean(returns)
        std_return = np.std(returns, ddof=1)
        if std_return == 0:
            return 0.0
        sharpe = mean_return / std_return
        return sharpe * np.sqrt(252 * 24 * 12)

    def _max_drawdown_from_equity(self, equity_curve: List[float]) -> float:
        """Compute max drawdown from equity curve as positive magnitude."""
        if len(equity_curve) < 2:
            return 0.0
        equity = np.array(equity_curve)
        running_max = np.maximum.accumulate(equity)
        drawdown = (equity - running_max) / running_max
        return abs(float(np.min(drawdown)))

    def _skewness(self, returns: np.ndarray) -> float:
        """Compute skewness."""
        if len(returns) < 3:
            return 0.0
        mean = np.mean(returns)
        std = np.std(returns, ddof=1)
        if std == 0:
            return 0.0
        skew = np.mean(((returns - mean) / std) ** 3)
        return skew

    def _kurtosis(self, returns: np.ndarray) -> float:
        """Compute excess kurtosis."""
        if len(returns) < 4:
            return 0.0
        mean = np.mean(returns)
        std = np.std(returns, ddof=1)
        if std == 0:
            return 0.0
        kurt = np.mean(((returns - mean) / std) ** 4) - 3  # Excess kurtosis
        return kurt

    def generate_report(
        self,
        output_path: Optional[str] = None,
        include_benchmarks: bool = True
    ) -> Dict[str, Any]:
        """
        Generate comprehensive performance report.

        Args:
            output_path: Optional path to save JSON report
            include_benchmarks: Include benchmark comparisons

        Returns:
            Dictionary with report data
        """
        report = {
            'generated_at': datetime.now().isoformat(),
            'current_step': self.current_step,
            'num_returns': len(self.agent_returns),
            'rolling_metrics': self.compute_rolling_metrics(),
            'alerts': [
                {
                    'timestamp': a.timestamp.isoformat(),
                    'type': a.alert_type,
                    'severity': a.severity,
                    'message': a.message,
                    'metrics': a.metrics
                }
                for a in self.alerts
            ],
            'num_alerts': len(self.alerts)
        }

        if include_benchmarks and self.comparison_metrics:
            latest_comparison = list(self.comparison_metrics.values())[-1]
            report['latest_comparison'] = latest_comparison

        # Summary statistics
        if len(self.agent_returns) > 0:
            returns_array = np.array(self.agent_returns)
            report['summary'] = {
                'cumulative_return': (1 + returns_array).prod() - 1,
                'annualized_return': np.mean(returns_array) * 252 * 24 * 12,
                'annualized_volatility': np.std(returns_array) * np.sqrt(252 * 24 * 12),
                'sharpe_ratio': self._annualized_sharpe(returns_array),
                'max_drawdown': self._max_drawdown_from_equity(self.agent_equity),
                'win_rate': np.mean(returns_array > 0)
            }

        # Save to file if requested
        if output_path:
            path = Path(output_path)
            path.parent.mkdir(parents=True, exist_ok=True)
            with open(path, 'w') as f:
                json.dump(report, f, indent=2)
            logger.info(f"Performance report saved to {path}")

        return report

    def save_state(self, path: str) -> None:
        """Save monitor state to disk."""
        state = {
            'agent_returns': self.agent_returns,
            'agent_equity': self.agent_equity,
            'benchmark_returns': self.benchmark_returns,
            'comparison_metrics': self.comparison_metrics,
            'alerts': [
                {
                    'timestamp': a.timestamp.isoformat(),
                    'alert_type': a.alert_type,
                    'severity': a.severity,
                    'message': a.message,
                    'metrics': a.metrics
                }
                for a in self.alerts
            ],
            'current_step': self.current_step,
            'alert_thresholds': self.alert_thresholds
        }

        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, 'w') as f:
            json.dump(state, f, indent=2)

        logger.info(f"Monitor state saved to {path}")

    def load_state(self, path: str) -> None:
        """Load monitor state from disk."""
        with open(path, 'r') as f:
            state = json.load(f)

        self.agent_returns = state['agent_returns']
        self.agent_equity = state['agent_equity']
        self.benchmark_returns = state['benchmark_returns']
        self.comparison_metrics = state['comparison_metrics']
        self.current_step = state['current_step']
        self.alert_thresholds = state.get('alert_thresholds', self.alert_thresholds)

        # Reconstruct alerts
        self.alerts = []
        for a_dict in state.get('alerts', []):
            alert = PerformanceAlert(
                timestamp=datetime.fromisoformat(a_dict['timestamp']),
                alert_type=a_dict['alert_type'],
                severity=a_dict['severity'],
                message=a_dict['message'],
                metrics=a_dict['metrics']
            )
            self.alerts.append(alert)

        logger.info(f"Monitor state loaded from {path}")
