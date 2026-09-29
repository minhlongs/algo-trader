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
import type { AlphaLifecycleStateMachine } from '../../alpha-lab/attribution/alpha-lifecycle-state-machine';

export class AISignalPaperRouter {
  private readonly config: AISignalPaperRouterConfig;
  private readonly tracker: PaperEquityTracker;
  private readonly stateMachines = new Map<string, AlphaLifecycleStateMachine>();

  constructor(config: AISignalPaperRouterConfig) {
    this.config = {
      defaultSymbol: 'BTC/USDT',
      defaultWinLossRatio: 1.5,
      strictMaxCap: true,
      minPositionUsd: 1.0,
      ...config,
    };
    this.tracker = new PaperEquityTracker(this.config.paperExecutor);

    if (config.stateMachines) {
      for (const [id, sm] of config.stateMachines.entries()) {
        this.stateMachines.set(id, sm);
      }
    }
    if (config.stateMachine) {
      this.stateMachines.set(config.stateMachine.getStrategyId(), config.stateMachine);
    }
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

  registerStateMachine(strategyId: string, stateMachine: AlphaLifecycleStateMachine): void {
    this.stateMachines.set(strategyId, stateMachine);
  }

  getStateMachine(strategyId?: string): AlphaLifecycleStateMachine | undefined {
    if (!strategyId) return this.config.stateMachine;
    return this.stateMachines.get(strategyId) ?? this.config.stateMachine;
  }

  async routeSignal(
    signal: AISignal,
    marketPrice: number,
    stateMachineOverride?: AlphaLifecycleStateMachine,
  ): Promise<SignalRoutingOutcome> {
    const sm = stateMachineOverride ?? (signal.strategyId ? this.stateMachines.get(signal.strategyId) : undefined);
    return dispatchSignalOrder(signal, marketPrice, this.config, this.tracker, sm);
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
