"""
Visualization utilities for backtest results.
"""

from typing import List, Dict, Optional
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from pathlib import Path

def plot_equity_curve(
    equity_curve: List[float],
    title: str = "Equity Curve",
    save_path: Optional[Path] = None
) -> None:
    """Plot equity curve over time."""
    plt.figure(figsize=(12, 4))
    plt.plot(equity_curve, linewidth=2)
    plt.title(title)
    plt.xlabel("Step")
    plt.ylabel("Equity ($)")
    plt.grid(True, alpha=0.3)
    if save_path:
        plt.savefig(save_path, dpi=150, bbox_inches='tight')
        plt.close()
    else:
        plt.show()

def plot_drawdown_chart(
    equity_curve: List[float],
    title: str = "Drawdown Chart",
    save_path: Optional[Path] = None
) -> None:
    """Plot drawdown over time."""
    equity = np.array(equity_curve)
    running_max = np.maximum.accumulate(equity)
    drawdown = (equity - running_max) / running_max * 100  # percentage

    plt.figure(figsize=(12, 4))
    plt.fill_between(range(len(drawdown)), drawdown, 0, color='red', alpha=0.3)
    plt.plot(drawdown, linewidth=2, color='red')
    plt.title(title)
    plt.xlabel("Step")
    plt.ylabel("Drawdown (%)")
    plt.grid(True, alpha=0.3)
    if save_path:
        plt.savefig(save_path, dpi=150, bbox_inches='tight')
        plt.close()
    else:
        plt.show()

def plot_returns_distribution(
    returns: List[float],
    title: str = "Returns Distribution",
    save_path: Optional[Path] = None
) -> None:
    """Plot histogram of returns."""
    plt.figure(figsize=(8, 4))
    plt.hist(returns, bins=50, edgecolor='black', alpha=0.7)
    plt.axvline(x=0, color='red', linestyle='--', linewidth=2)
    plt.title(title)
    plt.xlabel("Return")
    plt.ylabel("Frequency")
    plt.grid(True, alpha=0.3)
    if save_path:
        plt.savefig(save_path, dpi=150, bbox_inches='tight')
        plt.close()
    else:
        plt.show()

def plot_trade_analysis(
    trades: List,
    title: str = "Trade Analysis",
    save_path: Optional[Path] = None
) -> None:
    """
    Plot trade outcomes (P&L per trade).
    """
    if not trades:
        print("No trades to plot")
        return

    pnls = [t.pnl for t in trades]
    plt.figure(figsize=(10, 4))
    plt.bar(range(len(pnls)), pnls, color=['green' if p > 0 else 'red' for p in pnls])
    plt.axhline(y=0, color='black', linewidth=1)
    plt.title(title)
    plt.xlabel("Trade #")
    plt.ylabel("P&L ($)")
    plt.grid(True, alpha=0.3, axis='y')
    if save_path:
        plt.savefig(save_path, dpi=150, bbox_inches='tight')
        plt.close()
    else:
        plt.show()

def save_plots(
    output_dir: Path,
    equity_curve: List[float] = None,
    returns: List[float] = None,
    trades: List = None,
    prefix: str = ""
) -> None:
    """
    Save all plots to directory.

    Args:
        output_dir: Directory to save plots
        equity_curve: Equity curve data
        returns: Returns data
        trades: Trades list
        prefix: Filename prefix
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    if equity_curve:
        plot_equity_curve(
            equity_curve,
            title="Equity Curve",
            save_path=output_dir / f"{prefix}equity_curve.png"
        )
        plot_drawdown_chart(
            equity_curve,
            title="Drawdown Chart",
            save_path=output_dir / f"{prefix}drawdown.png"
        )

    if returns:
        plot_returns_distribution(
            returns,
            title="Returns Distribution",
            save_path=output_dir / f"{prefix}returns_dist.png"
        )

    if trades:
        plot_trade_analysis(
            trades,
            title="Trade Analysis",
            save_path=output_dir / f"{prefix}trades.png"
        )
