"""
Configuration management for RL trading framework.

Uses dataclasses for type-safe configuration with YAML serialization.
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Dict, Any
import yaml

@dataclass
class RLConfig:
    """Complete configuration for RL training and environment."""
    # Environment
    initial_balance: float = 10000.0
    max_episode_steps: int = 1000
    transaction_cost: float = 0.001  # 0.1% fee
    slippage: float = 0.0005  # 0.05% slippage
    window_size: int = 20  # Number of historical timesteps in observation

    # Action space
    action_type: str = "continuous"  # "discrete" or "continuous"
    discrete_action_levels: int = 5  # For discrete: position sizing levels (1/5, 2/5, ..., 5/5)
    continuous_position_limit: float = 1.0  # Max fraction of capital per trade

    # Reward
    reward_type: str = "sharpe"  # "sharpe", "sortino", "calmar", "pnl"
    reward_window: int = 100  # Rolling window for Sharpe calculation
    max_drawdown_penalty: float = 0.0  # Optional penalty coefficient
    turnover_penalty: float = 0.0  # Optional penalty for excessive trading
    reward_scale: float = 100.0  # Scale factor to keep rewards in reasonable range

    # Data
    data_path: Optional[str] = None
    feature_columns: List[str] = field(default_factory=lambda: [
        "open", "high", "low", "close", "volume"
    ])
    technical_indicators: bool = True
    train_split: float = 0.7  # Fraction of data for training
    validation_split: float = 0.15  # Fraction for validation (rest is test)
    normalization: str = "standard"  # "standard", "minmax", or "none"

    # Training
    total_timesteps: int = 100_000
    learning_rate: float = 3e-4
    batch_size: int = 64
    gamma: float = 0.99
    n_steps: int = 2048  # For PPO: steps per rollout
    n_epochs: int = 10  # For PPO: epochs per rollout
    gae_lambda: float = 0.95
    clip_range: float = 0.2
    ent_coef: float = 0.01  # Entropy coefficient
    vf_coef: float = 0.5  # Value function coefficient
    max_grad_norm: float = 0.5

    # SAC specific
    buffer_size: int = 100_000
    learning_starts: int = 1000
    tau: float = 0.005  # Target network update rate
    train_freq: int = 1
    target_entropy: str = "auto"  # "auto" or float

    # DQN specific
    exploration_fraction: float = 0.1  # Fraction of timesteps for exploration decay
    exploration_final_eps: float = 0.01
    target_update_interval: int = 10000
    double_q: bool = True
    dueling: bool = False

    # Paths
    log_dir: str = "./logs"
    model_dir: str = "./models"
    tensorboard_log: str = "./tensorboard"

    def to_yaml(self, path: Path) -> None:
        """Save configuration to YAML file."""
        with open(path, 'w') as f:
            yaml.dump(self.as_dict(), f, default_flow_style=False, sort_keys=False)

    def as_dict(self) -> Dict[str, Any]:
        """Convert dataclass to dictionary."""
        from dataclasses import asdict
        return asdict(self)

    @classmethod
    def from_yaml(cls, path: Path) -> "RLConfig":
        """Load configuration from YAML file."""
        with open(path, 'r') as f:
            data = yaml.safe_load(f)
        return cls(**data)

    def ensure_directories(self) -> None:
        """Create necessary directories if they don't exist."""
        for dir_path in [self.log_dir, self.model_dir, self.tensorboard_log]:
            Path(dir_path).mkdir(parents=True, exist_ok=True)

# --- Advanced Features Configuration ---
# These fields are added to RLConfig for walk-forward analysis, ensemble, paper trading, capital allocation, and benchmarking.

# Walk-Forward Analysis
wfa_n_splits: int = 5  # Number of train/validation splits
wfa_train_expansion: bool = True  # True = expanding window, False = rolling window
wfa_initial_train_size: float = 0.3  # Initial training fraction (for rolling window)
wfa_retrain_frequency: int = 1  # Retrain every N steps in validation period
wfa_save_models: bool = True  # Save model for each fold
wfa_save_metrics: bool = True  # Save metrics per fold

# Ensemble
ensemble_n_models: int = 5  # Number of ensemble members
ensemble_method: str = "weighted"  # "voting", "weighted", "best"
ensemble_weight_metric: str = "sharpe_ratio"  # Metric to use for weighting
ensemble_min_weight: float = 0.1  # Minimum weight per model
ensemble_save: bool = True

# Paper Trading
paper_trading_initial_capital: float = 10000.0
paper_trading_session_duration: Optional[int] = None  # Max steps (None = indefinite)
paper_trading_save_interval: int = 100
paper_trading_persist_state: bool = True
paper_trading_state_file: Optional[str] = None

# Capital Allocation
capital_total: float = 100000.0  # Total available capital
capital_allocation_stages: List[float] = field(default_factory=lambda: [0.01, 0.05, 0.10])
capital_performance_window: int = 100
capital_sharpe_threshold_up: float = 1.5
capital_sharpe_threshold_down: float = 0.5
capital_max_drawdown_limit: float = 0.10
capital_consecutive_wins: int = 5
capital_cooldown_period: int = 20

# Benchmark
benchmark_strategies: List[str] = field(default_factory=lambda: ["buy_and_hold", "equal_weight", "random"])
benchmark_metrics: List[str] = field(default_factory=lambda: ["sharpe_ratio", "total_return", "max_drawdown", "calmar_ratio"])
benchmark_tracking_error_window: int = 50
benchmark_information_ratio_annualization: float = 252.0
benchmark_save_history: bool = True

# --- Walk-Forward Analysis Configuration ---
@dataclass
class WalkForwardConfig:
    """Configuration for walk-forward analysis."""
    n_splits: int = 5  # Number of train/validation splits
    train_expansion: bool = True  # True = expanding window, False = rolling window
    initial_train_size: float = 0.3  # Initial training fraction (for rolling window)
    retrain_frequency: int = 1  # Retrain every N steps in validation period
    save_models: bool = True  # Save model for each fold
    save_metrics: bool = True  # Save metrics per fold

# --- Ensemble Configuration ---
@dataclass
class EnsembleConfig:
    """Configuration for ensemble training."""
    n_models: int = 5  # Number of ensemble members
    hyperparameter_sets: List[Dict[str, Any]] = field(default_factory=list)
    ensemble_method: str = "weighted"  # "voting", "weighted", "best"
    weight_metric: str = "sharpe_ratio"  # Metric to use for weighting
    min_weight: float = 0.1  # Minimum weight per model
    save_ensemble: bool = True

# --- Paper Trading Configuration ---
@dataclass
class PaperTradingConfig:
    """Configuration for paper trading simulation."""
    initial_capital: float = 10000.0
    session_duration: Optional[int] = None  # Max steps (None = indefinite)
    save_interval: int = 100  # Save state every N steps
    log_trades: bool = True
    persist_state: bool = True  # Survive restarts
    state_file: Optional[str] = None  # Path to save/load state

# --- Capital Allocation Configuration ---
@dataclass
class CapitalAllocationConfig:
    """Configuration for gradual capital allocation."""
    total_capital: float = 100000.0  # Total available capital
    allocation_stages: List[float] = field(default_factory=lambda: [0.01, 0.05, 0.10])
    performance_window: int = 100  # Steps to evaluate performance
    sharpe_threshold_up: float = 1.5  # Sharpe to increase allocation
    sharpe_threshold_down: float = 0.5  # Sharpe to decrease allocation
    max_drawdown_limit: float = 0.10  # Max DD trigger for reduction
    consecutive_wins: int = 5  # Consecutive profitable days to escalate
    cooldown_period: int = 20  # Steps between allocation changes

# --- Benchmark Configuration ---
@dataclass
class BenchmarkConfig:
    """Configuration for benchmark comparison."""
    benchmark_strategies: List[str] = field(default_factory=lambda: ["buy_and_hold", "equal_weight", "random"])
    benchmark_metrics: List[str] = field(default_factory=lambda: ["sharpe_ratio", "total_return", "max_drawdown", "calmar_ratio"])
    tracking_error_window: int = 50  # Window for tracking error calc
    information_ratio_annualization: float = 252.0
    save_benchmark_history: bool = True
