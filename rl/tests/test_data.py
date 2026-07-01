"""Tests for data loading and feature engineering."""

import pytest
import numpy as np
import pandas as pd
from rl.data.loader import MarketDataLoader
from rl.data.features import prepare_features, compute_technical_indicators, add_price_features

def test_market_data_loader(sample_market_data):
    """Test data loader loads CSV and computes features."""
    loader = MarketDataLoader(
        data_path=str(sample_market_data),
        technical_indicators=True,
        normalization="standard"
    )
    data = loader.load_data()
    assert isinstance(data, np.ndarray)
    assert data.ndim == 2
    assert len(data) > 0
    # Features should include indicators
    assert data.shape[1] > 5  # More than OHLCV

def test_market_data_loader_no_indicators(sample_market_data):
    """Test loader without technical indicators."""
    loader = MarketDataLoader(
        data_path=str(sample_market_data),
        technical_indicators=False,
        normalization="none"
    )
    data = loader.load_data()
    # Should have basic features only (OHLCV + price features/returns)
    assert data.shape[1] > 5

def test_normalization_standard(sample_market_data):
    """Test that standardization produces mean ~0 and std ~1."""
    loader = MarketDataLoader(
        data_path=str(sample_market_data),
        technical_indicators=False,
        normalization="standard"
    )
    data = loader.load_data()
    means = np.mean(data, axis=0)
    stds = np.std(data, axis=0)
    # Means should be close to 0, stds close to 1
    assert np.allclose(means, 0, atol=0.5)
    assert np.allclose(stds, 1, atol=0.5)

def test_normalization_minmax(sample_market_data):
    """Test minmax normalization."""
    loader = MarketDataLoader(
        data_path=str(sample_market_data),
        technical_indicators=False,
        normalization="minmax"
    )
    data = loader.load_data()
    mins = np.min(data, axis=0)
    maxs = np.max(data, axis=0)
    assert np.all(mins >= -0.01)  # near 0
    assert np.all(maxs <= 1.01)   # near 1

def test_sequence_creation(sample_market_data):
    """Test sliding window sequence creation."""
    loader = MarketDataLoader(
        data_path=str(sample_market_data),
        technical_indicators=False
    )
    data = loader.load_data()
    sequences = loader.create_sequences(data, sequence_length=10)
    assert sequences.shape[0] == len(data) - 9
    assert sequences.shape[1] == 10
    assert sequences.shape[2] == data.shape[1]

def test_data_split(sample_market_data):
    """Test data splitting."""
    loader = MarketDataLoader(
        data_path=str(sample_market_data),
        technical_indicators=False
    )
    data = loader.load_data()
    train, val, test = loader.split_data(data, train_ratio=0.6, val_ratio=0.2)
    total = len(data)
    assert len(train) == int(total * 0.6)
    assert len(val) == int(total * 0.2)
    assert len(test) == total - len(train) - len(val)

def test_compute_technical_indicators():
    """Test that technical indicators are computed without NaNs at head."""
    df = pd.DataFrame({
        'open': np.random.rand(50) * 100 + 100,
        'high': np.random.rand(50) * 100 + 100,
        'low': np.random.rand(50) * 100 + 100,
        'close': np.random.rand(50) * 100 + 100,
        'volume': np.random.randint(1000, 10000, 50)
    })
    df = compute_technical_indicators(df)
    # Check that indicator columns exist
    assert 'rsi_14' in df.columns
    assert 'macd' in df.columns
    # First few rows will have NaNs due to rolling windows
    # After dropna, we should have clean data
    df_clean = df.dropna()
    assert len(df_clean) < len(df)
    assert not df_clean.isna().any().any()

def test_add_price_features():
    """Test price feature additions."""
    df = pd.DataFrame({
        'open': [100, 101, 102],
        'high': [102, 103, 104],
        'low': [99, 100, 101],
        'close': [101, 102, 103],
        'volume': [1000, 1100, 1200]
    })
    df = add_price_features(df)
    assert 'high_low_range' in df.columns
    assert 'close_open_diff' in df.columns
    assert 'price_to_volume' in df.columns

def test_prepare_features():
    """Test full feature pipeline."""
    df = pd.DataFrame({
        'open': np.random.rand(100) * 100 + 100,
        'high': np.random.rand(100) * 100 + 100,
        'low': np.random.rand(100) * 100 + 100,
        'close': np.random.rand(100) * 100 + 100,
        'volume': np.random.randint(1000, 10000, 100)
    })
    df_features = prepare_features(df, include_indicators=True)
    # Should have many columns now
    assert len(df_features.columns) > 10
    # Should be numeric only mostly
    numeric_cols = df_features.select_dtypes(include=[np.number]).columns
    assert len(numeric_cols) > 5
