/** StrategyLabAgent — backtest validation, re-ranking, and publishing */

import { logger } from '../shared/utils/logger';
import type { BacktestResult, StrategyRankEntry } from './types/strategy-lab-types';

export class StrategyLabAgent {
  /** Run a deterministic backtest mock for a strategy. */
  validateStrategy(strategyId: string): BacktestResult {
    const sharpe = 1.5;
    const winRate = 0.55;
    const maxDrawdown = 0.12;
    const totalTrades = 250;
    const passed = sharpe > 1.0 && winRate > 0.5;

    logger.info('[StrategyLab] Backtest complete', {
      strategyId,
      sharpe,
      winRate,
      maxDrawdown,
      totalTrades,
      passed,
    });

    return {
      strategyId,
      sharpe,
      maxDrawdown,
      winRate,
      totalTrades,
      passed,
    };
  }

  /** Re-rank strategies by Sharpe ratio descending (weekly cron). */
  reRankStrategies(strategyIds: string[]): StrategyRankEntry[] {
    const withSharpe = strategyIds.map((id) => ({
      strategyId: id,
      sharpe: this.mockSharpe(id),
    }));

    withSharpe.sort((a, b) => b.sharpe - a.sharpe);

    const ranked: StrategyRankEntry[] = withSharpe.map((entry, index) => ({
      strategyId: entry.strategyId,
      sharpe: entry.sharpe,
      winRate: 0.55,
      rank: index + 1,
    }));

    logger.info('[StrategyLab] Rankings updated', {
      count: ranked.length,
      topStrategy: ranked[0]?.strategyId,
      topSharpe: ranked[0]?.sharpe,
    });

    return ranked;
  }

  /** Publish an approved strategy to the signal feed. */
  publishStrategy(strategyId: string): void {
    logger.info('[StrategyLab] Strategy published to signal feed', { strategyId });
  }

  private mockSharpe(strategyId: string): number {
    const hash = this.simpleHash(strategyId);
    return +(1.0 + (hash % 100) / 100).toFixed(2);
  }

  private simpleHash(str: string): number {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }
}
