"""
Data loading and preprocessing for RL trading environment.

Provides MarketDataLoader to load CSV files and produce normalized numpy arrays.
"""

from typing import Optional, Tuple
import pandas as pd
import numpy as np
from pathlib import Path
from .features import prepare_features
import pickle

class MarketDataLoader:
    """
    Loads market data from CSV, computes features, and returns numpy arrays.
    """

    def __init__(
        self,
        data_path: str,
        feature_columns: list = None,
        technical_indicators: bool = True,
        normalization: str = "standard",
        window_size: int = 20
    ):
        """
        Initialize data loader.

        Args:
            data_path: Path to CSV file with OHLCV data
            feature_columns: List of columns to include (default: open, high, low, close, volume)
            technical_indicators: Whether to compute technical indicators
            normalization: "standard", "minmax", or "none"
            window_size: Size of sliding window for sequential models (if needed)
        """
        self.data_path = Path(data_path)
        self.feature_columns = feature_columns or ["open", "high", "low", "close", "volume"]
        self.technical_indicators = technical_indicators
        self.normalization = normalization
        self.window_size = window_size
        self.scaler = None
        self.data: Optional[np.ndarray] = None
        self.raw_df: Optional[pd.DataFrame] = None

    def load_data(self) -> np.ndarray:
        """
        Load CSV, compute features, normalize, return numpy array.

        Returns:
            Array of shape (timesteps, num_features)
        """
        # Read CSV
        df = pd.read_csv(self.data_path)
        # Ensure required columns exist
        required = ['open', 'high', 'low', 'close', 'volume']
        for col in required:
            if col not in df.columns:
                raise ValueError(f"Missing required column: {col}")

        # Keep only relevant columns initially
        df = df[required + [c for c in df.columns if c not in required and c in self.feature_columns]]

        # Prepare features (adds indicators and derived features)
        if self.technical_indicators:
            df = prepare_features(df, include_indicators=True)
        else:
            df = prepare_features(df, include_indicators=False)

        # Save raw df for reference
        self.raw_df = df.copy()

        # Determine feature columns: all numeric columns after processing
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        # Ensure ordering is consistent
        self.feature_columns = numeric_cols

        # Convert to numpy
        data_array = df[numeric_cols].values.astype(np.float32)

        # Normalize if requested
        if self.normalization == "standard":
            mean = data_array.mean(axis=0)
            std = data_array.std(axis=0) + 1e-8
            data_array = (data_array - mean) / std
            self.scaler = {"mean": mean, "std": std}
        elif self.normalization == "minmax":
            mins = data_array.min(axis=0)
            maxs = data_array.max(axis=0)
            data_array = (data_array - mins) / (maxs - mins + 1e-8)
            self.scaler = {"mins": mins, "maxs": maxs}

        self.data = data_array
        return data_array

    def create_sequences(self, data: np.ndarray, sequence_length: int) -> np.ndarray:
        """
        Create overlapping sequences from data.

        Args:
            data: Array of shape (timesteps, features)
            sequence_length: Length of each sequence

        Returns:
            Array of shape (num_sequences, sequence_length, features)
        """
        sequences = []
        for i in range(len(data) - sequence_length + 1):
            sequences.append(data[i:i+sequence_length])
        return np.array(sequences, dtype=np.float32)

    def save_scaler(self, path: str) -> None:
        """Save scaler to pickle file."""
        if self.scaler is None:
            raise ValueError("No scaler to save. Load data first.")
        with open(path, 'wb') as f:
            pickle.dump(self.scaler, f)

    def load_scaler(self, path: str) -> None:
        """Load scaler from pickle file."""
        with open(path, 'rb') as f:
            self.scaler = pickle.load(f)

    def split_data(
        self,
        data: np.ndarray,
        train_ratio: float = 0.7,
        val_ratio: float = 0.15
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        Split data into train, validation, test sets.

        Returns:
            train_data, val_data, test_data
        """
        n = len(data)
        train_end = int(n * train_ratio)
        val_end = int(n * (train_ratio + val_ratio))
        train = data[:train_end]
        val = data[train_end:val_end]
        test = data[val_end:]
        return train, val, test
