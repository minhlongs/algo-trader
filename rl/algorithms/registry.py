"""
Algorithm registry for easy lookup.

Allows registering and retrieving trainer classes by name.
"""

from typing import Type, Dict
from .base import BaseTrainer
from .ppo_trainer import PPOTrainer
from .sac_trainer import SACTrainer
from .dqn_trainer import DQNTrainer

# Global registry
_ALGORITHM_REGISTRY: Dict[str, Type[BaseTrainer]] = {
    "ppo": PPOTrainer,
    "sac": SACTrainer,
    "dqn": DQNTrainer,
}

def register_algorithm(name: str, trainer_class: Type[BaseTrainer]) -> None:
    """Register a new algorithm."""
    _ALGORITHM_REGISTRY[name.lower()] = trainer_class

def get_algorithm(name: str) -> Type[BaseTrainer]:
    """Get trainer class by name."""
    name = name.lower()
    if name not in _ALGORITHM_REGISTRY:
        available = ", ".join(_ALGORITHM_REGISTRY.keys())
        raise ValueError(f"Algorithm '{name}' not found. Available: {available}")
    return _ALGORITHM_REGISTRY[name]

def list_algorithms() -> list[str]:
    """List available algorithm names."""
    return list(_ALGORITHM_REGISTRY.keys())
