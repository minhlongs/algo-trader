"""
Reinforcement Learning Framework for Algorithmic Trading.

A production-ready RL framework built on Gymnasium and Stable Baselines3,
designed for training, evaluating, and deploying trading agents.
"""

__version__ = "0.2.0"

from rl.config import RLConfig
from rl.types import (
    Position,
    AccountInfo,
    MarketData,
    Observation,
    TradingAction,
    Trade,
    EpisodeHistory,
    # Advanced features types
    WalkForwardSplit,
    WalkForwardResult,
    WalkForwardSummary,
    EnsembleMember,
    EnsemblePrediction,
    PaperTradingSession,
    CapitalAllocationDecision,
    CapitalAllocatorState,
    BenchmarkResult,
    PerformanceMonitor,
)

__all__ = [
    "RLConfig",
    "Position",
    "AccountInfo",
    "MarketData",
    "Observation",
    "TradingAction",
    "Trade",
    "EpisodeHistory",
    # Advanced features
    "WalkForwardSplit",
    "WalkForwardResult",
    "WalkForwardSummary",
    "EnsembleMember",
    "EnsemblePrediction",
    "PaperTradingSession",
    "CapitalAllocationDecision",
    "CapitalAllocatorState",
    "BenchmarkResult",
    "PerformanceMonitor",
]
