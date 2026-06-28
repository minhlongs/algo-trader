"""
State builder: constructs Observation objects from raw inputs.
"""

from typing import Dict, Any
import numpy as np
from rl.types import Position, AccountInfo, MarketData, Observation

class StateBuilder:
    """Builds and normalizes observations for the environment."""

    def __init__(self, feature_columns: list, normalization: str = "standard"):
        """
        Initialize state builder.

        Args:
            feature_columns: List of market data column names
            normalization: "standard", "minmax", or "none"
        """
        self.feature_columns = feature_columns
        self.normalization = normalization
        self.scaler = None  # Fitted scaler for normalization

    def build_observation(
        self,
        position: Position,
        account: AccountInfo,
        market_data: Dict[str, Any],
        indicators: Dict[str, float] = None
    ) -> Observation:
        """
        Construct an Observation from components.

        Args:
            position: Current position
            account: Account state
            market_data: Dict with keys: timestamp, open, high, low, close, volume
            indicators: Optional technical indicators

        Returns:
            Observation object
        """
        market = MarketData(
            timestamp=market_data["timestamp"],
            open=float(market_data["open"]),
            high=float(market_data["high"]),
            low=float(market_data["low"]),
            close=float(market_data["close"]),
            volume=float(market_data["volume"]),
            indicators=indicators or {}
        )
        return Observation(position=position, account=account, market=market)

    def normalize_observation(self, observation: Observation) -> np.ndarray:
        """
        Flatten and optionally normalize observation into a vector.

        Returns:
            numpy array of features
        """
        vector = observation.to_vector()

        if self.normalization == "none" or self.scaler is None:
            return np.array(vector, dtype=np.float32)

        # Apply scaling
        if self.normalization == "standard":
            vector = self.scaler.transform([vector])[0]
        elif self.normalization == "minmax":
            # Simple minmax to [0,1]
            mins = self.scaler["mins"]
            maxs = self.scaler["maxs"]
            vector = (vector - mins) / (maxs - mins + 1e-8)
        return np.array(vector, dtype=np.float32)

    def fit(self, observations: list[Observation]) -> None:
        """Fit normalizer to a batch of observations."""
        vectors = [obs.to_vector() for obs in observations]
        data = np.array(vectors)
        if self.normalization == "standard":
            mean = np.mean(data, axis=0)
            std = np.std(data, axis=0) + 1e-8
            self.scaler = {"mean": mean, "std": std}
        elif self.normalization == "minmax":
            mins = np.min(data, axis=0)
            maxs = np.max(data, axis=0)
            self.scaler = {"mins": mins, "maxs": maxs}
