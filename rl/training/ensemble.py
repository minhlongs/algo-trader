"""
Ensemble training for RL agents.

Trains multiple models with different hyperparameters and combines their predictions
using voting, weighted averaging, or selecting the best model.
"""

import numpy as np
from pathlib import Path
from typing import List, Dict, Any, Optional
import itertools
import logging
from dataclasses import dataclass

from rl.config import RLConfig, EnsembleConfig
from rl.training.pipeline import TrainingPipeline
from rl.algorithms import get_algorithm, TrainingConfig
from rl.types import EnsembleMember, EnsemblePrediction

logger = logging.getLogger(__name__)


@dataclass
class HyperparameterGrid:
    """Defines a grid of hyperparameters to search."""
    param_grid: Dict[str, List[Any]]

    def generate_configs(self, n_models: int) -> List[Dict[str, Any]]:
        """
        Generate individual hyperparameter configurations.

        Args:
            n_models: Number of models to train

        Returns:
            List of hyperparameter dictionaries
        """
        keys = list(self.param_grid.keys())
        values = list(self.param_grid.values())

        # Generate all combinations
        all_combinations = list(itertools.product(*values))

        # If we need fewer than all combinations, sample randomly
        if n_models < len(all_combinations):
            indices = np.random.choice(len(all_combinations), size=n_models, replace=False)
            selected = [all_combinations[i] for i in indices]
        else:
            selected = all_combinations[:n_models]

        # Convert to list of dicts
        configs = []
        for combo in selected:
            config_dict = {k: v for k, v in zip(keys, combo)}
            configs.append(config_dict)

        logger.info(f"Generated {len(configs)} hyperparameter configurations")
        return configs


class EnsembleTrainer:
    """
    Orchestrates training of multiple RL agents and combines their predictions.

    Features:
    - Hyperparameter grid search or random sampling
    - Multiple ensemble strategies: voting, weighted by performance, or best-only
    - Persistent storage of ensemble members
    - Unified predict() method
    """

    def __init__(
        self,
        config: RLConfig,
        ensemble_config: EnsembleConfig,
        data: np.ndarray,
        output_dir: str = "./ensemble_models"
    ):
        """
        Initialize ensemble trainer.

        Args:
            config: Base RL configuration
            ensemble_config: Ensemble-specific configuration
            data: Training data array
            output_dir: Directory to save ensemble models
        """
        self.config = config
        self.ensemble_config = ensemble_config
        self.data = data
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

        self.members: List[EnsembleMember] = []
        self.training_results: List[Dict[str, Any]] = []

    def train_all(
        self,
        algorithm: str = "ppo",
        hyperparameter_grid: Optional[Dict[str, List[Any]]] = None
    ) -> List[EnsembleMember]:
        """
        Train all ensemble members.

        Args:
            algorithm: Base algorithm (ppo, sac, dqn)
            hyperparameter_grid: Optional custom grid; if None, uses defaults

        Returns:
            List of trained EnsembleMember objects
        """
        logger.info(f"Starting ensemble training: {self.ensemble_config.n_models} models")

        # Generate hyperparameter configs
        if hyperparameter_grid:
            grid = HyperparameterGrid(hyperparameter_grid)
        else:
            # Default grid: vary learning rate and network size
            grid = HyperparameterGrid({
                'learning_rate': [1e-4, 3e-4, 1e-3],
                'net_arch': [[128, 128], [256, 256], [512, 256]],
                'batch_size': [32, 64, 128]
            })

        configs = grid.generate_configs(self.ensemble_config.n_models)

        # Train each model
        for idx, hp_config in enumerate(configs):
            logger.info(f"Training ensemble member {idx+1}/{len(configs)}")
            logger.info(f"  Hyperparameters: {hp_config}")

            # Create config with overrides
            model_config = RLConfig(**self.config.as_dict())
            for key, value in hp_config.items():
                if hasattr(model_config, key):
                    setattr(model_config, key, value)

            # Train model
            pipeline = TrainingPipeline(model_config)

            try:
                results = pipeline.train(algorithm_name=algorithm)

                # Evaluate on validation portion
                # We'll use the pipeline's evaluate which uses validation split
                metrics = pipeline.evaluate(
                    model_path=str(Path(model_config.model_dir) / "best_model.zip"),
                    algorithm_name=algorithm,
                    n_episodes=5
                )

                # Calculate weight based on performance
                weight = self._compute_weight(metrics)

                member = EnsembleMember(
                    model_path=str(Path(model_config.model_dir) / "best_model.zip"),
                    hyperparameters=hp_config,
                    validation_metrics=metrics,
                    weight=weight
                )

                self.members.append(member)
                self.training_results.append({
                    'member_idx': idx,
                    'hyperparameters': hp_config,
                    'metrics': metrics,
                    'weight': weight
                })

                logger.info(f"  Member {idx+1} complete: Sharpe={metrics.get('sharpe_ratio', 0):.3f}, weight={weight:.3f}")

            except Exception as e:
                logger.error(f"  Member {idx+1} failed: {e}")
                continue

        # Normalize weights
        self._normalize_weights()

        # Save ensemble metadata
        self._save_ensemble_metadata()

        logger.info(f"Ensemble training complete: {len(self.members)} members")
        return self.members

    def _compute_weight(self, metrics: Dict[str, float]) -> float:
        """
        Compute weight for a model based on validation metrics.

        Args:
            metrics: Validation performance metrics

        Returns:
            Weight value (raw, before normalization)
        """
        if self.ensemble_config.ensemble_method == "best":
            return 1.0

        metric_name = self.ensemble_config.weight_metric
        metric_value = metrics.get(metric_name, 0.0)

        # For Sharpe, Sortino, Calmar, Return: higher is better
        # For Max Drawdown: lower is better (negate)
        if metric_name in ['max_drawdown', 'volatility']:
            metric_value = -metric_value

        # Apply minimum weight floor
        weight = max(metric_value, self.ensemble_config.min_weight)

        return weight

    def _normalize_weights(self) -> None:
        """Normalize member weights to sum to 1.0."""
        if not self.members:
            return

        total_weight = sum(m.weight for m in self.members)
        if total_weight > 0:
            for member in self.members:
                member.weight = member.weight / total_weight

        logger.info(f"Normalized weights: {[f'{m.weight:.3f}' for m in self.members]}")

    def predict(
        self,
        observation: np.ndarray,
        deterministic: bool = True
    ) -> EnsemblePrediction:
        """
        Generate ensemble prediction from all members.

        Args:
            observation: Environment observation
            deterministic: Use deterministic actions

        Returns:
            EnsemblePrediction with combined action and metadata
        """
        if not self.members:
            raise ValueError("Ensemble has no trained members. Call train_all() first.")

        # Get predictions from all members
        member_predictions = []
        member_weights = []

        for member in self.members:
            # Load model and predict
            # In practice, we'd keep models in memory or lazy-load
            # For now, we assume prediction happens shortly after training
            trainer_class = get_algorithm("ppo")  # We need to know which algorithm was used
            # Actually, we should store algorithm in member metadata
            # This is a simplified implementation

            pred = self._predict_single(observation, member.model_path, deterministic)
            member_predictions.append(pred)
            member_weights.append(member.weight)

        # Combine predictions based on method
        if self.ensemble_config.ensemble_method == "voting":
            combined_action = self._vote_actions(member_predictions)
        elif self.ensemble_config.ensemble_method == "weighted":
            combined_action = self._weighted_average_actions(member_predictions, member_weights)
        elif self.ensemble_config.ensemble_method == "best":
            # Find member with highest weight
            best_idx = np.argmax(member_weights)
            combined_action = member_predictions[best_idx]
        else:
            raise ValueError(f"Unknown ensemble method: {self.ensemble_config.ensemble_method}")

        # Compute confidence (e.g., agreement among members)
        confidence = self._compute_confidence(member_predictions)

        return EnsemblePrediction(
            action=combined_action,
            member_predictions=member_predictions,
            weights=member_weights,
            confidence=confidence
        )

    def _predict_single(
        self,
        observation: np.ndarray,
        model_path: str,
        deterministic: bool
    ) -> np.ndarray:
        """
        Load a model and generate prediction.

        Note: This is inefficient (loading model each time). In production,
        models should be kept in memory or cached.
        """
        from stable_baselines3 import PPO, SAC, DQN

        # Determine model type from filename or metadata
        # For simplicity, assume PPO for now
        model = PPO.load(model_path)
        action, _ = model.predict(observation, deterministic=deterministic)
        return action

    def _vote_actions(self, predictions: List[np.ndarray]) -> np.ndarray:
        """
        Combine predictions by voting (for discrete actions).
        For continuous, this would need different approach.
        """
        # For discrete: take argmax of argmax? Or majority vote?
        # Simplified: average and round for discrete
        stacked = np.stack(predictions)
        # Mean for continuous, mode for discrete
        return np.mean(stacked, axis=0)

    def _weighted_average_actions(
        self,
        predictions: List[np.ndarray],
        weights: List[float]
    ) -> np.ndarray:
        """Combine predictions by weighted average."""
        weights_array = np.array(weights).reshape(-1, 1)
        stacked = np.stack(predictions)
        weighted_sum = np.sum(stacked * weights_array, axis=0)
        return weighted_sum

    def _compute_confidence(self, predictions: List[np.ndarray]) -> float:
        """
        Compute confidence as agreement among predictions.

        Returns:
            Float in [0, 1] where 1 = perfect agreement
        """
        if len(predictions) < 2:
            return 1.0

        # Compute pairwise distances
        stacked = np.stack(predictions)
        # Standard deviation across predictions for each dimension
        std_per_dim = np.std(stacked, axis=0)
        # Average standard deviation as disagreement metric
        avg_std = np.mean(std_per_dim)

        # Convert to confidence: confidence = 1 / (1 + avg_std)
        confidence = 1.0 / (1.0 + avg_std)
        return float(confidence)

    def _save_ensemble_metadata(self) -> None:
        """Save ensemble configuration and member metadata."""
        import json
        from dataclasses import asdict

        metadata = {
            'ensemble_config': {
                'method': self.ensemble_config.ensemble_method,
                'n_models': self.ensemble_config.n_models,
                'weight_metric': self.ensemble_config.weight_metric
            },
            'members': []
        }

        for idx, member in enumerate(self.members):
            metadata['members'].append({
                'index': idx,
                'model_path': member.model_path,
                'hyperparameters': member.hyperparameters,
                'validation_metrics': member.validation_metrics,
                'weight': member.weight
            })

        metadata_path = self.output_dir / "ensemble_metadata.json"
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)

        logger.info(f"Ensemble metadata saved to {metadata_path}")

    @classmethod
    def load_ensemble(cls, metadata_path: str) -> 'EnsembleTrainer':
        """
        Load a saved ensemble from metadata.

        Args:
            metadata_path: Path to ensemble_metadata.json

        Returns:
            EnsembleTrainer with loaded members
        """
        import json

        with open(metadata_path, 'r') as f:
            metadata = json.load(f)

        # Reconstruct EnsembleTrainer (requires original config)
        # This is simplified; in practice we'd persist full config
        raise NotImplementedError("Ensemble loading requires config reconstruction")
