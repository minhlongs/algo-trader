"""
Proximal Policy Optimization (PPO) trainer.

Wraps Stable Baselines3 PPO with a unified interface.
"""

from typing import Any, Dict
import numpy as np
import gymnasium as gym
from stable_baselines3 import PPO
from .base import BaseTrainer, TrainingConfig

class PPOTrainer(BaseTrainer):
    """PPO algorithm trainer."""

    def __init__(
        self,
        env: gym.Env,
        config: TrainingConfig,
        eval_env: gym.Env = None
    ):
        super().__init__(env, config, eval_env)
        # Override with PPO-specific defaults if not set
        if config.net_arch is None:
            config.net_arch = [256, 256]
        self.model = self._build_model()

    def _build_model(self) -> PPO:
        """Construct PPO model with configuration."""
        policy_kwargs = dict(
            net_arch=self.config.net_arch
        )
        model = PPO(
            policy="MlpPolicy",
            env=self.env,
            learning_rate=self.config.learning_rate,
            n_steps=self.config.n_steps,
            batch_size=self.config.batch_size,
            n_epochs=self.config.n_epochs,
            gamma=self.config.gamma,
            gae_lambda=self.config.gae_lambda,
            clip_range=self.config.clip_range,
            ent_coef=self.config.ent_coef,
            vf_coef=self.config.vf_coef,
            max_grad_norm=self.config.max_grad_norm,
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
        self.model = PPO.load(path, env=self.env)

    def collect_rollout(self, n_steps: int) -> Dict[str, Any]:
        """Collect rollout data (if needed for custom training)."""
        # SB3 handles rollout collection internally during learn()
        raise NotImplementedError("Use SB3's learn() directly; custom rollouts not implemented")

    def train_step(self, rollout_data: Dict[str, Any]) -> Dict[str, float]:
        """Perform one training step (if using custom training loop)."""
        raise NotImplementedError("Use SB3's learn() directly; custom train_step not implemented")
