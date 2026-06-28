"""Tests for Walk-Forward Analysis."""

import pytest
import numpy as np
from rl.training.walk_forward import WalkForwardAnalyzer
from rl.config import RLConfig, WalkForwardConfig

def test_walk_forward_split_generation_expanding():
    """Test expanding window splits."""
    data = np.random.randn(1000, 5)
    config = RLConfig()
    wfa_config = WalkForwardConfig(
        n_splits=5,
        train_expansion=True,
        initial_train_size=0.3
    )

    analyzer = WalkForwardAnalyzer(config, wfa_config, data)
    splits = analyzer.generate_splits()

    assert len(splits) == 5
    # Each split should have growing train, fixed val
    for i, split in enumerate(splits):
        assert split.train_start == 0
        assert split.val_start == split.train_end
        assert split.val_end > split.val_start
        # Train should grow
        if i > 0:
            assert splits[i].train_end > splits[i-1].train_end

def test_walk_forward_split_generation_rolling():
    """Test rolling window splits."""
    data = np.random.randn(1000, 5)
    config = RLConfig()
    wfa_config = WalkForwardConfig(
        n_splits=5,
        train_expansion=False,
        initial_train_size=0.3
    )

    analyzer = WalkForwardAnalyzer(config, wfa_config, data)
    splits = analyzer.generate_splits()

    assert len(splits) == 5
    # Rolling: both train and val roll forward
    for i in range(len(splits)-1):
        assert splits[i+1].train_start > splits[i].train_start
        assert splits[i+1].val_start > splits[i].val_start

def test_walk_forward_summary_computation():
    """Test summary statistics from results."""
    data = np.random.randn(100, 5)
    config = RLConfig()
    wfa_config = WalkForwardConfig(n_splits=3)
    analyzer = WalkForwardAnalyzer(config, wfa_config, data)

    # Manually add fake results
    analyzer.results = [
        type('Result', (), {
            'fold': 0,
            'val_metrics': {'sharpe_ratio': 1.0, 'max_drawdown': 0.05}
        })(),
        type('Result', (), {
            'fold': 1,
            'val_metrics': {'sharpe_ratio': 1.5, 'max_drawdown': 0.03}
        })(),
        type('Result', (), {
            'fold': 2,
            'val_metrics': {'sharpe_ratio': 0.8, 'max_drawdown': 0.08}
        })()
    ]

    summary = analyzer._compute_summary()

    assert summary.n_splits == 3
    assert summary.mean_sharpe == pytest.approx((1.0 + 1.5 + 0.8) / 3)
    assert summary.best_fold == 1  # highest Sharpe
    assert summary.worst_fold == 2

def test_walk_forward_stability_metric():
    """Test stability (coefficient of variation) computed."""
    data = np.random.randn(100, 5)
    config = RLConfig()
    wfa_config = WalkForwardConfig(n_splits=2)
    analyzer = WalkForwardAnalyzer(config, wfa_config, data)

    analyzer.results = [
        type('Result', (), {'val_metrics': {'sharpe_ratio': 1.0}})(),
        type('Result', (), {'val_metrics': {'sharpe_ratio': 1.0}})()
    ]

    summary = analyzer._compute_summary()
    # All same -> stability 0 (perfect)
    assert summary.sharpe_stability == 0.0

def test_walk_forward_output_directory_creation():
    """Test output directory is created."""
    import tempfile
    import shutil
    from pathlib import Path

    tmpdir = tempfile.mkdtemp()
    try:
        data = np.random.randn(100, 5)
        config = RLConfig()
        wfa_config = WalkForwardConfig(n_splits=2)
        output_dir = Path(tmpdir) / "wfa_test"
        analyzer = WalkForwardAnalyzer(config, wfa_config, data, output_dir=str(output_dir))

        assert output_dir.exists()
    finally:
        shutil.rmtree(tmpdir)
