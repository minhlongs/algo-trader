"""
Gymnasium-compatible trading environment.

The core environment that implements the OpenAI Gym interface for RL training.
"""

from typing import Tuple, Dict, Any, Optional
import gymnasium as gym
from gymnasium import spaces
import numpy as np
import pandas as pd
from rl.config import RLConfig
from rl.types import Position, AccountInfo, MarketData, Observation, Trade, EpisodeHistory
from rl.environment.action_space import DiscreteActionSpace, ContinuousActionSpace
from rl.environment.reward import RewardCalculator
from rl.environment.state_builder import StateBuilder
from rl.data.loader import MarketDataLoader

class MarketEnv(gym.Env):
    """
    A Gymnasium environment for algorithmic trading.

    Observations: flattened vector of position, account, and market features
    Actions: either discrete (hold/buy/sell with discrete position sizes) or continuous
    Rewards: risk-adjusted return (Sharpe ratio by default) with optional penalties
    """

    metadata = {"render.modes": ["human", "ansi"], "render_fps": 4}

    def __init__(self, config: RLConfig, data_loader: Optional[MarketDataLoader] = None, data: Optional[np.ndarray] = None):
        """
        Initialize the trading environment.

        Args:
            config: RL configuration object
            data_loader: Optional MarketDataLoader to load data on the fly
            data: Optional numpy array of preprocessed data (shape: [timesteps, features])
                  If both data_loader and data are None, you must call load_data() later.
        """
        super().__init__()
        self.config = config
        self.data_loader = data_loader
        self.raw_data = data
        self.current_step = 0
        self.episode_history: Optional[EpisodeHistory] = None

        # Action space
        self.action_space_wrapper = DiscreteActionSpace(n_position_levels=config.discrete_action_levels) \
            if config.action_type == "discrete" else ContinuousActionSpace(position_limit=config.continuous_position_limit)
        self.action_space = self._create_gym_action_space()

        # Observation space
        # Determine observation size: position(4) + account(4) + market(5+indicators)
        # We'll compute indicator count from data if available
        indicator_count = 0
        if data is not None:
            # Data includes OHLCV + indicators
            indicator_count = data.shape[1] - 5  # assuming first 5 are OHLCV
        self.observation_space_dim = 4 + 4 + 5 + indicator_count
        self.observation_space = spaces.Box(
            low=-np.inf, high=np.inf, shape=(self.observation_space_dim,), dtype=np.float32
        )

        # State builder
        self.state_builder = StateBuilder(
            feature_columns=config.feature_columns,
            normalization=config.normalization
        )

        # Reward calculator
        self.reward_calculator = RewardCalculator(
            reward_type=config.reward_type,
            window=config.reward_window,
            max_drawdown_penalty=config.max_drawdown_penalty,
            turnover_penalty=config.turnover_penalty,
            reward_scale=config.reward_scale
        )

        # Data
        self.data: Optional[np.ndarray] = None
        self.data_length = 0

        # Load data if provided
        if self.raw_data is not None:
            self.data = self.raw_data
            self.data_length = len(self.data)

    def _create_gym_action_space(self):
        """Create the appropriate gym action space based on wrapper."""
        if isinstance(self.action_space_wrapper, DiscreteActionSpace):
            return spaces.Discrete(self.action_space_wrapper.n_actions)
        elif isinstance(self.action_space_wrapper, ContinuousActionSpace):
            low = self.action_space_wrapper.low
            high = self.action_space_wrapper.high
            return spaces.Box(low=low, high=high, dtype=np.float32)
        else:
            raise TypeError("Unknown action space wrapper")

    def load_data(self, data: np.ndarray) -> None:
        """Load preprocessed data into the environment."""
        self.data = data
        self.data_length = len(data)

    def reset(
        self,
        seed: Optional[int] = None,
        options: Optional[Dict[str, Any]] = None
    ) -> Tuple[np.ndarray, Dict[str, Any]]:
        """
        Reset environment to initial state.

        Returns:
            observation: initial state vector
            info: dict with auxiliary information
        """
        super().reset(seed=seed)

        if self.data is None or self.data_length == 0:
            raise RuntimeError("Data not loaded. Call load_data() or provide data in constructor.")

        # Set starting index (random or fixed)
        start_idx = options.get("start_idx", 0) if options else 0
        self.current_step = start_idx

        # Initialize account
        initial_balance = self.config.initial_balance
        self.position = Position(size=0.0, entry_price=0.0, unrealized_pnl=0.0, realized_pnl=0.0)
        self.account = AccountInfo(
            balance=initial_balance,
            equity=initial_balance,
            margin=0.0,
            buying_power=initial_balance
        )

        # Get initial market data
        market_row = self.data[self.current_step]
        # Assume first 5 columns are OHLCV
        open_price = market_row[0]
        high_price = market_row[1]
        low_price = market_row[2]
        close_price = market_row[3]
        volume = market_row[4]
        indicators = {}
        if len(market_row) > 5:
            indicator_names = sorted([f"indicator_{i}" for i in range(len(market_row) - 5)])
            for i, name in enumerate(indicator_names):
                indicators[name] = market_row[5 + i]

        self.current_market = MarketData(
            timestamp=self.current_step,
            open=open_price,
            high=high_price,
            low=low_price,
            close=close_price,
            volume=volume,
            indicators=indicators
        )

        # Initialize episode history
        self.episode_history = EpisodeHistory()
        obs = self._get_observation()
        self.episode_history.observations.append(obs)

        info = {
            "step": self.current_step,
            "position_size": self.position.size,
            "balance": self.account.balance,
            "equity": self.account.equity
        }

        return obs.to_vector(), info

    def step(self, action: Any) -> Tuple[np.ndarray, float, bool, bool, Dict[str, Any]]:
        """
        Execute one step in the environment.

        Args:
            action: Either discrete int or continuous np.ndarray depending on config

        Returns:
            observation: next state vector
            reward: scalar reward
            terminated: True if episode is done (bankrupt or ended)
            truncated: True if episode exceeded max steps
            info: dict with auxiliary info
        """
        if self.episode_history is None:
            raise RuntimeError("Environment not reset. Call reset() first.")

        # Decode action
        trading_action = self.action_space_wrapper.decode(action) if isinstance(action, (int, np.integer)) \
            else self.action_space_wrapper.decode(action)

        # Record pre-step equity for reward calculation
        pre_equity = self.account.equity

        # Advance data index
        self.current_step += 1
        if self.current_step >= self.data_length - 1:
            terminated = True
            truncated = False
            next_obs_vector = np.zeros(self.observation_space.shape[0], dtype=np.float32)
            reward = 0.0
            info = {"step": self.current_step, "reason": "data_exhausted"}
            return next_obs_vector, reward, terminated, truncated, info

        # Load next market data
        market_row = self.data[self.current_step]
        open_price = market_row[0]
        high_price = market_row[1]
        low_price = market_row[2]
        close_price = market_row[3]
        volume = market_row[4]
        indicators = {}
        if len(market_row) > 5:
            indicator_names = sorted([f"indicator_{i}" for i in range(len(market_row) - 5)])
            for i, name in enumerate(indicator_names):
                indicators[name] = market_row[5 + i]

        next_market = MarketData(
            timestamp=self.current_step,
            open=open_price,
            high=high_price,
            low=low_price,
            close=close_price,
            volume=volume,
            indicators=indicators
        )

        # Execute trade based on action
        turnover = 0.0
        trade: Optional[Trade] = None
        if trading_action.action_type == 1:  # buy
            # Size as fraction of buying power
            size_value = trading_action.position_size * self.account.buying_power / close_price
            if size_value > 0:
                # Average in
                if self.position.size == 0:
                    self.position.size = size_value
                    self.position.entry_price = close_price
                else:
                    total_cost = self.position.size * self.position.entry_price + size_value * close_price
                    self.position.size += size_value
                    self.position.entry_price = total_cost / self.position.size
                turnover = size_value * close_price / self.account.equity if self.account.equity > 0 else 0.0
                trade = Trade(
                    timestamp=self.current_step,
                    action=1,
                    size=size_value,
                    price=close_price,
                    pnl=0.0,
                    commission=size_value * close_price * self.config.transaction_cost
                )
                self.episode_history.trades.append(trade)
                # Deduct commission from balance
                self.account.balance -= trade.commission

        elif trading_action.action_type == 2:  # sell
            if self.position.size > 0:
                # Reduce or close position
                size_value = trading_action.position_size * self.position.size
                if size_value >= self.position.size:
                    # Close fully
                    sale_value = self.position.size * close_price
                    realized_pnl = (close_price - self.position.entry_price) * self.position.size
                    self.position.size = 0
                    self.position.entry_price = 0.0
                    self.position.realized_pnl += realized_pnl
                    turnover = sale_value / self.account.equity if self.account.equity > 0 else 0.0
                    trade = Trade(
                        timestamp=self.current_step,
                        action=2,
                        size=self.position.size,
                        price=close_price,
                        pnl=realized_pnl,
                        commission=sale_value * self.config.transaction_cost
                    )
                    self.episode_history.trades.append(trade)
                    self.account.balance += sale_value - trade.commission
                    self.account.balance += realized_pnl
                else:
                    # Partial sell
                    sale_value = size_value * close_price
                    realized_pnl = (close_price - self.position.entry_price) * size_value
                    self.position.size -= size_value
                    self.position.realized_pnl += realized_pnl
                    turnover = sale_value / self.account.equity if self.account.equity > 0 else 0.0
                    trade = Trade(
                        timestamp=self.current_step,
                        action=2,
                        size=size_value,
                        price=close_price,
                        pnl=realized_pnl,
                        commission=sale_value * self.config.transaction_cost
                    )
                    self.episode_history.trades.append(trade)
                    self.account.balance += sale_value - trade.commission
                    self.account.balance += realized_pnl

        # Mark-to-market: update unrealized PnL and equity
        if self.position.size > 0:
            self.position.unrealized_pnl = (close_price - self.position.entry_price) * self.position.size
        else:
            self.position.unrealized_pnl = 0.0
        self.account.equity = self.account.balance + self.position.unrealized_pnl + self.position.realized_pnl
        self.account.buying_power = self.account.equity  # Simplified: no margin

        # Record step return for reward
        step_return = (self.account.equity - pre_equity) / (pre_equity + 1e-8)
        self.episode_history.returns.append(step_return)
        self.episode_history.equity_curve.append(self.account.equity)

        # Calculate reward
        reward = self.reward_calculator.calculate(self.episode_history, step_return, turnover)

        # Build next observation
        next_observation = self.state_builder.build_observation(
            position=self.position,
            account=self.account,
            market_data={
                "timestamp": next_market.timestamp,
                "open": next_market.open,
                "high": next_market.high,
                "low": next_market.low,
                "close": next_market.close,
                "volume": next_market.volume
            },
            indicators=next_market.indicators
        )
        self.current_market = next_market
        self.episode_history.observations.append(next_observation)

        # Termination conditions
        terminated = False
        truncated = False
        if self.account.equity <= 0:
            terminated = True  # Bankruptcy
        if self.current_step >= self.config.max_episode_steps:
            terminated = True
            truncated = True

        info = {
            "step": self.current_step,
            "position_size": self.position.size,
            "balance": self.account.balance,
            "equity": self.account.equity,
            "unrealized_pnl": self.position.unrealized_pnl,
            "realized_pnl": self.position.realized_pnl,
            "turnover": turnover,
            "trade": trade
        }

        return next_observation.to_vector(), reward, terminated, truncated, info

    def render(self, mode: str = "human") -> None:
        """Render environment state."""
        if mode == "human":
            print(f"Step: {self.current_step}")
            print(f"Position: size={self.position.size:.4f}, entry={self.position.entry_price:.2f}")
            print(f"Account: balance={self.account.balance:.2f}, equity={self.account.equity:.2f}")
            print(f"Market: close={self.current_market.close:.2f}")
        elif mode == "ansi":
            return f"Step {self.current_step}: equity={self.account.equity:.2f}"

    def close(self) -> None:
        """Clean up resources."""
        pass
