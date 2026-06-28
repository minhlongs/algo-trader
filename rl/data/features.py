"""
Feature engineering utilities for market data.
"""

from typing import Dict
import pandas as pd
import numpy as np

def compute_technical_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute common technical indicators.

    Args:
        df: DataFrame with columns: open, high, low, close, volume

    Returns:
        DataFrame with additional indicator columns
    """
    # RSI (14)
    delta = df['close'].diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
    rs = gain / (loss + 1e-8)
    df['rsi_14'] = 100 - (100 / (1 + rs))

    # MACD
    ema_12 = df['close'].ewm(span=12, adjust=False).mean()
    ema_26 = df['close'].ewm(span=26, adjust=False).mean()
    df['macd'] = ema_12 - ema_26
    df['macd_signal'] = df['macd'].ewm(span=9, adjust=False).mean()
    df['macd_hist'] = df['macd'] - df['macd_signal']

    # Bollinger Bands (20, 2 std)
    sma_20 = df['close'].rolling(window=20).mean()
    std_20 = df['close'].rolling(window=20).std()
    df['bb_upper'] = sma_20 + 2 * std_20
    df['bb_lower'] = sma_20 - 2 * std_20
    df['bb_width'] = (df['bb_upper'] - df['bb_lower']) / (sma_20 + 1e-8)

    # ATR (14)
    high_low = df['high'] - df['low']
    high_close = np.abs(df['high'] - df['close'].shift())
    low_close = np.abs(df['low'] - df['close'].shift())
    true_range = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
    df['atr_14'] = true_range.rolling(window=14).mean()

    # SMA
    df['sma_10'] = df['close'].rolling(window=10).mean()
    df['sma_20'] = sma_20
    df['sma_50'] = df['close'].rolling(window=50).mean()
    df['sma_200'] = df['close'].rolling(window=200).mean()

    # EMA
    df['ema_12'] = ema_12
    df['ema_26'] = ema_26

    # Price velocity and acceleration (first and second derivative)
    df['price_velocity'] = df['close'].diff(1)
    df['price_acceleration'] = df['price_velocity'].diff(1)

    # Log returns
    df['log_return'] = np.log(df['close'] / df['close'].shift(1))

    return df

def add_price_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add price-derived features."""
    # Already included in technical indicators: velocity, acceleration, log returns
    # Additional features:
    df['high_low_range'] = df['high'] - df['low']
    df['close_open_diff'] = df['close'] - df['open']
    df['price_to_volume'] = df['close'] / (df['volume'] + 1)
    return df

def add_returns_features(df: pd.DataFrame, periods: list = [1, 5, 20]) -> pd.DataFrame:
    """Add multi-period returns."""
    for p in periods:
        df[f'return_{p}'] = df['close'].pct_change(periods=p)
    return df

def prepare_features(
    df: pd.DataFrame,
    include_indicators: bool = True,
    custom_features: list = None
) -> pd.DataFrame:
    """
    Prepare full feature set from raw OHLCV DataFrame.

    Args:
        df: DataFrame with at least columns: open, high, low, close, volume
        include_indicators: Whether to compute technical indicators
        custom_features: List of additional feature functions to apply

    Returns:
        DataFrame with all features
    """
    # Make a copy
    df = df.copy()

    # Basic price features
    df = add_price_features(df)

    # Multi-period returns
    df = add_returns_features(df)

    # Technical indicators
    if include_indicators:
        df = compute_technical_indicators(df)

    # Custom features
    if custom_features:
        for feat_fn in custom_features:
            df = feat_fn(df)

    # Drop NaN rows from rolling calculations
    df = df.dropna()

    return df
