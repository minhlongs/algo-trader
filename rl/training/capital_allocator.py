"""
Gradual capital allocation manager.

Automatically adjusts allocated capital based on agent performance metrics.
Scales from small (1%) to larger allocations as confidence grows.
"""

import numpy as np
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
import logging
from enum import Enum

logger = logging.getLogger(__name__)


class AllocationAction(Enum):
    """Allocation adjustment actions."""
    INCREASE = "increase"
    DECREASE = "decrease"
    HOLD = "hold"


@dataclass
class CapitalAllocationConfig:
    """Configuration for capital allocation."""
    total_capital: float = 100000.0
    allocation_stages: List[float] = field(default_factory=lambda: [0.01, 0.05, 0.10])
    performance_window: int = 100
    sharpe_threshold_up: float = 1.5
    sharpe_threshold_down: float = 0.5
    max_drawdown_limit: float = 0.10
    consecutive_wins: int = 5
    cooldown_period: int = 20


@dataclass
class CapitalAllocationDecision:
    """Represents a capital allocation decision."""
    timestamp: Any  # datetime or step number
    current_allocation_pct: float
    target_allocation_pct: float
    reason: str
    action: AllocationAction
    metrics: Dict[str, float] = field(default_factory=dict)
    adjusted: bool = False


@dataclass
class CapitalAllocatorState:
    """Snapshot of capital allocator state."""
    total_capital: float
    current_allocation: float
    allocated_capital: float
    available_capital: float
    performance_history: List[float]
    drawdown_history: List[float]
    last_adjustment: int
    decision_history: List[CapitalAllocationDecision]
    stage_index: int


class CapitalAllocator:
    """
    Manages gradual capital allocation based on performance.

    Starts with small allocation (1%) and escalates to higher levels (5%, 10%)
    when performance thresholds are met. De-escalates on drawdown or losses.

    Features:
    - Multi-stage allocation (configurable stages)
    - Performance-based triggers (Sharpe, drawdown, win streaks)
    - Cooldown period to prevent频繁调整
    - Decision logging and history
    """

    def __init__(
        self,
        config: CapitalAllocationConfig,
        performance_tracker: Optional['PerformanceMonitor'] = None
    ):
        """
        Initialize capital allocator.

        Args:
            config: Allocation configuration
            performance_tracker: Optional performance monitor to pull metrics from
        """
        self.config = config
        self.performance_tracker = performance_tracker

        # Current state
        self.current_allocation_pct = config.allocation_stages[0] if config.allocation_stages else 0.01
        self.allocated_capital = config.total_capital * self.current_allocation_pct
        self.available_capital = config.total_capital - self.allocated_capital

        self.stage_index = 0
        self.last_adjustment_step = 0
        self.current_step = 0

        # History
        self.performance_history: List[float] = []
        self.drawdown_history: List[float] = []
        self.decision_history: List[CapitalAllocationDecision] = []
        self.latest_recent_returns: List[float] = []

        logger.info(f"Capital Allocator initialized: total={config.total_capital:.2f}, "
                   f"stages={config.allocation_stages}, initial={self.current_allocation_pct:.1%}")

    def update_performance(
        self,
        sharpe_ratio: float,
        max_drawdown: float,
        recent_returns: List[float]
    ) -> None:
        """
        Update performance metrics for decision making.

        Args:
            sharpe_ratio: Current Sharpe ratio (rolling window)
            max_drawdown: Current max drawdown
            recent_returns: List of recent returns (for win streak calc)
        """
        self.performance_history.append(sharpe_ratio)
        self.drawdown_history.append(max_drawdown)
        self.latest_recent_returns = list(recent_returns)  # store for decision

        # Keep only recent history
        window = self.config.performance_window
        if len(self.performance_history) > window:
            self.performance_history = self.performance_history[-window:]
        if len(self.drawdown_history) > window:
            self.drawdown_history = self.drawdown_history[-window:]

    def evaluate(
        self,
        current_metrics: Optional[Dict[str, float]] = None
    ) -> CapitalAllocationDecision:
        """
        Evaluate whether to adjust allocation.

        Args:
            current_metrics: Optional dict with 'sharpe_ratio', 'max_drawdown', 'recent_returns'

        Returns:
            CapitalAllocationDecision with action and reasoning
        """
        self.current_step += 1

        # Check cooldown (only if we have made at least one adjustment before)
        steps_since_last = self.current_step - self.last_adjustment_step
        if self.last_adjustment_step > 0 and steps_since_last < self.config.cooldown_period:
            logger.debug(f"Allocation in cooldown ({steps_since_last}/{self.config.cooldown_period})")
            return CapitalAllocationDecision(
                timestamp=self.current_step,
                current_allocation_pct=self.current_allocation_pct,
                target_allocation_pct=self.current_allocation_pct,
                reason="cooldown",
                action=AllocationAction.HOLD,
                metrics={},
                adjusted=False
            )

        # Get current performance
        if current_metrics:
            sharpe = current_metrics.get('sharpe_ratio', 0.0)
            max_dd = current_metrics.get('max_drawdown', 0.0)
            recent_returns = current_metrics.get('recent_returns', self.latest_recent_returns)
        elif self.performance_tracker:
            # Pull from performance tracker
            # Simplified: get latest metrics
            sharpe = 0.0  # TODO: extract from tracker
            max_dd = 0.0
            recent_returns = []
        else:
            # Use history
            sharpe = self.performance_history[-1] if self.performance_history else 0.0
            max_dd = self.drawdown_history[-1] if self.drawdown_history else 0.0
            recent_returns = self.latest_recent_returns

        metrics = {'sharpe_ratio': sharpe, 'max_drawdown': max_dd}

        # Decision logic
        action = self._decide_action(sharpe, max_dd, recent_returns)

        # Apply action
        target_allocation = self.current_allocation_pct
        reason = "hold"
        adjusted = False

        if action == AllocationAction.INCREASE:
            # Try to move to next stage
            if self.stage_index < len(self.config.allocation_stages) - 1:
                next_stage = self.config.allocation_stages[self.stage_index + 1]
                target_allocation = next_stage
                self.stage_index += 1
                reason = "performance_up"
                adjusted = True
                self.last_adjustment_step = self.current_step

        elif action == AllocationAction.DECREASE:
            # Move to lower stage
            if self.stage_index > 0:
                prev_stage = self.config.allocation_stages[self.stage_index - 1]
                target_allocation = prev_stage
                self.stage_index -= 1
                reason = "performance_down"
                adjusted = True
                self.last_adjustment_step = self.current_step

        # Update capital amounts
        if adjusted:
            self.allocated_capital = self.config.total_capital * target_allocation
            self.available_capital = self.config.total_capital - self.allocated_capital
            self.current_allocation_pct = target_allocation

            logger.info(f"Capital allocation adjusted: {reason}, "
                       f"allocation={target_allocation:.1%}, "
                       f"allocated={self.allocated_capital:.2f}")

        decision = CapitalAllocationDecision(
            timestamp=self.current_step,
            current_allocation_pct=self.current_allocation_pct,
            target_allocation_pct=target_allocation,
            reason=reason,
            action=action,
            metrics=metrics.copy(),
            adjusted=adjusted
        )

        self.decision_history.append(decision)

        return decision

    def _decide_action(
        self,
        sharpe: float,
        max_dd: float,
        recent_returns: List[float]
    ) -> AllocationAction:
        """
        Decide allocation action based on metrics.

        Returns:
            AllocationAction: INCREASE, DECREASE, or HOLD
        """
        # Check drawdown limit (hard stop)
        if max_dd > self.config.max_drawdown_limit:
            logger.warning(f"Max drawdown {max_dd:.2%} exceeds limit {self.config.max_drawdown_limit:.2%}")
            return AllocationAction.DECREASE

        # Check Sharpe thresholds
        if sharpe >= self.config.sharpe_threshold_up:
            # Check consecutive wins
            if self._check_consecutive_wins(recent_returns, min_streak=3):
                return AllocationAction.INCREASE

        if sharpe <= self.config.sharpe_threshold_down:
            return AllocationAction.DECREASE

        return AllocationAction.HOLD

    def _check_consecutive_wins(self, returns: List[float], min_streak: int = 3) -> bool:
        """
        Check if there are consecutive positive returns.

        Args:
            returns: List of recent returns
            min_streak: Minimum consecutive wins required

        Returns:
            True if streak meets threshold
        """
        if len(returns) < min_streak:
            return False

        streak = 0
        for r in reversed(returns):
            if r > 0:
                streak += 1
                if streak >= min_streak:
                    return True
            else:
                break

        return False

    def get_state(self) -> CapitalAllocatorState:
        """Get current allocator state."""
        return CapitalAllocatorState(
            total_capital=self.config.total_capital,
            current_allocation=self.current_allocation_pct,
            allocated_capital=self.allocated_capital,
            available_capital=self.available_capital,
            performance_history=self.performance_history.copy(),
            drawdown_history=self.drawdown_history.copy(),
            last_adjustment=self.last_adjustment_step,
            decision_history=self.decision_history.copy(),
            stage_index=self.stage_index
        )

    def get_allocation_summary(self) -> Dict[str, Any]:
        """
        Get human-readable allocation summary.

        Returns:
            Dictionary with allocation details
        """
        state = self.get_state()

        # Determine current stage index from allocation if possible, else use stage_index
        try:
            idx = self.config.allocation_stages.index(self.current_allocation_pct)
            current_stage = f"{idx + 1}/{len(self.config.allocation_stages)}"
        except (ValueError, AttributeError):
            current_stage = f"{self.stage_index + 1}/{len(self.config.allocation_stages)}"

        summary = {
            'total_capital': state.total_capital,
            'allocation_pct': state.current_allocation,
            'allocated_capital': state.allocated_capital,
            'available_capital': state.available_capital,
            'current_stage': current_stage,
            'stages': self.config.allocation_stages,
            'num_adjustments': len(self.decision_history),
            'last_adjustment_step': state.last_adjustment,
            'recent_sharpe': np.mean(self.performance_history[-10:]) if self.performance_history else None,
            'recent_max_dd': np.mean(self.drawdown_history[-10:]) if self.drawdown_history else None
        }

        return summary

    def save_history(self, path: str) -> None:
        """
        Save allocation decision history to CSV.

        Args:
            path: Output file path
        """
        import csv
        from pathlib import Path

        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)

        with open(path, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow([
                'step', 'allocation_pct', 'allocated_capital', 'reason',
                'sharpe', 'max_drawdown', 'adjusted'
            ])
            for decision in self.decision_history:
                writer.writerow([
                    decision.timestamp,
                    decision.current_allocation_pct,
                    decision.current_allocation_pct * self.config.total_capital,
                    decision.reason,
                    decision.metrics.get('sharpe_ratio', 0),
                    decision.metrics.get('max_drawdown', 0),
                    decision.adjusted
                ])

        logger.info(f"Allocation history saved to {path}")
