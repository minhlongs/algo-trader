"""Tests for Ensemble Trainer."""

import pytest
import numpy as np
from rl.training.ensemble import EnsembleTrainer, HyperparameterGrid
from rl.config import RLConfig, EnsembleConfig

def test_hyperparameter_grid_generation():
    """Test grid generates correct number of configs."""
    grid = HyperparameterGrid({
        'learning_rate': [1e-4, 1e-3],
        'net_arch': [[64], [128]]
    })

    configs = grid.generate_configs(n_models=4)

    assert len(configs) == 4
    # Each config should have learning_rate and net_arch
    for cfg in configs:
        assert 'learning_rate' in cfg
        assert 'net_arch' in cfg

def test_hyperparameter_grid_sampling():
    """Test grid samples without replacement if n_models < total combinations."""
    grid = HyperparameterGrid({
        'a': [1, 2, 3, 4],
        'b': ['x', 'y']
    })  # 8 combinations

    configs = grid.generate_configs(n_models=3)

    assert len(configs) == 3
    # Should be unique
    unique = [tuple(sorted(cfg.items())) for cfg in configs]
    assert len(unique) == len(set(unique))

def test_ensemble_trainer_initialization(sample_config, data_loader):
    """Test ensemble trainer initializes correctly."""
    config = RLConfig(total_timesteps=100)  # small for test
    ensemble_config = EnsembleConfig(n_models=3, ensemble_method='weighted')
    loader, data = data_loader

    trainer = EnsembleTrainer(
        config=config,
        ensemble_config=ensemble_config,
        data=data,
        output_dir="./test_ensemble"
    )

    assert trainer.config == config
    assert trainer.ensemble_config == ensemble_config
    assert len(trainer.members) == 0

def test_weight_computation():
    """Test weight calculation based on metrics."""
    config = RLConfig()
    ensemble_config = EnsembleConfig(
        n_models=2,
        weight_metric='sharpe_ratio'
    )
    trainer = EnsembleTrainer(config, ensemble_config, None)

    metrics = {'sharpe_ratio': 2.0, 'max_drawdown': 0.1}
    weight = trainer._compute_weight(metrics)

    assert weight > 0

def test_weight_normalization():
    """Test weights are normalized to sum to 1."""
    config = RLConfig()
    ensemble_config = EnsembleConfig(n_models=3)
    trainer = EnsembleTrainer(config, ensemble_config, None)

    trainer.members = [
        type('Member', (), {'weight': 2.0})(),
        type('Member', (), {'weight': 3.0})(),
        type('Member', (), {'weight': 5.0})()
    ]

    trainer._normalize_weights()

    total = sum(m.weight for m in trainer.members)
    assert abs(total - 1.0) < 1e-6

def test_ensemble_voting():
    """Test voting ensemble method."""
    config = RLConfig()
    ensemble_config = EnsembleConfig(ensemble_method='voting')
    trainer = EnsembleTrainer(config, ensemble_config, None)

    # Mock predictions
    preds = [np.array([1.0, 2.0]), np.array([1.5, 2.5]), np.array([0.8, 1.8])]
    combined = trainer._vote_actions(preds)

    # Should be mean
    expected = np.mean(preds, axis=0)
    np.testing.assert_array_almost_equal(combined, expected)

def test_ensemble_weighted_average():
    """Test weighted average ensemble method."""
    config = RLConfig()
    ensemble_config = EnsembleConfig(ensemble_method='weighted')
    trainer = EnsembleTrainer(config, ensemble_config, None)

    preds = [np.array([1.0]), np.array([2.0]), np.array([3.0])]
    weights = [0.2, 0.3, 0.5]

    combined = trainer._weighted_average_actions(preds, weights)

    expected = 1.0*0.2 + 2.0*0.3 + 3.0*0.5
    assert combined[0] == pytest.approx(expected)

def test_confidence_computation():
    """Test confidence is inverse of prediction disagreement."""
    config = RLConfig()
    ensemble_config = EnsembleConfig()
    trainer = EnsembleTrainer(config, ensemble_config, None)

    # Same predictions -> high confidence
    same_preds = [np.array([1.0, 1.0]), np.array([1.0, 1.0])]
    conf1 = trainer._compute_confidence(same_preds)
    assert conf1 > 0.9  # high

    # Different predictions -> low confidence
    diff_preds = [np.array([1.0, 1.0]), np.array([10.0, 10.0])]
    conf2 = trainer._compute_confidence(diff_preds)
    assert conf2 < conf1
