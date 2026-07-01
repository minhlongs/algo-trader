"""
Logging utilities for RL training.
"""

import logging
from pathlib import Path
from typing import Optional

def setup_logging(
    log_file: Optional[Path] = None,
    level: int = logging.INFO,
    console: bool = True
) -> logging.Logger:
    """
    Configure Python logging.

    Args:
        log_file: Optional file path to write logs
        level: Logging level
        console: Whether to output to console

    Returns:
        Configured logger
    """
    logger = logging.getLogger("rl")
    logger.setLevel(level)
    logger.handlers = []  # Clear existing

    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    if console:
        console_handler = logging.StreamHandler()
        console_handler.setLevel(level)
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)

    if log_file:
        log_file.parent.mkdir(parents=True, exist_ok=True)
        file_handler = logging.FileHandler(log_file)
        file_handler.setLevel(level)
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

    return logger

class TensorBoardLogger:
    """Wrapper for TensorBoard logging with fallback when not available."""

    def __init__(self, log_dir: str):
        self.log_dir = log_dir
        self.writer = None
        try:
            from torch.utils.tensorboard import SummaryWriter
            self.writer = SummaryWriter(log_dir=log_dir)
        except ImportError:
            print(f"TensorBoard not available. Logging to {log_dir} disabled.")

    def log_scalar(self, tag: str, value: float, step: int) -> None:
        """Log a scalar value."""
        if self.writer:
            self.writer.add_scalar(tag, value, step)
        else:
            # Fallback: print
            print(f"Step {step}: {tag} = {value}")

    def close(self) -> None:
        """Close writer."""
        if self.writer:
            self.writer.close()
