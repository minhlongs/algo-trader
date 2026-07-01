"""Tests for RL algorithms (registry and basic trainer functionality)."""

import pytest
import numpy as np
from rl.algorithms import get_algorithm, list_algorithms, register_algorithm
from rl.config import RLConfig
from rl.environment import MarketEnv

def test_algorithm_registry():
    """Test that standard algorithms are registered."""
    available = list_algorithms()
    assert "ppo" in available
    assert "sac" in available
    assert "dqn" in available

def test_get_algorithm():
    """Test retrieving algorithm classes."""
    PPOTrainer = get_algorithm("ppo")
    SACTrainer = get_algorithm("sac")
    DQNTrainer = get_algorithm("dqn")
    assert PPOTrainer.__name__ == "PPOTrainer"
    assert SACTrainer.__name__ == "SACTrainer"
    assert DQNTrainer.__name__ == "DQNTrainer"

def test_get_algorithm_invalid():
    """Test that invalid algorithm raises error."""
    with pytest.raises(ValueError):
        get_algorithm("nonexistent")

def test_register_custom_algorithm():
    """Test registering a custom algorithm."""
    from rl.algorithms.base import BaseTrainer

    class CustomTrainer(BaseTrainer):
        def _build_model(self):
            return None
        def predict(self, obs, deterministic=True):
            return np.zeros(1)
        def save_checkpoint(self, path):
            pass
        def load_checkpoint(self, path):
            pass

    register_algorithm("custom", CustomTrainer)
    # Note: Registry cleanup would require restoring original state; skipped for simplicity
    assert "custom" in available

def test_ppo_trainer_creation(sample_config, data_loader):
    """Test that PPOTrainer can be instantiated."""
    from rl.algorithms import PPOTrainer
    _, data = data_loader
    env = MarketEnv(config=sample_config, data=data)
    trainer = PPOTrainer(env=env, config=RLConfig(total_timesteps=10))
    assert trainer.model is not None

def test_sac_trainer_creation(sample_config, data_loader):
    """Test SACTrainer instantiation."""
    from rl.algorithms import SACTrainer
    _, data = data_loader
    # SAC requires continuous action space
    sample_config.action_type = "continuous"
    env = MarketEnv(config=sample_config, data=data)
    trainer = SACTrainer(env=env, config=RLConfig(total_timesteps=10))
    assert trainer.model is not None

def test_dqn_trainer_creation(sample_config, data_loader):
    """Test DQNTrainer instantiation."""
    from rl.algorithms import DQNTrainer
    _, data = data_loader
    # DQN requires discrete action space
    sample_config.action_type = "discrete"
    env = MarketEnv(config=sample_config, data=data)
    trainer = DQNTrainer(env=env, config=RLConfig(total_timesteps=10))
    assert trainer.model is not None

def test_short_training_run(sample_config, data_loader):
    """Test a very short training run to ensure pipeline works."""
    from rl.training import TrainingPipeline
    from rl.algorithms import get_algorithm

    _, data = data_loader
    pipeline = TrainingPipeline(sample_config)
    # Override data loading: we already have data
    pipeline.prepare_data = lambda: (None, data)  # type: ignore
    results = pipeline.train(algorithm_name="ppo", eval_freq=5)
    assert "final_step" in results
    assert results["final_step"] >= sample_config.total_timesteps
