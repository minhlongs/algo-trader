"""
Base trainer class and training configuration for RL algorithms.
"""

from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List
import numpy as np
import gymnasium as gym
from abc import ABC, abstractmethod

@dataclass
class TrainingConfig:
    """Configuration for training an RL agent."""
    total_timesteps: int = 100_000
    learning_rate: float = 3e-4
    batch_size: int = 64
    gamma: float = 0.99
    eval_freq: int = 10000  # Evaluate every N steps
    n_eval_episodes: int = 5
    log_freq: int = 1000  # Log metrics every N steps
    checkpoint_freq: int = 10000  # Save checkpoint every N steps
    checkpoint_dir: str = "./models"
    tensorboard_log: str = "./tensorboard"
    verbose: int = 1  # 0=quiet, 1=info

    # PPO specific
    n_steps: int = 2048
    n_epochs: int = 10
    gae_lambda: float = 0.95
    clip_range: float = 0.2
    ent_coef: float = 0.01
    vf_coef: float = 0.5
    max_grad_norm: float = 0.5
    net_arch: Optional[List[int]] = None  # Hidden layer sizes, e.g., [256, 256]

    # SAC specific
    buffer_size: int = 100_000
    learning_starts: int = 1000
    tau: float = 0.005
    train_freq: int = 1
    target_entropy: str = "auto"
    gradient_steps: int = 1

    # DQN specific
    exploration_fraction: float = 0.1
    exploration_final_eps: float = 0.01
    target_update_interval: int = 10000
    double_q: bool = True
    dueling: bool = False

class BaseTrainer(ABC):
    """
    Abstract base class for RL algorithm trainers.

    Provides a common interface and training loop.
    """

    def __init__(
        self,
        env: gym.Env,
        config: TrainingConfig,
        eval_env: Optional[gym.Env] = None
    ):
        """
        Initialize trainer.

        Args:
            env: Training environment (Gymnasium)
            config: Training hyperparameters
            eval_env: Optional separate environment for evaluation
        """
        self.env = env
        self.config = config
        self.eval_env = eval_env
        self.global_step = 0
        self.best_reward = -np.inf
        self._setup_directories()

    def _setup_directories(self) -> None:
        """Create necessary directories."""
        from pathlib import Path
        Path(self.config.checkpoint_dir).mkdir(parents=True, exist_ok=True)
        Path(self.config.tensorboard_log).mkdir(parents=True, exist_ok=True)

    @abstractmethod
    def _build_model(self):
        """Build the underlying RL model (SB3 or custom). To be implemented by subclass."""
        pass

    @abstractmethod
    def predict(self, observation: np.ndarray, deterministic: bool = True) -> np.ndarray:
        """Get action from policy for a single observation."""
        pass

    @abstractmethod
    def save_checkpoint(self, path: str) -> None:
        """Save model to disk."""
        pass

    @abstractmethod
    def load_checkpoint(self, path: str) -> None:
        """Load model from disk."""
        pass

    def evaluate(self, n_episodes: int = 5) -> float:
        """
        Evaluate policy over multiple episodes.

        Returns:
            Average total reward per episode
        """
        if self.eval_env is None:
            eval_env = self.env
        else:
            eval_env = self.eval_env

        total_rewards = []
        for _ in range(n_episodes):
            obs, _ = eval_env.reset()
            done = False
            episode_reward = 0.0
            while not done:
                action = self.predict(obs, deterministic=True)
                obs, reward, terminated, truncated, _ = eval_env.step(action)
                episode_reward += reward
                done = terminated or truncated
            total_rewards.append(episode_reward)

        return float(np.mean(total_rewards))

    def train(self) -> Dict[str, Any]:
        """
        Main training loop.

        Returns:
            Dictionary with training statistics
        """
        if self.global_step == 0:
            self.model = self._build_model()

        while self.global_step < self.config.total_timesteps:
            # Train for a segment
            learn_timesteps = min(
                self.config.eval_freq,
                self.config.total_timesteps - self.global_step
            )
            self.model.learn(
                total_timesteps=learn_timesteps,
                reset_num_timesteps=False,
                tb_log_name=self.__class__.__name__,
                progress_bar=False
            )
            self.global_step += learn_timesteps

            # Evaluate
            eval_reward = self.evaluate(self.config.n_eval_episodes)
            if self.config.verbose:
                print(f"Step {self.global_step}/{self.config.total_timesteps} - Eval reward: {eval_reward:.4f}")

            # Save best model
            if eval_reward > self.best_reward:
                self.best_reward = eval_reward
                self.save_checkpoint(str(Path(self.config.checkpoint_dir) / "best_model"))
            # Periodic checkpoint
            if self.global_step % self.config.checkpoint_freq == 0:
                self.save_checkpoint(str(Path(self.config.checkpoint_dir) / f"model_step_{self.global_step}"))

        # Final save
        self.save_checkpoint(str(Path(self.config.checkpoint_dir) / "final_model"))

        return {
            "final_step": self.global_step,
            "best_reward": self.best_reward
        }
