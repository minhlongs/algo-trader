/**
 * Paper Trading Executor
 * Simulates trade execution without real money. Tracks P&L, positions, trade history.
 */

import { logger } from '../../shared/utils/logger';
import { cashclawPath } from '../../shared/persistence/file-store';
import {
  type PaperTrade,
  type PaperPosition,
  type PaperAccount,
  type ExecutionResult,
  type PaperExecutorConfig,
  type TradeSignal,
  createDefaultAccount,
  updatePositionsPrices,
  persistPaperState,
  computePnlSummary,
} from './paper-position-tracker';
import { executeBuy, executeSell } from './paper-execution-helpers';
import { initPaperSession } from './paper-executor-session';
import { getPaperExecutorSingleton, resetPaperExecutor } from './paper-executor-singleton';

export type {
  PaperTrade, PaperPosition, PaperAccount, ExecutionResult, PaperExecutorConfig, TradeSignal,
} from './paper-position-tracker';
export { resetPaperExecutor } from './paper-executor-singleton';

export class PaperExecutor {
  private config: PaperExecutorConfig;
  private account: PaperAccount;
  private positions: PaperPosition[] = [];
  private tradeHistory: PaperTrade[] = [];
  private running = false;

  private readonly ACCOUNT_FILE = cashclawPath('paper-account.json');
  private readonly POSITIONS_FILE = cashclawPath('paper-positions.json');
  private readonly TRADES_FILE = cashclawPath('paper-trades.jsonl');

  constructor(config?: Partial<PaperExecutorConfig>) {
    this.config = {
      initialBalance: 10_000,
      slippagePercent: 0.001,
      feePercent: 0.001,
      simulateFillRate: 0.95,
      ...config,
    };
    this.account = createDefaultAccount(this.config);
  }

  async start(initialBalance?: number, forceReset = false): Promise<PaperAccount> {
    this.running = true;
    const session = await initPaperSession(
      this.ACCOUNT_FILE, this.POSITIONS_FILE, this.TRADES_FILE,
      this.config, initialBalance, forceReset
    );
    this.account = session.account;
    this.positions = session.positions;
    this.tradeHistory = session.tradeHistory;
    this._persist();
    return this.account;
  }

  async stop(): Promise<void> {
    this.running = false;
    this._persist();
    logger.info('[PaperExecutor] Stopped');
  }

  async reset(initialBalance?: number): Promise<PaperAccount> {
    this.account = createDefaultAccount(this.config, initialBalance);
    this.positions = [];
    this.tradeHistory = [];
    this._persist();
    logger.info('[PaperExecutor] Account reset', { balance: this.account.balance });
    return this.account;
  }

  async executePaperTrade(signal: TradeSignal, marketPrice: number): Promise<ExecutionResult> {
    if (!this.running) {
      return { success: false, message: 'Paper trading not started. Call start() first.' };
    }
    const price = signal.price ?? marketPrice;
    return signal.side === 'buy'
      ? this._executeBuy(signal.symbol, signal.quantity, price)
      : this._executeSell(signal.symbol, signal.quantity, price);
  }

  getPositions(): PaperPosition[] {
    return [...this.positions];
  }

  getTradeHistory(limit?: number): PaperTrade[] {
    return limit ? this.tradeHistory.slice(-limit) : [...this.tradeHistory];
  }

  getPnlSummary() {
    return computePnlSummary(this.account, this.tradeHistory, this.config.initialBalance);
  }

  updatePrices(prices: Map<string, number>): PaperPosition[] {
    this.positions = updatePositionsPrices(this.positions, prices);
    this.account.unrealizedPnl = this.positions.reduce((s, p) => s + p.unrealizedPnl, 0);
    this.account.equity = this.account.balance + this.account.unrealizedPnl;
    this._persist();
    return this.getPositions();
  }

  private async _executeBuy(symbol: string, quantity: number, price: number): Promise<ExecutionResult> {
    const cost = quantity * price;
    if (cost > this.account.balance) {
      return { success: false, message: `Insufficient balance: need $${cost.toFixed(2)}, have $${this.account.balance.toFixed(2)}` };
    }
    if (Math.random() > this.config.simulateFillRate) {
      return { success: false, message: 'Order not filled (simulated market conditions)' };
    }
    const result = executeBuy(symbol, quantity, price, this.account, this.positions, this.config);
    this.account.balance = result.newBalance;
    this.positions = result.newPositions;
    this.tradeHistory.push(result.trade);
    this._persist();
    logger.info(`[PaperExecutor] BUY ${quantity} ${symbol} @ $${result.trade.executedPrice.toFixed(2)}`);
    return { success: true, trade: result.trade, account: { ...this.account } };
  }

  private async _executeSell(symbol: string, quantity: number, price: number): Promise<ExecutionResult> {
    const position = this.positions.find((p) => p.symbol === symbol);
    if (!position || position.quantity < quantity) {
      return { success: false, message: `Insufficient position: have ${position?.quantity ?? 0} ${symbol}` };
    }
    if (Math.random() > this.config.simulateFillRate) {
      return { success: false, message: 'Order not filled (simulated market conditions)' };
    }
    const result = executeSell(symbol, quantity, price, this.account, this.positions, this.config);
    this.account.balance = result.newBalance;
    this.account.realizedPnl += result.realizedPnlDelta;
    this.account.totalTrades += 1;
    this.account.winningTrades += result.winningTradesDelta;
    this.account.losingTrades += result.losingTradesDelta;
    this.positions = result.newPositions;
    this.tradeHistory.push(result.trade);
    this._persist();
    logger.info(`[PaperExecutor] SELL ${quantity} ${symbol} @ $${result.trade.executedPrice.toFixed(2)} | P&L: $${result.trade.pnl!.toFixed(2)}`);
    return { success: true, trade: result.trade, account: { ...this.account } };
  }

  private _persist(): void {
    persistPaperState(this.ACCOUNT_FILE, this.POSITIONS_FILE, this.TRADES_FILE, this.account, this.positions, this.tradeHistory);
    if (this.tradeHistory.length > 1000) this.tradeHistory = this.tradeHistory.slice(-1000);
  }
}

export function getPaperExecutor(config?: Partial<PaperExecutorConfig>): PaperExecutor {
  return getPaperExecutorSingleton(config, (cfg) => new PaperExecutor(cfg));
}
