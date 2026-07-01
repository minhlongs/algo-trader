"""
Walk-Forward Analysis (WFA) for robust out-of-sample validation.

Implements expanding window and rolling window cross-validation for time series data.
"""

import numpy as np
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
import logging

from rl.config import RLConfig, WalkForwardConfig
from rl.algorithms.base import TrainingConfig
from rl.training.pipeline import TrainingPipeline
from rl.evaluation.backtest import Backtester
from rl.environment import MarketEnv
from rl.algorithms import get_algorithm
from rl.data.loader import MarketDataLoader
from rl.types import WalkForwardSplit, WalkForwardSummary
import tempfile
import shutil

logger = logging.getLogger(__name__)


@dataclass
class WalkForwardResult:
    """Results from a single walk-forward fold."""
    fold: int
    train_metrics: Dict[str, float]
    val_metrics: Dict[str, float]
    model_path: Optional[str] = None
    sharpe_series: Optional[List[float]] = None


class WalkForwardAnalyzer:
    """
    Orchestrates walk-forward analysis across multiple train/validation splits.

    For each split:
    1. Train on training window
    2. Evaluate on validation window
    3. Save metrics and model (optional)
    4. Aggregate results across all splits

    Supports:
    - Expanding window: train grows over time, validation fixed size
    - Rolling window: train and validation both roll forward fixed size
    """

    def __init__(
        self,
        config: RLConfig,
        wfa_config: WalkForwardConfig,
        data: np.ndarray,
        output_dir: str = "./wfa_results"
    ):
        """
        Initialize WFA analyzer.

        Args:
            config: RL configuration
            wfa_config: Walk-forward specific configuration
            data: Full preprocessed data array
            output_dir: Directory to save results
        """
        self.config = config
        self.wfa_config = wfa_config
        self.data = data
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

        self.splits: List[WalkForwardSplit] = []
        self.results: List[WalkForwardResult] = []

    def generate_splits(self) -> List[WalkForwardSplit]:
        """
        Generate train/validation splits based on configuration.

        Returns:
            List of WalkForwardSplit objects
        """
        n_total = len(self.data)
        splits = []

        # Determine validation size (fixed or percentage)
        val_size = max(int(n_total * 0.15), 100)  # At least 15% or 100 steps

        if self.wfa_config.train_expansion:
            # Expanding window: train starts at initial size, grows each split
            initial_train = int(n_total * self.wfa_config.initial_train_size)

            for fold in range(self.wfa_config.n_splits):
                # Calculate split points
                train_end = initial_train + fold * val_size
                val_start = train_end
                val_end = min(val_start + val_size, n_total)

                if val_end > n_total:
                    break

                split = WalkForwardSplit(
                    train_start=0,
                    train_end=train_end,
                    val_start=val_start,
                    val_end=val_end,
                    fold=fold
                )
                splits.append(split)

        else:
            # Rolling window: both train and validation have fixed size
            train_size = int(n_total * self.wfa_config.initial_train_size)

            for fold in range(self.wfa_config.n_splits):
                train_start = fold * val_size
                train_end = train_start + train_size
                val_start = train_end
                val_end = min(train_end + val_size, n_total)

                if val_end > n_total or train_end >= n_total:
                    break

                split = WalkForwardSplit(
                    train_start=train_start,
                    train_end=train_end,
                    val_start=val_start,
                    val_end=val_end,
                    fold=fold
                )
                splits.append(split)

        logger.info(f"Generated {len(splits)} walk-forward splits")
        for i, split in enumerate(splits):
            train_len = split.train_end - split.train_start
            val_len = split.val_end - split.val_start
            logger.info(f"  Fold {i}: train={train_len} steps, val={val_len} steps")

        self.splits = splits
        return splits

    def run_split(
        self,
        split: WalkForwardSplit,
        algorithm: str = "ppo",
        custom_train_config: Optional[Dict[str, Any]] = None
    ) -> WalkForwardResult:
        """
        Execute training and evaluation for a single split.

        Args:
            split: WalkForwardSplit defining train/val boundaries
            algorithm: Algorithm name (ppo, sac, dqn)
            custom_train_config: Override training config parameters

        Returns:
            WalkForwardResult with metrics
        """
        logger.info(f"Running WFA fold {split.fold}")

        # Extract data for this split
        train_data = self.data[split.train_start:split.train_end]
        val_data = self.data[split.val_start:split.val_end]

        logger.info(f"Train data: {len(train_data)} steps, Val data: {len(val_data)} steps")

        # Create training config with overrides
        train_config = TrainingConfig(
            total_timesteps=custom_train_config.get('total_timesteps', self.config.total_timesteps) if custom_train_config else self.config.total_timesteps,
            learning_rate=self.config.learning_rate,
            batch_size=self.config.batch_size,
            gamma=self.config.gamma,
            eval_freq=10000,
            n_eval_episodes=5,
            checkpoint_dir=str(self.output_dir / f"fold_{split.fold:03d}"),
            tensorboard_log=self.config.tensorboard_log,
            verbose=0,
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

        # Apply hyperparameter overrides
        if custom_train_config:
            for key, value in custom_train_config.items():
                if hasattr(train_config, key):
                    setattr(train_config, key, value)

        # Create environments
        train_env = MarketEnv(config=self.config, data=train_data)
        eval_env = MarketEnv(config=self.config, data=val_data)

        # Get trainer class
        trainer_class = get_algorithm(algorithm)

        # Initialize trainer
        trainer = trainer_class(
            env=train_env,
            config=train_config,
            eval_env=eval_env
        )

        # Train
        logger.info(f"Training fold {split.fold}...")
        try:
            train_results = trainer.train()
        except Exception as e:
            logger.error(f"Training failed for fold {split.fold}: {e}")
            raise

        # Model path
        model_path = None
        if self.wfa_config.save_models:
            model_path = str(self.output_dir / f"fold_{split.fold:03d}" / "best_model.zip")
            if not Path(model_path).exists():
                model_path = str(Path(train_config.checkpoint_dir) / "final_model.zip")

        # Evaluate on validation
        logger.info(f"Evaluating fold {split.fold} on validation...")
        val_metrics = self._evaluate_on_env(trainer, eval_env, n_episodes=5)

        # Compute rolling Sharpe series during validation
        sharpe_series = self._compute_rolling_sharpe(val_data, trainer)

        result = WalkForwardResult(
            fold=split.fold,
            train_metrics=train_results,
            val_metrics=val_metrics,
            model_path=model_path,
            sharpe_series=sharpe_series
        )

        self.results.append(result)
        logger.info(f"Fold {split.fold} complete: val_sharpe={val_metrics.get('sharpe_ratio', 0):.3f}")

        return result

    def _evaluate_on_env(
        self,
        trainer,
        env,
        n_episodes: int = 5
    ) -> Dict[str, float]:
        """
        Evaluate trainer on environment.

        Args:
            trainer: Trained trainer instance
            env: Evaluation environment
            n_episodes: Number of episodes

        Returns:
            Dictionary of metrics
        """
        total_rewards = []
        all_returns = []
        all_equity = []

        for _ in range(n_episodes):
            obs, _ = env.reset()
            done = False
            episode_reward = 0.0
            while not done:
                action = trainer.predict(obs, deterministic=True)
                obs, reward, terminated, truncated, info = env.step(action)
                episode_reward += reward
                done = terminated or truncated
                if hasattr(env, 'episode_history') and env.episode_history:
                    all_returns.extend(env.episode_history.returns)
                    all_equity.extend(env.episode_history.equity_curve)
            total_rewards.append(episode_reward)

        mean_reward = float(np.mean(total_rewards))
        std_reward = float(np.std(total_rewards))

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

    def _compute_rolling_sharpe(
        self,
        data: np.ndarray,
        trainer,
        window: int = 50
    ) -> List[float]:
        """
        Compute rolling Sharpe during validation.

        Returns empty list for now (requires more complex tracking).
        """
        # Placeholder - could run a single episode and compute rolling metric
        return []

    def run_all_splits(
        self,
        algorithm: str = "ppo",
        custom_train_config: Optional[Dict[str, Any]] = None
    ) -> WalkForwardSummary:
        """
        Run WFA across all splits.

        Args:
            algorithm: Algorithm to train
            custom_train_config: Optional training overrides

        Returns:
            WalkForwardSummary with aggregated results
        """
        if not self.splits:
            self.generate_splits()

        logger.info(f"Starting walk-forward analysis: {len(self.splits)} splits")

        for split in self.splits:
            result = self.run_split(split, algorithm, custom_train_config)

        # Compute summary statistics
        summary = self._compute_summary()

        # Save summary
        self._save_summary(summary)

        return summary

    def _compute_summary(self) -> WalkForwardSummary:
        """Aggregate metrics across all folds."""
        if not self.results:
            raise ValueError("No results to summarize")

        sharpes = [r.val_metrics.get('sharpe_ratio', 0) for r in self.results]
        max_dds = [r.val_metrics.get('max_drawdown', 0) for r in self.results]

        mean_sharpe = float(np.mean(sharpes))
        std_sharpe = float(np.std(sharpes))
        mean_max_dd = float(np.mean(max_dds))

        # Stability: coefficient of variation (lower is more stable)
        sharpe_stability = std_sharpe / mean_sharpe if mean_sharpe != 0 else 0.0

        best_idx = int(np.argmax(sharpes))
        worst_idx = int(np.argmin(sharpes))

        summary = WalkForwardSummary(
            n_splits=len(self.results),
            fold_results=self.results,
            mean_sharpe=mean_sharpe,
            std_sharpe=std_sharpe,
            mean_max_drawdown=mean_max_dd,
            sharpe_stability=sharpe_stability,
            best_fold=best_idx,
            worst_fold=worst_idx
        )

        logger.info(f"WFA Summary: mean_sharpe={mean_sharpe:.3f} ± {std_sharpe:.3f}, "
                   f"mean_max_dd={mean_max_dd:.3%}, stability={sharpe_stability:.3f}")

        return summary

    def _save_summary(self, summary: WalkForwardSummary) -> None:
        """Save WFA results to disk."""
        import json
        from dataclasses import asdict

        summary_path = self.output_dir / "wfa_summary.json"
        with open(summary_path, 'w') as f:
            json.dump(asdict(summary), f, indent=2)

        logger.info(f"WFA summary saved to {summary_path}")

        # Also save per-fold metrics as CSV-friendly format
        import csv
        csv_path = self.output_dir / "wfa_folds.csv"
        with open(csv_path, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['fold', 'sharpe', 'max_drawdown', 'total_return', 'win_rate'])
            for r in summary.fold_results:
                writer.writerow([
                    r.fold,
                    r.val_metrics.get('sharpe_ratio', 0),
                    r.val_metrics.get('max_drawdown', 0),
                    r.val_metrics.get('total_return', 0),
                    r.val_metrics.get('win_rate', 0)
                ])

        logger.info(f"WFA fold details saved to {csv_path}")


def run_walk_forward_analysis(
    config: RLConfig,
    wfa_config: WalkForwardConfig,
    data: np.ndarray,
    algorithm: str = "ppo",
    output_dir: str = "./wfa_results"
) -> WalkForwardSummary:
    """
    Convenience function to run complete WFA.

    Args:
        config: Base RL config
        wfa_config: WFA-specific config
        data: Full dataset
        algorithm: Algorithm to train
        output_dir: Output directory

    Returns:
        WalkForwardSummary
    """
    analyzer = WalkForwardAnalyzer(
        config=config,
        wfa_config=wfa_config,
        data=data,
        output_dir=output_dir
    )

    analyzer.generate_splits()
    summary = analyzer.run_all_splits(algorithm=algorithm)

    return summary
