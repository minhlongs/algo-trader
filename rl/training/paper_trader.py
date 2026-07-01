"""
Paper trading simulation with virtual capital.

Simulates a brokerage environment for live trading practice without real money.
Tracks positions, P&L, commissions, and maintains session state.
"""

import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional
from pathlib import Path
import json
import logging
from dataclasses import dataclass, field, asdict

import numpy as np

from rl.config import RLConfig, PaperTradingConfig
from rl.types import PaperTradingSession, PaperTradingPosition, PaperTradeOrder

logger = logging.getLogger(__name__)


class PaperTradingEngine:
    """
    Manages paper trading sessions with virtual capital.

    Features:
    - State persistence (survive restarts)
    - Order execution simulation (fills, partial fills)
    - P&L tracking (realized and unrealized)
    - Commission and slippage modeling
    - Session history and export
    """

    def __init__(
        self,
        config: PaperTradingConfig,
        rl_config: RLConfig,
        state_file: Optional[str] = None
    ):
        """
        Initialize paper trading engine.

        Args:
            config: Paper trading configuration
            rl_config: RL environment config (for transaction costs, slippage)
            state_file: Optional path to load/save state
        """
        self.config = config
        self.rl_config = rl_config
        self.state_file = Path(state_file or config.state_file or f"./paper_trading_{config.initial_capital:.0f}.json")

        # Initialize or load session
        if self.state_file.exists() and config.persist_state:
            self.session = self._load_state()
            logger.info(f"Resumed paper trading session: {self.session.session_id}")
        else:
            self.session = self._create_new_session()
            logger.info(f"Created new paper trading session: {self.session.session_id}")

        # Trading state
        self.current_price: Optional[float] = None
        self.current_step: int = self.session.current_step

    def _create_new_session(self) -> PaperTradingSession:
        """Create a fresh paper trading session."""
        session_id = str(uuid.uuid4())[:8]
        return PaperTradingSession(
            session_id=session_id,
            start_time=datetime.now(),
            is_active=True,
            initial_capital=self.config.initial_capital,
            current_capital=self.config.initial_capital,
            positions=[],
            trade_history=[],
            equity_curve=[],
            current_step=0,
            last_update=datetime.now()
        )

    def _load_state(self) -> PaperTradingSession:
        """Load session state from disk."""
        with open(self.state_file, 'r') as f:
            data = json.load(f)

        # Reconstruct dataclass
        positions = [PaperTradingPosition(**p) for p in data.get('positions', [])]
        trade_history = [PaperTradeOrder(**t) for t in data.get('trade_history', [])]
        equity_curve = data.get('equity_curve', [])

        session = PaperTradingSession(
            session_id=data['session_id'],
            start_time=datetime.fromisoformat(data['start_time']),
            is_active=data['is_active'],
            initial_capital=data['initial_capital'],
            current_capital=data['current_capital'],
            positions=positions,
            trade_history=trade_history,
            equity_curve=equity_curve,
            current_step=data['current_step'],
            last_update=datetime.fromisoformat(data['last_update'])
        )

        return session

    def save_state(self) -> None:
        """Persist session state to disk."""
        if not self.config.persist_state:
            return

        # Convert dataclasses to dict
        state_dict = {
            'session_id': self.session.session_id,
            'start_time': self.session.start_time.isoformat(),
            'is_active': self.session.is_active,
            'initial_capital': self.session.initial_capital,
            'current_capital': self.session.current_capital,
            'positions': [asdict(p) for p in self.session.positions],
            'trade_history': [asdict(t) for t in self.session.trade_history],
            'equity_curve': self.session.equity_curve,
            'current_step': self.session.current_step,
            'last_update': datetime.now().isoformat()
        }

        with open(self.state_file, 'w') as f:
            json.dump(state_dict, f, indent=2)

        logger.debug(f"Saved paper trading state to {self.state_file}")

    def update_price(self, price: float) -> None:
        """
        Update current market price.

        Args:
            price: Current price of the traded asset
        """
        self.current_price = price
        self._update_unrealized_pnl()

    def execute_order(
        self,
        side: str,
        size: float,
        price: Optional[float] = None,
        order_type: str = "market"
    ) -> PaperTradeOrder:
        """
        Execute a paper trading order.

        Args:
            side: "buy" or "sell"
            size: Number of units to trade
            price: Optional limit price (if None, use current_price)
            order_type: "market" or "limit"

        Returns:
            PaperTradeOrder with execution details
        """
        if price is None:
            if self.current_price is None:
                raise ValueError("Current price not set. Call update_price() first.")
            price = self.current_price

        # Apply slippage
        slippage = self.rl_config.slippage
        if side == "buy":
            exec_price = price * (1 + slippage)
        else:  # sell
            exec_price = price * (1 - slippage)

        # Calculate commission
        commission = exec_price * size * self.rl_config.transaction_cost

        # Check if sufficient capital for buy
        if side == "buy":
            required_capital = exec_price * size + commission
            if required_capital > self.session.current_capital:
                # Partial fill: buy as much as possible
                max_size = (self.session.current_capital - commission) / (exec_price + commission)
                if max_size <= 0:
                    raise ValueError("Insufficient capital for order")
                size = max_size * 0.99  # Leave small buffer
                logger.warning(f"Order partially filled: reduced size to {size:.4f}")

        # Create order
        order_id = str(uuid.uuid4())[:8]
        order = PaperTradeOrder(
            order_id=order_id,
            timestamp=datetime.now(),
            side=side,
            size=size,
            price=price,
            commission=commission,
            status="filled",
            fill_price=exec_price,
            fill_time=datetime.now()
        )

        # Update position and capital
        self._apply_fill(order)

        # Record trade
        self.session.trade_history.append(order)

        logger.info(f"Order executed: {side} {size:.4f} @ {exec_price:.2f}, commission={commission:.2f}")

        return order

    def _apply_fill(self, order: PaperTradeOrder) -> None:
        """
        Apply executed order to position and capital.

        Args:
            order: Executed PaperTradeOrder
        """
        size = order.size if order.side == "buy" else -order.size
        exec_price = order.fill_price

        # Find existing position for this symbol (currently single-asset)
        symbol = "DEFAULT"  # TODO: support multi-asset
        existing_pos = next((p for p in self.session.positions if p.symbol == symbol), None)

        if existing_pos:
            # Update existing position
            if (existing_pos.size > 0 and size > 0) or (existing_pos.size < 0 and size < 0):
                # Adding to same direction: average entry price
                total_cost = (existing_pos.size * existing_pos.entry_price) + (size * exec_price)
                total_size = abs(existing_pos.size) + abs(size)
                existing_pos.entry_price = total_cost / total_size if total_size > 0 else exec_price
                existing_pos.size += size
            else:
                # Reducing or flipping position
                old_size = existing_pos.size
                existing_pos.size += size

                # Calculate realized P&L for the closed portion
                closed_size = min(abs(old_size), abs(size))
                realized_pnl = (exec_price - existing_pos.entry_price) * closed_size * (1 if old_size > 0 else -1)
                existing_pos.realized_pnl += realized_pnl

                # If position flips, start new position
                if existing_pos.size == 0:
                    # Remove position
                    self.session.positions.remove(existing_pos)
                elif (existing_pos.size > 0 and size < 0) or (existing_pos.size < 0 and size > 0):
                    # Position flipped, adjust entry price
                    existing_pos.entry_price = exec_price

            # Update current price
            existing_pos.current_price = self.current_price
            existing_pos.unrealized_pnl = (self.current_price - existing_pos.entry_price) * existing_pos.size

        else:
            # Opening new position
            new_pos = PaperTradingPosition(
                symbol=symbol,
                size=size,
                entry_price=exec_price,
                current_price=self.current_price,
                unrealized_pnl=0.0,
                realized_pnl=0.0
            )
            self.session.positions.append(new_pos)

        # Deduct commission from capital
        self.session.current_capital -= order.commission

        # Update step
        self.session.current_step += 1
        self.session.last_update = datetime.now()

        # Auto-save
        if self.session.current_step % self.config.save_interval == 0:
            self.save_state()

    def _update_unrealized_pnl(self) -> None:
        """Update unrealized P&L for all positions based on current price."""
        if self.current_price is None:
            return

        for position in self.session.positions:
            position.current_price = self.current_price
            position.unrealized_pnl = (self.current_price - position.entry_price) * position.size

    def get_total_equity(self) -> float:
        """
        Calculate total equity (capital + unrealized P&L).

        Returns:
            Total equity value
        """
        unrealized_sum = sum(p.unrealized_pnl for p in self.session.positions)
        return self.session.current_capital + unrealized_sum

    def get_session_summary(self) -> Dict[str, Any]:
        """
        Get comprehensive session summary.

        Returns:
            Dictionary with session statistics
        """
        total_pnl = sum(p.realized_pnl for p in self.session.positions) + sum(p.unrealized_pnl for p in self.session.positions)
        total_return = (self.get_total_equity() - self.session.initial_capital) / self.session.initial_capital

        # Compute metrics from equity curve if available
        if len(self.session.equity_curve) > 1:
            returns = np.diff(self.session.equity_curve) / self.session.equity_curve[:-1]
            sharpe = self._compute_sharpe(returns)
            max_dd = self._compute_max_drawdown(np.array(self.session.equity_curve))
        else:
            sharpe = 0.0
            max_dd = 0.0

        summary = {
            'session_id': self.session.session_id,
            'start_time': self.session.start_time.isoformat(),
            'current_step': self.session.current_step,
            'is_active': self.session.is_active,
            'initial_capital': self.session.initial_capital,
            'current_capital': self.session.current_capital,
            'total_equity': self.get_total_equity(),
            'total_pnl': total_pnl,
            'total_return': total_return,
            'sharpe_ratio': sharpe,
            'max_drawdown': max_dd,
            'num_trades': len(self.session.trade_history),
            'num_positions': len(self.session.positions),
            'state_file': str(self.state_file)
        }

        return summary

    def _compute_sharpe(self, returns: np.ndarray, annualization: float = 252 * 24 * 12) -> float:
        """Compute Sharpe ratio from returns array."""
        if len(returns) < 2:
            return 0.0
        mean_return = np.mean(returns)
        std_return = np.std(returns, ddof=1)
        if std_return == 0:
            return 0.0
        sharpe = mean_return / std_return
        return sharpe * np.sqrt(annualization)

    def _compute_max_drawdown(self, equity: np.ndarray) -> float:
        """Compute maximum drawdown from equity curve."""
        if len(equity) < 2:
            return 0.0
        running_max = np.maximum.accumulate(equity)
        drawdown = (equity - running_max) / running_max
        return float(np.min(drawdown))

    def stop_session(self) -> Dict[str, Any]:
        """
        Stop the paper trading session.

        Returns:
            Final session summary
        """
        self.session.is_active = False
        self.save_state()

        summary = self.get_session_summary()
        logger.info(f"Paper trading session stopped: {summary}")

        return summary


class PaperTradingOrchestrator:
    """
    Orchestrates paper trading with an RL agent.

    Connects the RL agent inference to the PaperTradingEngine,
    handling the main loop of price updates and action execution.
    """

    def __init__(
        self,
        config: PaperTradingConfig,
        rl_config: RLConfig,
        model_path: str,
        algorithm: str = "ppo"
    ):
        """
        Initialize orchestrator.

        Args:
            config: Paper trading config
            rl_config: RL environment config
            model_path: Path to trained model
            algorithm: Algorithm name
        """
        self.config = config
        self.rl_config = rl_config
        self.model_path = model_path
        self.algorithm = algorithm

        # Initialize components
        self.engine = PaperTradingEngine(
            config=config,
            rl_config=rl_config,
            state_file=config.state_file
        )
        self.model = None  # Lazy load

        # Load model
        self._load_model()

    def _load_model(self) -> None:
        """Load the RL model."""
        from stable_baselines3 import PPO, SAC, DQN

        algo_map = {
            'ppo': PPO,
            'sac': SAC,
            'dqn': DQN
        }

        if self.algorithm not in algo_map:
            raise ValueError(f"Unsupported algorithm: {self.algorithm}")

        model_class = algo_map[self.algorithm]
        self.model = model_class.load(self.model_path)
        logger.info(f"Loaded {self.algorithm.upper()} model from {self.model_path}")

    def run(
        self,
        price_data: np.ndarray,
        step_delay: float = 0.0
    ) -> Dict[str, Any]:
        """
        Run paper trading simulation.

        Args:
            price_data: Array of prices (or OHLCV data)
            step_delay: Optional delay between steps (for real-time simulation)

        Returns:
            Final session summary
        """
        logger.info(f"Starting paper trading run with {len(price_data)} steps")

        for step, data in enumerate(price_data):
            # Extract price (assume 'close' column or scalar)
            if isinstance(data, np.ndarray):
                price = float(data[-1]) if len(data) > 0 else float(data)
            else:
                price = float(data)

            # Update engine with current price
            self.engine.update_price(price)

            # Get observation (simplified - need proper env state builder)
            observation = self._build_observation(step)

            # Get action from model
            action, _ = self.model.predict(observation, deterministic=True)

            # Execute action
            position_size = float(action[1]) if len(action) > 1 else 0.5  # Simplified
            if position_size > 0.1:  # Threshold to buy
                self.engine.execute_order("buy", size=100)  # Fixed size for simplicity
            elif position_size < -0.1:
                self.engine.execute_order("sell", size=100)

            # Log progress
            if step % 100 == 0:
                summary = self.engine.get_session_summary()
                logger.info(f"Step {step}: equity={summary['total_equity']:.2f}, return={summary['total_return']:.2%}")

            # Save state periodically
            if step % self.config.save_interval == 0:
                self.engine.save_state()

        # Finalize
        final_summary = self.engine.stop_session()
        logger.info(f"Paper trading complete. Final equity: {final_summary['total_equity']:.2f}")

        return final_summary

    def _build_observation(self, step: int) -> np.ndarray:
        """
        Build observation for current step.

        Note: This is a placeholder. In practice, we'd construct a proper
        observation from the market data and portfolio state.
        """
        # Return dummy observation for now
        return np.random.randn(12).astype(np.float32)
