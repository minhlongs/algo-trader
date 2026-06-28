"""Algorithms package for RL trading."""

from rl.algorithms.base import BaseTrainer, TrainingConfig
from rl.algorithms.ppo_trainer import PPOTrainer
from rl.algorithms.sac_trainer import SACTrainer
from rl.algorithms.dqn_trainer import DQNTrainer
from rl.algorithms.registry import register_algorithm, get_algorithm, list_algorithms

__all__ = [
    "BaseTrainer",
    "TrainingConfig",
    "PPOTrainer",
    "SACTrainer",
    "DQNTrainer",
    "register_algorithm",
    "get_algorithm",
    "list_algorithms",
]
