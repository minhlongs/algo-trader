"""
Pytest configuration and fixtures for RL tests.
"""

import pytest
import numpy as np
import pandas as pd
from pathlib import Path
from rl.config import RLConfig
from rl.data.loader import MarketDataLoader
from rl.environment import MarketEnv

@pytest.fixture
def sample_config():
    """Provide a minimal RLConfig for testing."""
    return RLConfig(
        initial_balance=10000.0,
        max_episode_steps=100,
        transaction_cost=0.001,
        action_type="continuous",
        reward_type="sharpe",
        total_timesteps=100,
        learning_rate=1e-3
    )

@pytest.fixture
def sample_market_data(tmp_path) -> Path:
    """Create a small synthetic CSV file for testing."""
    data = {
        'open': np.random.rand(100) * 100 + 100,
        'high': np.random.rand(100) * 100 + 100,
        'low': np.random.rand(100) * 100 + 100,
        'close': np.random.rand(100) * 100 + 100,
        'volume': np.random.randint(1000, 10000, 100)
    }
    df = pd.DataFrame(data)
    csv_path = tmp_path / "sample_data.csv"
    df.to_csv(csv_path, index=False)
    return csv_path

@pytest.fixture
def data_loader(sample_market_data):
    """Create a MarketDataLoader with sample data."""
    loader = MarketDataLoader(
        data_path=str(sample_market_data),
        technical_indicators=True,
        normalization="none"
    )
    data = loader.load_data()
    return loader, data

@pytest.fixture
def env(sample_config, data_loader):
    """Create a MarketEnv with loaded data."""
    _, data = data_loader
    env = MarketEnv(config=sample_config, data=data)
    return env
