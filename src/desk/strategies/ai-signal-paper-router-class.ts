/**
 * AISignalPaperRouter Class Implementation
 */

import type {
  PaperTradeFillRecord,
  PaperPosition,
  PaperAccount,
  PnlSummary,
} from '../execution/paper-position-types';
import type { AISignal } from './ai-signal-adapter';
import type {
  AISignalPaperRouterConfig,
  EquityPoint,
  SignalRoutingOutcome,
} from './ai-signal-paper-router-types';
import { PaperEquityTracker } from './ai-signal-paper-router-tracker';
import { dispatchSignalOrder } from './ai-signal-paper-router-dispatcher';

export class AISignalPaperRouter {
  private readonly config: AISignalPaperRouterConfig;
  private readonly tracker: PaperEquityTracker;

  constructor(config: AISignalPaperRouterConfig) {
    this.config = {
      defaultSymbol: 'BTC/USDT',
      defaultWinLossRatio: 1.5,
      strictMaxCap: true,
      minPositionUsd: 1.0,
      ...config,
    };
    this.tracker = new PaperEquityTracker(this.config.paperExecutor);
  }

  async start(initialBalance?: number, forceReset = false): Promise<PaperAccount> {
    const account = await this.config.paperExecutor.start(initialBalance, forceReset);
    this.tracker.setHighWaterMark(account.equity);
    this.tracker.recordSnapshot();
    return account;
  }

  async stop(): Promise<void> {
    await this.config.paperExecutor.stop();
    this.tracker.recordSnapshot();
  }

  async reset(initialBalance?: number): Promise<PaperAccount> {
    const account = await this.config.paperExecutor.reset(initialBalance);
    this.tracker.reset(account.equity);
    return account;
  }

  async routeSignal(signal: AISignal, marketPrice: number): Promise<SignalRoutingOutcome> {
    return dispatchSignalOrder(signal, marketPrice, this.config, this.tracker);
  }

  markToMarket(prices: Map<string, number>): PaperPosition[] {
    const updatedPositions = this.config.paperExecutor.updatePrices(prices);
    this.tracker.recordSnapshot();
    return updatedPositions;
  }

  getFillRecords(strategyId?: string): PaperTradeFillRecord[] {
    return this.tracker.getFillRecords(strategyId);
  }

  getEquityCurve(): EquityPoint[] {
    return this.tracker.getEquityCurve();
  }

  getPnlSummary(): PnlSummary {
    return this.config.paperExecutor.getPnlSummary();
  }

  getPositions(): PaperPosition[] {
    return this.config.paperExecutor.getPositions();
  }
}
