/**
 * Backtesting Service
 *
 * Wraps the shared BacktestRunner engine with marketplace repository persistence.
 * Provides submitBacktest → run engine → store result → return summary.
 */

import { BacktestRunner, BacktestTrade, BacktestResult } from '../../../shared/backtesting/backtest-runner';
import type { BacktestRepository, BacktestCreateInput } from '../repositories/backtest-repository';
import type { IMarketplaceStrategy } from '../models/types';
import { logger } from '../../../shared/utils/logger';

export class BacktestingService {
  private static instance: BacktestingService | null = null;
  private readonly backtestRepo: BacktestRepository;

  private constructor() {
    const mod = require('../repositories/backtest-repository');
    this.backtestRepo = mod.backtestRepository;
  }

  static getInstance(): BacktestingService {
    if (!BacktestingService.instance) {
      BacktestingService.instance = new BacktestingService();
    }
    return BacktestingService.instance;
  }

  static resetInstance(): void {
    BacktestingService.instance = null;
  }

  /**
   * Run a backtest for a strategy and persist the result.
   * @param strategy - the strategy being tested
   * @param trades - historical trades to evaluate (provided by client or fetched from DB)
   * @param config - optional overrides for initial capital / risk-free rate
   * @returns persisted backtest row
   */
  async submitBacktest(
    strategy: IMarketplaceStrategy,
    trades: BacktestTrade[],
    config?: { initialCapitalUsd?: number; riskFreeRateAnnual?: number },
  ): Promise<{
    id: string;
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
    totalPnlUsd: number;
    totalTrades: number;
  }> {
    const partialConfig: Partial<{ initialCapitalUsd: number; riskFreeRateAnnual: number }> = {};
    if (config?.initialCapitalUsd !== undefined) partialConfig.initialCapitalUsd = config.initialCapitalUsd;
    if (config?.riskFreeRateAnnual !== undefined) partialConfig.riskFreeRateAnnual = config.riskFreeRateAnnual;

    const result: BacktestResult = BacktestRunner.run(trades, partialConfig);

    const backtestId = `bt_${strategy.id.slice(0, 8)}_${Date.now()}`;
    const row: BacktestCreateInput = {
      id: backtestId,
      strategyId: strategy.id,
      tenantId: strategy.tenantId,
      sharpeRatio: result.sharpeRatio,
      maxDrawdown: result.maxDrawdown,
      winRate: result.winRate,
      totalPnlUsd: Math.round(result.totalPnlUsd * 100) / 100,
      profitFactor: result.profitFactor,
      totalTrades: result.totalTrades,
      winningTrades: result.winningTrades,
      losingTrades: result.losingTrades,
      avgWinUsd: result.avgWinUsd,
      avgLossUsd: result.avgLossUsd,
      volatility: result.volatilityAnnual,
      equityCurve: result.equityCurve,
      totalReturn: result.totalReturn,
      initialCapitalUsd: config?.initialCapitalUsd ?? 10000,
      config: { riskFreeRateAnnual: config?.riskFreeRateAnnual ?? 0.05 },
    };

    await this.backtestRepo.create(row);

    logger.info('[BacktestingService] backtest persisted', {
      backtestId,
      strategyId: strategy.id,
      sharpe: result.sharpeRatio,
      maxDrawdown: result.maxDrawdown,
      totalTrades: result.totalTrades,
    });

    return {
      id: backtestId,
      sharpeRatio: result.sharpeRatio,
      maxDrawdown: result.maxDrawdown,
      winRate: result.winRate,
      totalPnlUsd: Math.round(result.totalPnlUsd * 100) / 100,
      totalTrades: result.totalTrades,
    };
  }

  async getBacktest(id: string): Promise<ReturnType<typeof this.backtestRepo.findById> & Record<string, unknown>> {
    return this.backtestRepo.findById(id) as ReturnType<typeof this.backtestRepo.findById> & Record<string, unknown>;
  }

  async getBacktestsByStrategy(strategyId: string): Promise<Awaited<ReturnType<typeof this.backtestRepo.findByStrategy>>> {
    return this.backtestRepo.findByStrategy(strategyId);
  }

  async getLatestByStrategy(strategyId: string): Promise<Awaited<ReturnType<typeof this.backtestRepo.findLatestByStrategy>>> {
    return this.backtestRepo.findLatestByStrategy(strategyId);
  }

  async getBacktestsByTenant(tenantId: string): Promise<Awaited<ReturnType<typeof this.backtestRepo.findByTenant>>> {
    return this.backtestRepo.findByTenant(tenantId);
  }
}

export default BacktestingService.getInstance();
