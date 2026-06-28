"""
Command-line interface for RL trading framework.

Usage:
  python -m rl.cli.main train --config path/to/config.yaml --algorithm ppo
  python -m rl.cli.main evaluate --model path/to/model.zip --algorithm ppo
  python -m rl.cli.main predict --model path/to/model.zip --steps 100
  python -m rl.cli.main walk-forward --config path/to/config.yaml --algorithm ppo
  python -m rl.cli.main ensemble-train --config path/to/config.yaml
  python -m rl.cli.main paper-trade --model path/to/model.zip --data path/to/data.csv
"""

import argparse
import sys
from pathlib import Path
import numpy as np
from rl.config import RLConfig, WalkForwardConfig, EnsembleConfig, PaperTradingConfig, CapitalAllocationConfig
from rl.training import TrainingPipeline
from rl.training.walk_forward import run_walk_forward_analysis
from rl.training.ensemble import EnsembleTrainer, HyperparameterGrid
from rl.training.paper_trader import PaperTradingOrchestrator
from rl.training.capital_allocator import CapitalAllocator
from rl.evaluation.benchmark import BenchmarkEngine, BenchmarkStrategy
from rl.evaluation.monitor import PerformanceMonitor
from rl.data.loader import MarketDataLoader

def train_command(args):
    """Handle train command."""
    # Load config
    if args.config:
        config = RLConfig.from_yaml(Path(args.config))
    else:
        config = RLConfig()
        if args.data_path:
            config.data_path = args.data_path
        if args.timesteps:
            config.total_timesteps = args.timesteps
        if args.algorithm:
            config.action_type = args.action_type if hasattr(args, 'action_type') else config.action_type
            config.reward_type = args.reward_type if hasattr(args, 'reward_type') else config.reward_type

    pipeline = TrainingPipeline(config)

    print(f"Starting training with algorithm: {args.algorithm}")
    results = pipeline.train(algorithm_name=args.algorithm)
    print(f"Training complete. Results: {results}")
    return 0

def evaluate_command(args):
    """Handle evaluate command."""
    # Build minimal config
    config = RLConfig()
    if args.data_path:
        config.data_path = args.data_path

    pipeline = TrainingPipeline(config)

    print(f"Evaluating model: {args.model}")
    metrics = pipeline.evaluate(
        model_path=args.model,
        algorithm_name=args.algorithm,
        n_episodes=args.episodes
    )
    print("Evaluation metrics:")
    for k, v in metrics.items():
        print(f"  {k}: {v}")
    return 0

def predict_command(args):
    """Handle predict command."""
    config = RLConfig()
    if args.data_path:
        config.data_path = args.data_path

    pipeline = TrainingPipeline(config)

    print(f"Running inference with model: {args.model}")
    trajectory = pipeline.predict(
        model_path=args.model,
        algorithm_name=args.algorithm,
        n_steps=args.steps
    )
    print(f"Generated {len(trajectory)} steps")
    # Print first few actions
    for i, step in enumerate(trajectory[:5]):
        print(f"Step {i}: action={step['action']}, reward={step['reward']:.4f}")
    return 0

def walk_forward_command(args):
    """Handle walk-forward analysis command."""
    from rl.config import WalkForwardConfig
    from rl.training.walk_forward import run_walk_forward_analysis

    # Load config
    if args.config:
        config = RLConfig.from_yaml(Path(args.config))
    else:
        config = RLConfig()
        if args.data_path:
            config.data_path = args.data_path
        if args.timesteps:
            config.total_timesteps = args.timesteps

    # Create WFA config
    wfa_config = WalkForwardConfig(
        n_splits=args.splits,
        train_expansion=not args.rolling,
        initial_train_size=args.initial_train,
        save_models=args.save_models
    )

    # Load data
    loader = MarketDataLoader(
        data_path=config.data_path,
        feature_columns=config.feature_columns,
        technical_indicators=config.technical_indicators,
        normalization=config.normalization
    )
    data = loader.load_data()

    print(f"Starting walk-forward analysis: {wfa_config.n_splits} splits, "
          f"expansion={wfa_config.train_expansion}")

    summary = run_walk_forward_analysis(
        config=config,
        wfa_config=wfa_config,
        data=data,
        algorithm=args.algorithm,
        output_dir=args.output_dir
    )

    print(f"\nWalk-Forward Analysis Complete!")
    print(f"  Mean Sharpe: {summary.mean_sharpe:.3f} ± {summary.std_sharpe:.3f}")
    print(f"  Mean Max DD: {summary.mean_max_drawdown:.2%}")
    print(f"  Stability (CV): {summary.sharpe_stability:.3f}")
    print(f"  Best fold: {summary.best_fold}, Worst fold: {summary.worst_fold}")
    print(f"  Results saved to: {args.output_dir}")

    return 0

def ensemble_train_command(args):
    """Handle ensemble training command."""
    from rl.config import EnsembleConfig
    from rl.training.ensemble import EnsembleTrainer, HyperparameterGrid
    import json

    # Load config
    if args.config:
        config = RLConfig.from_yaml(Path(args.config))
    else:
        config = RLConfig()
        if args.data_path:
            config.data_path = args.data_path
        if args.timesteps:
            config.total_timesteps = args.timesteps

    # Create ensemble config
    ensemble_config = EnsembleConfig(
        n_models=args.n_models,
        ensemble_method=args.method,
        weight_metric=args.weight_metric,
        save_ensemble=True
    )

    # Load data
    loader = MarketDataLoader(
        data_path=config.data_path,
        feature_columns=config.feature_columns,
        technical_indicators=config.technical_indicators,
        normalization=config.normalization
    )
    data = loader.load_data()

    print(f"Starting ensemble training: {ensemble_config.n_models} models")

    trainer = EnsembleTrainer(
        config=config,
        ensemble_config=ensemble_config,
        data=data,
        output_dir=args.output_dir
    )

    # Optional custom hyperparameter grid
    hyperparam_grid = None
    if args.hyperparams:
        hyperparam_grid = json.loads(args.hyperparams)

    members = trainer.train_all(algorithm=args.algorithm, hyperparameter_grid=hyperparam_grid)

    print(f"\nEnsemble training complete!")
    print(f"  Trained {len(members)} models")
    print(f"  Weights: {[f'{m.weight:.3f}' for m in members]}")
    print(f"  Ensemble metadata saved to: {args.output_dir}")

    return 0

def paper_trade_command(args):
    """Handle paper trading command."""
    from rl.training.paper_trader import PaperTradingOrchestrator
    from rl.config import PaperTradingConfig

    # Load RL config
    config = RLConfig()
    if args.data_path:
        config.data_path = args.data_path

    # Paper trading config
    pt_config = PaperTradingConfig(
        initial_capital=args.capital,
        session_duration=args.duration,
        save_interval=args.save_interval,
        persist_state=True,
        state_file=args.state_file
    )

    print(f"Starting paper trading session")
    print(f"  Model: {args.model}")
    print(f"  Initial capital: {pt_config.initial_capital:.2f}")

    orchestrator = PaperTradingOrchestrator(
        config=pt_config,
        rl_config=config,
        model_path=args.model,
        algorithm=args.algorithm
    )

    # Load price data
    loader = MarketDataLoader(
        data_path=config.data_path,
        feature_columns=config.feature_columns,
        technical_indicators=config.technical_indicators,
        normalization=config.normalization
    )
    data = loader.load_data()

    # Extract prices
    prices = data[:, 3]  # close price column

    summary = orchestrator.run(price_data=prices)

    print(f"\nPaper trading complete!")
    print(f"  Final equity: {summary['total_equity']:.2f}")
    print(f"  Total return: {summary['total_return']:.2%}")
    print(f"  Sharpe: {summary['sharpe_ratio']:.3f}")
    print(f"  Max DD: {summary['max_drawdown']:.2%}")
    print(f"  Num trades: {summary['num_trades']}")

    return 0

def capital_allocate_command(args):
    """Handle capital allocation command."""
    from rl.training.capital_allocator import CapitalAllocator
    from rl.config import CapitalAllocationConfig

    # Config
    cap_config = CapitalAllocationConfig(
        total_capital=args.total_capital,
        allocation_stages=[float(s) for s in args.stages.split(',')],
        performance_window=args.window,
        sharpe_threshold_up=args.sharpe_up,
        sharpe_threshold_down=args.sharpe_down,
        max_drawdown_limit=args.max_dd,
        cooldown_period=args.cooldown
    )

    # Create allocator
    allocator = CapitalAllocator(config=cap_config)

    print(f"Capital Allocator initialized")
    print(f"  Total capital: {cap_config.total_capital:.2f}")
    print(f"  Stages: {cap_config.allocation_stages}")
    print(f"  Current allocation: {allocator.current_allocation_pct:.1%}")

    # If performance file provided, simulate decisions
    if args.performance_file:
        import json
        with open(args.performance_file, 'r') as f:
            perf_data = json.load(f)

        print(f"\nSimulating allocation decisions from {len(perf_data)} steps:")
        for step_data in perf_data[:10]:  # Show first 10
            allocator.update_performance(
                sharpe_ratio=step_data.get('sharpe', 0),
                max_drawdown=step_data.get('max_dd', 0),
                recent_returns=step_data.get('recent_returns', [])
            )
            decision = allocator.evaluate({
                'sharpe_ratio': step_data.get('sharpe', 0),
                'max_drawdown': step_data.get('max_dd', 0)
            })
            if decision.adjusted:
                print(f"  Step {allocator.current_step}: {decision.reason} -> {decision.target_allocation_pct:.1%}")

    # Save history if requested
    if args.output:
        allocator.save_history(args.output)
        print(f"\nAllocation history saved to {args.output}")

    return 0

def monitor_command(args):
    """Handle performance monitoring command."""
    from rl.evaluation.monitor import PerformanceMonitor

    # Load agent returns from file or generate synthetic
    if args.returns_file:
        import json
        with open(args.returns_file, 'r') as f:
            returns = json.load(f)
    else:
        # Generate dummy returns for demo
        returns = list(np.random.randn(1000) * 0.001)

    # Create monitor
    monitor = PerformanceMonitor(
        agent_returns=returns,
        window_size=args.window
    )

    # Load benchmark if provided
    if args.benchmark_file:
        import json
        with open(args.benchmark_file, 'r') as f:
            bench_data = json.load(f)
        for name, bench_returns in bench_data.items():
            monitor.benchmark_returns[name] = bench_returns

    print(f"Performance Monitor initialized")
    print(f"  Agent returns: {len(returns)} steps")
    print(f"  Window: {args.window}")

    # Generate report
    report = monitor.generate_report(output_path=args.output)
    print(f"\nCurrent metrics:")
    for key, value in report.get('rolling_metrics', {}).items():
        print(f"  {key}: {value}")

    if 'latest_comparison' in report:
        print(f"\nBenchmark comparison:")
        comp = report['latest_comparison']
        for key, value in comp.items():
            print(f"  {key}: {value}")

    print(f"\nReport saved to: {args.output}")

    return 0

def main(argv=None):
    """Main CLI entrypoint."""
    parser = argparse.ArgumentParser(
        description="RL Trading Framework CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Train command
    train_parser = subparsers.add_parser("train", help="Train an RL agent")
    train_parser.add_argument("--config", type=str, help="Path to YAML config file")
    train_parser.add_argument("--data-path", type=str, help="Path to market data CSV")
    train_parser.add_argument("--algorithm", type=str, default="ppo",
                              choices=["ppo", "sac", "dqn"], help="RL algorithm")
    train_parser.add_argument("--timesteps", type=int, help="Total training timesteps")
    train_parser.add_argument("--action-type", type=str, default="continuous",
                              choices=["continuous", "discrete"], help="Action space type")
    train_parser.add_argument("--reward-type", type=str, default="sharpe",
                              choices=["sharpe", "sortino", "calmar", "pnl"], help="Reward function")
    train_parser.set_defaults(func=train_command)

    # Evaluate command
    eval_parser = subparsers.add_parser("evaluate", help="Evaluate a trained model")
    eval_parser.add_argument("--model", type=str, required=True, help="Path to saved model")
    eval_parser.add_argument("--algorithm", type=str, default="ppo",
                             choices=["ppo", "sac", "dqn"], help="Algorithm used to train model")
    eval_parser.add_argument("--data-path", type=str, help="Path to market data CSV")
    eval_parser.add_argument("--episodes", type=int, default=10, help="Number of episodes")
    eval_parser.set_defaults(func=evaluate_command)

    # Predict command
    predict_parser = subparsers.add_parser("predict", help="Run inference with a trained model")
    predict_parser.add_argument("--model", type=str, required=True, help="Path to saved model")
    predict_parser.add_argument("--algorithm", type=str, default="ppo",
                                choices=["ppo", "sac", "dqn"], help="Algorithm used")
    predict_parser.add_argument("--data-path", type=str, help="Path to market data CSV")
    predict_parser.add_argument("--steps", type=int, default=100, help="Number of steps")
    predict_parser.set_defaults(func=predict_command)

    # Walk-Forward Analysis command
    wf_parser = subparsers.add_parser("walk-forward", help="Run walk-forward analysis")
    wf_parser.add_argument("--config", type=str, help="Path to YAML config file")
    wf_parser.add_argument("--data-path", type=str, required=True, help="Path to market data CSV")
    wf_parser.add_argument("--algorithm", type=str, default="ppo", choices=["ppo", "sac", "dqn"], help="RL algorithm")
    wf_parser.add_argument("--timesteps", type=int, help="Total training timesteps per fold")
    wf_parser.add_argument("--splits", type=int, default=5, help="Number of WFA splits")
    wf_parser.add_argument("--rolling", action="store_true", help="Use rolling window (default: expanding)")
    wf_parser.add_argument("--initial-train", type=float, default=0.3, help="Initial train fraction for rolling window")
    wf_parser.add_argument("--save-models", action="store_true", help="Save model for each fold")
    wf_parser.add_argument("--output-dir", type=str, default="./wfa_results", help="Output directory")
    wf_parser.set_defaults(func=walk_forward_command)

    # Ensemble Training command
    ensemble_parser = subparsers.add_parser("ensemble-train", help="Train ensemble of RL agents")
    ensemble_parser.add_argument("--config", type=str, help="Path to YAML config file")
    ensemble_parser.add_argument("--data-path", type=str, required=True, help="Path to market data CSV")
    ensemble_parser.add_argument("--algorithm", type=str, default="ppo", choices=["ppo", "sac", "dqn"], help="RL algorithm")
    ensemble_parser.add_argument("--timesteps", type=int, help="Total training timesteps per model")
    ensemble_parser.add_argument("--n-models", type=int, default=5, help="Number of ensemble members")
    ensemble_parser.add_argument("--method", type=str, default="weighted", choices=["voting", "weighted", "best"], help="Ensemble method")
    ensemble_parser.add_argument("--weight-metric", type=str, default="sharpe_ratio", help="Metric for weighting")
    ensemble_parser.add_argument("--hyperparams", type=str, help="JSON string of hyperparameter grid")
    ensemble_parser.add_argument("--output-dir", type=str, default="./ensemble_models", help="Output directory")
    ensemble_parser.set_defaults(func=ensemble_train_command)

    # Paper Trading command
    paper_parser = subparsers.add_parser("paper-trade", help="Run paper trading simulation")
    paper_parser.add_argument("--model", type=str, required=True, help="Path to trained model")
    paper_parser.add_argument("--algorithm", type=str, default="ppo", choices=["ppo", "sac", "dqn"], help="Algorithm used")
    paper_parser.add_argument("--data-path", type=str, required=True, help="Path to market data CSV")
    paper_parser.add_argument("--capital", type=float, default=10000.0, help="Initial capital")
    paper_parser.add_argument("--duration", type=int, help="Max steps (default: all data)")
    paper_parser.add_argument("--save-interval", type=int, default=100, help="Save state every N steps")
    paper_parser.add_argument("--state-file", type=str, help="Path to state file")
    paper_parser.set_defaults(func=paper_trade_command)

    # Capital Allocation command
    alloc_parser = subparsers.add_parser("capital-allocate", help="Manage capital allocation")
    alloc_parser.add_argument("--total-capital", type=float, default=100000.0, help="Total available capital")
    alloc_parser.add_argument("--stages", type=str, default="0.01,0.05,0.10", help="Comma-separated allocation stages (fractions)")
    alloc_parser.add_argument("--window", type=int, default=100, help="Performance window")
    alloc_parser.add_argument("--sharpe-up", type=float, default=1.5, help="Sharpe threshold to increase allocation")
    alloc_parser.add_argument("--sharpe-down", type=float, default=0.5, help="Sharpe threshold to decrease allocation")
    alloc_parser.add_argument("--max-dd", type=float, default=0.10, help="Max drawdown limit")
    alloc_parser.add_argument("--cooldown", type=int, default=20, help="Cooldown period between changes")
    alloc_parser.add_argument("--performance-file", type=str, help="JSON file with performance data to simulate")
    alloc_parser.add_argument("--output", type=str, help="Save allocation history to CSV")
    alloc_parser.set_defaults(func=capital_allocate_command)

    # Performance Monitor command
    monitor_parser = subparsers.add_parser("monitor", help="Monitor performance against benchmarks")
    monitor_parser.add_argument("--returns-file", type=str, help="JSON file with agent returns array")
    monitor_parser.add_argument("--benchmark-file", type=str, help="JSON file with benchmark returns dict")
    monitor_parser.add_argument("--window", type=int, default=100, help="Rolling window size")
    monitor_parser.add_argument("--output", type=str, default="./performance_report.json", help="Output report path")
    monitor_parser.set_defaults(func=monitor_command)

    args = parser.parse_args(argv)
    return args.func(args)

if __name__ == "__main__":
    sys.exit(main())
