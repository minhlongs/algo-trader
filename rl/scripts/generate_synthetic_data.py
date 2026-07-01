#!/usr/bin/env python3
"""
Generate synthetic market data for testing RL environment.
"""

import argparse
import numpy as np
import pandas as pd
from pathlib import Path

def geometric_brownian_motion(n_steps: int, mu: float = 0.0001, sigma: float = 0.01, s0: float = 100.0) -> np.ndarray:
    """Generate price series using geometric Brownian motion."""
    dt = 1.0
    w = np.random.normal(0, np.sqrt(dt), n_steps)
    returns = (mu - 0.5 * sigma**2) * dt + sigma * w
    price_path = s0 * np.exp(np.cumsum(returns))
    return price_path

def generate_sample_data(
    n_steps: int = 10000,
    output_path: str = "sample_market_data.csv",
    include_weekends: bool = False
) -> pd.DataFrame:
    """
    Generate synthetic OHLCV data.

    Args:
        n_steps: Number of timesteps (days)
        output_path: Where to save CSV
        include_weekends: If True, include weekend gaps (for crypto-like data)

    Returns:
        DataFrame with generated data
    """
    # Generate close prices
    closes = geometric_brownian_motion(n_steps, mu=0.0002, sigma=0.015, s0=100.0)

    # Generate open, high, low from close with some noise
    opens = closes * (1 + np.random.uniform(-0.005, 0.005, n_steps))
    highs = np.maximum(opens, closes) * (1 + np.random.uniform(0.001, 0.01, n_steps))
    lows = np.minimum(opens, closes) * (1 - np.random.uniform(0.001, 0.01, n_steps))

    # Volume: random but correlated with price movement
    base_volume = 1000000
    volume = np.random.lognormal(mean=np.log(base_volume), sigma=0.5, size=n_steps)

    # Timestamp
    if include_weekends:
        # 7 days a week
        freq = "D"
    else:
        # Only weekdays (simplify by just using range)
        freq = "B"  # Business day

    dates = pd.date_range(start="2020-01-01", periods=n_steps, freq=freq)

    df = pd.DataFrame({
        "timestamp": dates,
        "open": opens,
        "high": highs,
        "low": lows,
        "close": closes,
        "volume": volume.astype(int)
    })

    output_path = Path(output_path)
    df.to_csv(output_path, index=False)
    print(f"Generated {n_steps} timesteps to {output_path}")
    return df

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate synthetic market data")
    parser.add_argument("--steps", type=int, default=10000, help="Number of timesteps")
    parser.add_argument("--output", type=str, default="sample_market_data.csv", help="Output CSV path")
    parser.add_argument("--include-weekends", action="store_true", help="Include weekends (crypto)")
    args = parser.parse_args()

    generate_sample_data(
        n_steps=args.steps,
        output_path=args.output,
        include_weekends=args.include_weekends
    )
