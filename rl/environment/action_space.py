"""
Action space definitions for RL trading environment.

Provides both discrete and continuous action space implementations.
"""

from typing import Tuple
import numpy as np
from rl.types import TradingAction

class DiscreteActionSpace:
    """Discrete action space: combination of action type and position sizing."""

    def __init__(self, n_position_levels: int = 5):
        """
        Initialize discrete action space.

        Args:
            n_position_levels: Number of position size levels (e.g., 5 means 20%, 40%, ..., 100%)
        """
        self.n_position_levels = n_position_levels
        # Actions: 0=hold, 1=buy with level k, 2=sell with level k for k in 1..n_position_levels
        # Actually encoding: total actions = 1 + 2*n_position_levels
        # For simplicity: action index 0=hold, 1..n=buy(level1..levelN), n+1..2n=sell(level1..levelN)
        self.n_actions = 1 + 2 * n_position_levels
        self.action_map = self._build_action_map()

    def _build_action_map(self) -> dict[int, TradingAction]:
        """Build mapping from action index to TradingAction."""
        action_map = {}
        action_map[0] = TradingAction(action_type=0, position_size=0.0)  # hold
        for i in range(1, self.n_position_levels + 1):
            level = i / self.n_position_levels  # fraction: 0.2, 0.4, ...
            action_map[i] = TradingAction(action_type=1, position_size=level)  # buy
        for i in range(self.n_position_levels + 1, 2 * self.n_position_levels + 1):
            level = (i - self.n_position_levels) / self.n_position_levels
            action_map[i] = TradingAction(action_type=2, position_size=level)  # sell
        return action_map

    def sample(self) -> int:
        """Sample a random action uniformly."""
        return np.random.randint(0, self.n_actions)

    def decode(self, action: int) -> TradingAction:
        """Convert action index to TradingAction."""
        if action not in self.action_map:
            raise ValueError(f"Invalid action {action}. Valid range: 0-{self.n_actions-1}")
        return self.action_map[action]

    def encode(self, action_type: int, position_size: float) -> int:
        """Convert action_type and position_size to action index."""
        if action_type == 0:  # hold
            return 0
        if action_type == 1:  # buy
            level = int(round(position_size * self.n_position_levels))
            level = max(1, min(level, self.n_position_levels))
            return level
        if action_type == 2:  # sell
            level = int(round(position_size * self.n_position_levels))
            level = max(1, min(level, self.n_position_levels))
            return self.n_position_levels + level
        raise ValueError(f"Invalid action_type: {action_type}")

class ContinuousActionSpace:
    """Continuous action space: 4-dim vector [hold_prob, buy_prob, sell_prob, position_size]."""

    def __init__(self, position_limit: float = 1.0):
        """
        Initialize continuous action space.

        Args:
            position_limit: Maximum fraction of capital per trade
        """
        self.position_limit = position_limit
        # Action vector: [hold, buy, sell, position_size]
        # First three are logits, position_size is in [0, position_limit]
        self.low = np.array([0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        self.high = np.array([1.0, 1.0, 1.0, position_limit], dtype=np.float32)

    def sample(self) -> np.ndarray:
        """Sample a random action uniformly from the space."""
        hold = np.random.rand()
        buy = np.random.rand()
        sell = np.random.rand()
        pos_size = np.random.rand() * self.position_limit
        # Normalize first three to sum to 1? Actually not necessary; policy can output raw then softmax.
        # For random sampling, we can sample Dirichlet-like.
        raw = np.random.rand(3)
        raw = raw / raw.sum()
        return np.array([raw[0], raw[1], raw[2], pos_size], dtype=np.float32)

    def decode(self, action: np.ndarray) -> TradingAction:
        """
        Decode continuous action vector into TradingAction.

        Args:
            action: Array [hold_prob, buy_prob, sell_prob, position_size]
        Returns:
            TradingAction with action_type and position_size
        """
        hold, buy, sell, pos_size = action
        probs = np.array([hold, buy, sell])
        action_type = int(np.argmax(probs))  # 0=hold, 1=buy, 2=sell
        return TradingAction(action_type=action_type, position_size=float(pos_size))

    def encode(self, action_type: int, position_size: float) -> np.ndarray:
        """Encode action type and size into a valid continuous vector."""
        hold = 1.0 if action_type == 0 else 0.0
        buy = 1.0 if action_type == 1 else 0.0
        sell = 1.0 if action_type == 2 else 0.0
        pos = np.clip(position_size, 0.0, self.position_limit)
        return np.array([hold, buy, sell, pos], dtype=np.float32)
