"""
Type definitions for the RL trading domain.
"""

from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any

@dataclass
class Position:
    """Current trading position."""
    size: float  # Number of units (positive for long, negative for short)
    entry_price: float  # Average entry price
    unrealized_pnl: float = 0.0
    realized_pnl: float = 0.0

@dataclass
class AccountInfo:
    """Account state information."""
    balance: float  # Available cash
    equity: float  # Balance + unrealized PnL
    margin: float  # Margin used (for leveraged positions)
    buying_power: float  # Available buying power

@dataclass
class MarketData:
    """Market data for a single timestep."""
    timestamp: Any  # Could be datetime, int, or float
    open: float
    high: float
    low: float
    close: float
    volume: float
    indicators: Dict[str, float] = field(default_factory=dict)

@dataclass
class Observation:
    """Complete observation state combining all components."""
    position: Position
    account: AccountInfo
    market: MarketData

    def to_vector(self) -> List[float]:
        """Flatten observation into a vector for ML models."""
        vector = [
            self.position.size,
            self.position.entry_price,
            self.position.unrealized_pnl,
            self.position.realized_pnl,
            self.account.balance,
            self.account.equity,
            self.account.margin,
            self.account.buying_power,
            self.market.open,
            self.market.high,
            self.market.low,
            self.market.close,
            self.market.volume,
        ]
        # Add indicators in consistent order
        indicator_values = [self.market.indicators.get(k, 0.0) for k in sorted(self.market.indicators.keys())]
        vector.extend(indicator_values)
        return vector

@dataclass
class TradingAction:
    """Action taken by the agent."""
    action_type: int  # 0=hold, 1=buy, 2=sell
    position_size: float  # Fraction of capital to allocate (0-1) or absolute units

@dataclass
class Trade:
    """Record of an executed trade."""
    timestamp: Any
    action: int  # 1=buy, 2=sell
    size: float
    price: float
    pnl: float  # Realized PnL if closing, 0 if opening
    commission: float

@dataclass
class EpisodeHistory:
    """Tracks the history of an episode for reward calculation."""
    observations: List[Observation] = field(default_factory=list)
    trades: List[Trade] = field(default_factory=list)
    returns: List[float] = field(default_factory=list)
    equity_curve: List[float] = field(default_factory=list)

    def add_return(self, ret: float) -> None:
        self.returns.append(ret)

    def sharpe_ratio(self, annualization_factor: float = 252 * 24 * 12) -> float:
        """Compute annualized Sharpe ratio from returns."""
        import numpy as np
        if len(self.returns) < 2:
            return 0.0
        returns_array = np.array(self.returns)
        mean_return = np.mean(returns_array)
        std_return = np.std(returns_array, ddof=1)
        if std_return == 0:
            return 0.0
        sharpe = mean_return / std_return
        return sharpe * np.sqrt(annualization_factor)

    def sortino_ratio(self, annualization_factor: float = 252 * 24 * 12) -> float:
        """Compute annualized Sortino ratio (downside deviation only)."""
        import numpy as np
        if len(self.returns) < 2:
            return 0.0
        returns_array = np.array(self.returns)
        mean_return = np.mean(returns_array)
        downside_returns = returns_array[returns_array < 0]
        if len(downside_returns) == 0:
            return np.inf if mean_return > 0 else 0.0
        downside_deviation = np.std(downside_returns, ddof=1)
        if downside_deviation == 0:
            return 0.0
        sortino = mean_return / downside_deviation
        return sortino * np.sqrt(annualization_factor)

    def maximum_drawdown(self) -> float:
        """Compute maximum drawdown from equity curve."""
        if len(self.equity_curve) < 2:
            return 0.0
        equity_array = np.array(self.equity_curve)
        running_max = np.maximum.accumulate(equity_array)
        drawdown = (equity_array - running_max) / running_max
        return float(np.min(drawdown))

    def calmar_ratio(self, annualization_factor: float = 252 * 24 * 12) -> float:
        """Compute annualized Calmar ratio (return / max drawdown)."""
        if len(self.returns) < 2:
            return 0.0
        mean_return = np.mean(self.returns) * annualization_factor
        max_dd = self.maximum_drawdown()
        if max_dd == 0:
            return 0.0
        return mean_return / abs(max_dd)

# --- Advanced Features Types ---

@dataclass
class WalkForwardSplit:
    """Represents a single walk-forward split."""
    train_start: int
    train_end: int
    val_start: int
    val_end: int
    fold: int

@dataclass
class WalkForwardResult:
    """Results from a single WFA fold."""
    fold: int
    train_metrics: Dict[str, float]
    val_metrics: Dict[str, float]
    model_path: Optional[str]
    sharpe_series: List[float]  # Rolling Sharpe during validation

@dataclass
class WalkForwardSummary:
    """Aggregate WFA results across all folds."""
    n_splits: int
    fold_results: List[WalkForwardResult]
    mean_sharpe: float
    std_sharpe: float
    mean_max_drawdown: float
    sharpe_stability: float  # Coefficient of variation (std/mean)
    best_fold: int
    worst_fold: int

@dataclass
class EnsembleMember:
    """A single model in the ensemble."""
    model_path: str
    hyperparameters: Dict[str, Any]
    validation_metrics: Dict[str, float]
    weight: float

@dataclass
class EnsemblePrediction:
    """Combined prediction from ensemble."""
    action: Any  # Combined action (voted or weighted)
    member_predictions: List[Any]  # Individual predictions
    weights: List[float]  # Weights used
    confidence: float  # Agreement/consensus metric

@dataclass
class PaperTradeOrder:
    """Represents a paper trading order."""
    order_id: str
    timestamp: Any
    side: str  # "buy" or "sell"
    size: float
    price: float
    commission: float
    status: str  # "filled", "partial", "cancelled"
    fill_price: Optional[float] = None
    fill_time: Optional[Any] = None

@dataclass
class PaperTradingPosition:
    """Current position in paper trading."""
    symbol: str
    size: float
    entry_price: float
    current_price: float
    unrealized_pnl: float
    realized_pnl: float

@dataclass
class PaperTradingSession:
    """State of a paper trading session."""
    session_id: str
    start_time: Any
    is_active: bool
    initial_capital: float
    current_capital: float
    positions: List[PaperTradingPosition]
    trade_history: List[PaperTradeOrder]
    equity_curve: List[float]
    current_step: int
    last_update: Any

@dataclass
class CapitalAllocationDecision:
    """Decision about capital allocation."""
    timestamp: Any
    current_allocation_pct: float
    target_allocation_pct: float
    reason: str  # "performance_up", "performance_down", "drawdown", "cooldown"
    metrics: Dict[str, float]  # Sharpe, DD, etc. that triggered decision
    adjusted: bool

@dataclass
class CapitalAllocatorState:
    """State of the capital allocator."""
    total_capital: float
    current_allocation: float  # Current % of total capital allocated
    allocated_capital: float  # Actual amount
    available_capital: float  # Unexposed capital
    performance_history: List[float]  # Recent performance metrics
    drawdown_history: List[float]
    last_adjustment: int  # Step of last change
    decision_history: List[CapitalAllocationDecision]
    stage_index: int  # Current index in allocation_stages

@dataclass
class BenchmarkResult:
    """Result from a benchmark strategy."""
    strategy_name: str
    total_return: float
    annualized_return: float
    annualized_volatility: float
    sharpe_ratio: float
    sortino_ratio: float
    max_drawdown: float
    calmar_ratio: float
    win_rate: float
    alpha: Optional[float] = None  # Excess return over benchmark (if comparing)
    beta: Optional[float] = None
    information_ratio: Optional[float] = None
    tracking_error: Optional[float] = None

@dataclass
class PerformanceMonitor:
    """Tracks agent performance vs benchmarks over time."""
    agent_returns: List[float]
    benchmark_returns: Dict[str, List[float]]  # strategy -> returns
    rolling_window: int
    comparison_metrics: Dict[str, Dict[str, float]]  # date -> {metric: value}
    alerts: List[Dict[str, Any]]  # Underperformance alerts
