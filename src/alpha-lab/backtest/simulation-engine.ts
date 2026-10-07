import { Tick } from '@shared/types/market-data';
import { AlmgrenChrissModel } from './slippage-model';
import { calculateDSR } from '../validation/bootstrap-sharpe';

export interface SimulationResult {
  pnl: number;
  sharpe: number;
  dsr: number;
  ticksProcessed: number;
}

export interface EngineConfig {
  dailyVolume: number;
  slippageModel?: AlmgrenChrissModel;
}

export class BacktestEngine {
  private ticks: Tick[];
  private slippageModel: AlmgrenChrissModel;
  private dailyVolume: number;

  constructor(ticks: Tick[], config: EngineConfig) {
    this.ticks = [...ticks].sort((a, b) => a.timestamp - b.timestamp);
    this.slippageModel = config.slippageModel || new AlmgrenChrissModel();
    this.dailyVolume = config.dailyVolume;
  }

  async run(strategy: (tick: Tick) => number): Promise<SimulationResult> {
    let pnl = 0;
    const returns: number[] = [];

    for (let i = 0; i < this.ticks.length; i++) {
        const tick = this.ticks[i];
        const signal = strategy(tick);

        if (signal !== 0) {
            const slippageVal = this.slippageModel.calculateSlippage(Math.abs(signal), this.dailyVolume);
            const executionPrice = signal > 0 ? tick.price + slippageVal : tick.price - slippageVal;
            const tradePnL = signal * executionPrice;
            pnl += tradePnL;
            returns.push(tradePnL);
        }
    }

    const sharpe = returns.length > 0 ? this.calculateSharpe(returns) : 0;
    const dsr = calculateDSR(sharpe, this.calculateStd(returns), returns.length, 1);

    return {
      pnl,
      sharpe,
      dsr,
      ticksProcessed: this.ticks.length
    };
  }

  private calculateSharpe(returns: number[]): number {
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const std = this.calculateStd(returns);
    return std === 0 ? 0 : (mean / std) * Math.sqrt(252);
  }

  private calculateStd(returns: number[]): number {
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    return Math.sqrt(returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length);
  }
}
