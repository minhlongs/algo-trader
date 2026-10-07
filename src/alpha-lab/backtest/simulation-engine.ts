/**
 * Chronological Backtest Engine with Almgren-Chriss Non-Linear Slippage & DSR
 *
 * @module alpha-lab/backtest/simulation-engine
 */

import type { Tick } from '../../shared/types/market-data';
import { AlmgrenChrissModel } from './slippage-model';
import { calculateDSR } from '../validation/bootstrap-sharpe';

export interface SimulationResult {
  pnl: number;
  sharpe: number;
  dsr: number;
  ticksProcessed: number;
  tradesCount: number;
  totalSlippagePaid: number;
  returns: number[];
}

export interface EngineConfig {
  dailyVolume: number;
  slippageModel?: AlmgrenChrissModel;
  initialCapital?: number;
  barsPerYear?: number;
  nBacktests?: number;
  volatility?: number;
}

export class BacktestEngine {
  private readonly ticks: Tick[];
  private readonly slippageModel: AlmgrenChrissModel;
  private readonly dailyVolume: number;
  private readonly initialCapital: number;
  private readonly barsPerYear: number;
  private readonly nBacktests: number;
  private readonly volatility?: number;

  constructor(ticks: readonly Tick[], config: EngineConfig) {
    this.ticks = [...ticks].sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
    this.slippageModel = config.slippageModel ?? new AlmgrenChrissModel();
    this.dailyVolume = config.dailyVolume;
    this.initialCapital = config.initialCapital ?? 10000;
    this.barsPerYear = config.barsPerYear ?? 252;
    this.nBacktests = Math.max(1, config.nBacktests ?? 10);
    this.volatility = config.volatility;
  }

  public getTicks(): readonly Tick[] {
    return this.ticks;
  }

  public async run(strategy: (tick: Tick) => number): Promise<SimulationResult> {
    if (this.ticks.length === 0) {
      return {
        pnl: 0,
        sharpe: 0,
        dsr: 0,
        ticksProcessed: 0,
        tradesCount: 0,
        totalSlippagePaid: 0,
        returns: [],
      };
    }

    let cash = this.initialCapital;
    let position = 0;
    let totalSlippagePaid = 0;
    let tradesCount = 0;
    let prevPortfolioValue = this.initialCapital;
    const returns: number[] = [];

    for (let i = 0; i < this.ticks.length; i++) {
      const tick = this.ticks[i];
      const signal = strategy(tick);

      if (signal !== 0) {
        const orderQty = Math.abs(signal);
        const slippageVal = this.slippageModel.calculateSlippage(orderQty, this.dailyVolume, this.volatility);
        totalSlippagePaid += slippageVal * orderQty;
        tradesCount++;

        if (signal > 0) {
          const executionPrice = tick.price + slippageVal;
          cash -= orderQty * executionPrice;
          position += orderQty;
        } else {
          const executionPrice = tick.price - slippageVal;
          cash += orderQty * executionPrice;
          position -= orderQty;
        }
      }

      const currentPortfolioValue = cash + position * tick.price;
      if (prevPortfolioValue > 0) {
        const periodReturn = (currentPortfolioValue - prevPortfolioValue) / prevPortfolioValue;
        returns.push(periodReturn);
      }
      prevPortfolioValue = currentPortfolioValue;
    }

    const lastTick = this.ticks[this.ticks.length - 1];
    const finalPortfolioValue = cash + position * lastTick.price;
    const pnl = finalPortfolioValue - this.initialCapital;

    const sharpe = returns.length > 0 ? this.calculateSharpe(returns) : 0;
    const std = this.calculateStd(returns);
    const dsr = calculateDSR(sharpe, std, Math.max(1, returns.length), this.nBacktests);

    return {
      pnl,
      sharpe,
      dsr,
      ticksProcessed: this.ticks.length,
      tradesCount,
      totalSlippagePaid,
      returns,
    };
  }

  private calculateSharpe(returns: number[]): number {
    if (returns.length < 2) return 0;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const std = this.calculateStd(returns);
    return std <= 1e-9 ? 0 : (mean / std) * Math.sqrt(this.barsPerYear);
  }

  private calculateStd(returns: number[]): number {
    if (returns.length < 2) return 0;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (returns.length - 1);
    return Math.sqrt(Math.max(0, variance));
  }
}
