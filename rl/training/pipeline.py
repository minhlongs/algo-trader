"""
Training pipeline: end-to-end orchestration for RL training.
"""

from typing import Dict, Any, Optional
import numpy as np
from pathlib import Path
from rl.config import RLConfig
from rl.data.loader import MarketDataLoader
from rl.environment import MarketEnv
from rl.algorithms import get_algorithm, TrainingConfig
from rl.utils.logging import setup_logging

class TrainingPipeline:
    """
    End-to-end training pipeline that handles data loading, environment creation,
    algorithm training, evaluation, and model persistence.
    """

    def __init__(self, config: RLConfig):
        self.config = config
        config.ensure_directories()
        self.logger = setup_logging(
            log_file=Path(config.log_dir) / "train.log",
            level=20  # INFO
        )

    def prepare_data(self) -> tuple[MarketDataLoader, np.ndarray]:
        """
        Load and preprocess market data.

        Returns:
            data_loader: Loader object with scaler
            data_array: Preprocessed numpy array
        """
        if self.config.data_path is None:
            raise ValueError("data_path must be set in config")

        self.logger.info(f"Loading data from {self.config.data_path}")
        data_loader = MarketDataLoader(
            data_path=self.config.data_path,
            feature_columns=self.config.feature_columns,
            technical_indicators=self.config.technical_indicators,
            normalization=self.config.normalization
        )
        data = data_loader.load_data()
        self.logger.info(f"Loaded {len(data)} timesteps with {data.shape[1]} features")
        return data_loader, data

    def create_environment(self, data: np.ndarray) -> MarketEnv:
        """
        Create training environment with data.

        Args:
            data: Preprocessed data array

        Returns:
            MarketEnv instance
        """
        env = MarketEnv(config=self.config, data=data)
        self.logger.info(f"Created environment with observation space shape {env.observation_space.shape}")
        return env

    def train(
        self,
        algorithm_name: str = "ppo",
        eval_freq: Optional[int] = None,
        **algorithm_kwargs
    ) -> Dict[str, Any]:
        """
        Run full training pipeline.

        Args:
            algorithm_name: One of "ppo", "sac", "dqn"
            eval_freq: Override config.eval_freq if provided
            **algorithm_kwargs: Additional arguments passed to trainer (e.g., custom net_arch)

        Returns:
            Dictionary with training results
        """
        # Prepare data
        data_loader, data = self.prepare_data()

        # Split data
        train_ratio = self.config.train_split
        val_ratio = self.config.validation_split
        n = len(data)
        train_end = int(n * train_ratio)
        val_end = int(n * (train_ratio + val_ratio))
        train_data = data[:train_end]
        val_data = data[train_end:val_end]

        self.logger.info(f"Data split: train={len(train_data)}, val={len(val_data)}")

        # Create environments
        train_env = self.create_environment(train_data)
        eval_env = self.create_environment(val_data)

        # Build training config for algorithm
        train_config = TrainingConfig(
            total_timesteps=self.config.total_timesteps,
            learning_rate=self.config.learning_rate,
            batch_size=self.config.batch_size,
            gamma=self.config.gamma,
            eval_freq=eval_freq or self.config.eval_freq,
            n_eval_episodes=5,
            checkpoint_dir=self.config.model_dir,
            tensorboard_log=self.config.tensorboard_log,
            verbose=1,
            # PPO
            n_steps=self.config.n_steps,
            n_epochs=self.config.n_epochs,
            gae_lambda=self.config.gae_lambda,
            clip_range=self.config.clip_range,
            ent_coef=self.config.ent_coef,
            vf_coef=self.config.vf_coef,
            max_grad_norm=self.config.max_grad_norm,
            # SAC
            buffer_size=self.config.buffer_size,
            learning_starts=self.config.learning_starts,
            tau=self.config.tau,
            train_freq=self.config.train_freq,
            target_entropy=self.config.target_entropy,
            # DQN
            exploration_fraction=self.config.exploration_fraction,
            exploration_final_eps=self.config.exploration_final_eps,
            target_update_interval=self.config.target_update_interval,
            double_q=self.config.double_q,
            dueling=self.config.dueling,
        )

        # Override net_arch if provided
        if "net_arch" in algorithm_kwargs:
            train_config.net_arch = algorithm_kwargs["net_arch"]

        # Get trainer class
        trainer_class = get_algorithm(algorithm_name)

        # Initialize trainer
        self.logger.info(f"Initializing {algorithm_name.upper()} trainer")
        trainer = trainer_class(
            env=train_env,
            config=train_config,
            eval_env=eval_env
        )

        # Train
        self.logger.info(f"Starting training for {self.config.total_timesteps} timesteps")
        results = trainer.train()

        self.logger.info(f"Training complete. Best reward: {results['best_reward']:.4f}")
        return results

    def evaluate(
        self,
        model_path: str,
        algorithm_name: str = "ppo",
        n_episodes: int = 10,
        data: Optional[np.ndarray] = None
    ) -> Dict[str, float]:
        """
        Evaluate a saved model.

        Args:
            model_path: Path to saved model
            algorithm_name: Algorithm used to train the model
            n_episodes: Number of episodes to evaluate
            data: Optional data array; if None, uses validation split

        Returns:
            Dictionary with metrics (mean_reward, sharpe, etc.)
        """
        if data is None:
            # Load full data and use test split (last part)
            _, data = self.prepare_data()
            # Use last 15% as test
            test_start = int(len(data) * 0.85)
            data = data[test_start:]

        env = self.create_environment(data)

        trainer_class = get_algorithm(algorithm_name)
        # Build trainer with dummy env to load model
        temp_trainer = trainer_class(env=env, config=TrainingConfig())
        temp_trainer.load_checkpoint(model_path)

        # Run episodes
        total_rewards = []
        all_returns = []
        all_equity = []

        for _ in range(n_episodes):
            obs, _ = env.reset()
            done = False
            episode_reward = 0.0
            while not done:
                action = temp_trainer.predict(obs, deterministic=True)
                obs, reward, terminated, truncated, info = env.step(action)
                episode_reward += reward
                done = terminated or truncated
                if hasattr(env, 'episode_history') and env.episode_history:
                    all_returns.extend(env.episode_history.returns)
                    all_equity.extend(env.episode_history.equity_curve)
            total_rewards.append(episode_reward)

        mean_reward = float(np.mean(total_rewards))
        std_reward = float(np.std(total_rewards))

        # Compute additional metrics if we have equity curve
        metrics = {
            "mean_reward": mean_reward,
            "std_reward": std_reward,
            "min_reward": float(np.min(total_rewards)),
            "max_reward": float(np.max(total_rewards)),
        }
        if all_equity:
            from rl.utils.metrics import calculate_performance_metrics
            perf = calculate_performance_metrics(all_returns, all_equity)
            metrics.update(perf)

        return metrics

    def predict(
        self,
        model_path: str,
        algorithm_name: str = "ppo",
        n_steps: int = 100,
        data: Optional[np.ndarray] = None
    ) -> list:
        """
        Run inference and return actions.

        Args:
            model_path: Path to saved model
            algorithm_name: Algorithm name
            n_steps: Number of steps to run
            data: Optional data

        Returns:
            List of (action, observation, reward) tuples
        """
        if data is None:
            _, data = self.prepare_data()
            data = data[-n_steps-1:]  # take last n_steps+1 to have next

        env = MarketEnv(config=self.config, data=data)
        trainer_class = get_algorithm(algorithm_name)
        trainer = trainer_class(env=env, config=TrainingConfig())
        trainer.load_checkpoint(model_path)

        obs, _ = env.reset()
        trajectory = []
        for _ in range(n_steps):
            action = trainer.predict(obs, deterministic=True)
            next_obs, reward, terminated, truncated, info = env.step(action)
            trajectory.append({
                "action": action.tolist() if isinstance(action, np.ndarray) else int(action),
                "observation": obs.tolist(),
                "reward": float(reward),
                "info": info
            })
            obs = next_obs
            if terminated or truncated:
                break

        return trajectory
