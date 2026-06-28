"""
Deep Q-Network (DQN) trainer.

Wraps Stable Baselines3 DQN. Supports discrete action spaces.
Can enable Double DQN and Dueling architecture.
"""

from typing import Any, Dict
import numpy as np
import gymnasium as gym
from stable_baselines3 import DQN
from .base import BaseTrainer, TrainingConfig

class DQNTrainer(BaseTrainer):
    """DQN algorithm trainer for discrete action spaces."""

    def __init__(
        self,
        env: gym.Env,
        config: TrainingConfig,
        eval_env: gym.Env = None
    ):
        super().__init__(env, config, eval_env)
        if config.net_arch is None:
            config.net_arch = [256, 256]
        self.model = self._build_model()

    def _build_model(self) -> DQN:
        """Construct DQN model."""
        policy_kwargs = dict(
            net_arch=self.config.net_arch
        )
        model = DQN(
            policy="MlpPolicy",
            env=self.env,
            learning_rate=self.config.learning_rate,
            buffer_size=self.config.buffer_size,
            learning_starts=self.config.learning_starts,
            batch_size=self.config.batch_size,
            gamma=self.config.gamma,
            train_freq=self.config.train_freq,
            gradient_steps=self.config.gradient_steps,
            target_update_interval=self.config.target_update_interval,
            exploration_fraction=self.config.exploration_fraction,
            exploration_final_eps=self.config.exploration_final_eps,
            double_q=self.config.double_q,
            dueling=self.config.dueling,
            policy_kwargs=policy_kwargs,
            verbose=self.config.verbose,
            tensorboard_log=self.config.tensorboard_log
        )
        return model

    def predict(self, observation: np.ndarray, deterministic: bool = True) -> np.ndarray:
        """Get action from policy."""
        action, _ = self.model.predict(observation, deterministic=deterministic)
        return action

    def save_checkpoint(self, path: str) -> None:
        """Save model."""
        self.model.save(path)

    def load_checkpoint(self, path: str) -> None:
        """Load model."""
        self.model = DQN.load(path, env=self.env)

    def collect_rollout(self, n_steps: int) -> Dict[str, Any]:
        raise NotImplementedError("Use SB3's learn() directly; custom rollouts not implemented")

    def train_step(self, rollout_data: Dict[str, Any]) -> Dict[str, float]:
        raise NotImplementedError("Use SB3's learn() directly; custom train_step not implemented")
