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
  type OrderbookSnapshot,
  type PnlSummary,
  createDefaultAccount,
  updatePositionsPrices,
  computePnlSummary,
} from './paper-position-tracker';
import { dispatchPaperBuy, dispatchPaperSell } from './paper-order-dispatcher';
import { initPaperSession, savePaperSession } from './paper-executor-session';
import { getPaperExecutorSingleton } from './paper-executor-singleton';
import {
  calculateAccountEquity,
  validateTradeSignal,
  applyDispatchResult,
} from './paper-equity-tracker';

export type {
  PaperTrade,
  PaperPosition,
  PaperAccount,
  ExecutionResult,
  PaperExecutorConfig,
  TradeSignal,
  OrderbookSnapshot,
  PnlSummary,
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
      this.ACCOUNT_FILE,
      this.POSITIONS_FILE,
      this.TRADES_FILE,
      this.config,
      initialBalance,
      forceReset,
    );
    this.account = session.account;
    this.positions = session.positions;
    this.tradeHistory = session.tradeHistory;
    this._updateAccountEquity();
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

  async executePaperTrade(
    signal: TradeSignal,
    marketPrice: number,
    orderbook?: OrderbookSnapshot,
  ): Promise<ExecutionResult> {
    const val = validateTradeSignal(signal, marketPrice, this.running);
    if (!val.valid) return { success: false, message: val.message };
    return signal.side === 'buy'
      ? this._executeBuy(signal.symbol, signal.quantity, val.price, orderbook)
      : this._executeSell(signal.symbol, signal.quantity, val.price, orderbook);
  }

  getPositions(): PaperPosition[] {
    return [...this.positions];
  }

  getTradeHistory(limit?: number): PaperTrade[] {
    return limit ? this.tradeHistory.slice(-limit) : [...this.tradeHistory];
  }

  getPnlSummary(): PnlSummary {
    const summary = computePnlSummary(this.account, this.tradeHistory, this.config.initialBalance);
    return {
      ...summary,
      cashReserves: this.account.cashReserves ?? this.account.balance,
      marginUsed: this.account.marginUsed ?? 0,
    };
  }

  updatePrices(prices: Map<string, number>): PaperPosition[] {
    this.positions = updatePositionsPrices(this.positions, prices);
    this._updateAccountEquity();
    this._persist();
    return this.getPositions();
  }

  private _updateAccountEquity(): void {
    calculateAccountEquity(this.account, this.positions);
  }

  private async _executeBuy(
    symbol: string,
    quantity: number,
    price: number,
    orderbook?: OrderbookSnapshot,
  ): Promise<ExecutionResult> {
    const dispatch = dispatchPaperBuy(symbol, quantity, price, this.account, this.positions, this.config, orderbook);
    if (!dispatch.result.success) return dispatch.result;

    const newPos = applyDispatchResult(dispatch, this.tradeHistory);
    if (newPos) this.positions = newPos;
    this._updateAccountEquity();
    this._persist();
    return dispatch.result;
  }

  private async _executeSell(
    symbol: string,
    quantity: number,
    price: number,
    orderbook?: OrderbookSnapshot,
  ): Promise<ExecutionResult> {
    const dispatch = dispatchPaperSell(symbol, quantity, price, this.account, this.positions, this.config, orderbook);
    if (!dispatch.result.success) return dispatch.result;

    const newPos = applyDispatchResult(dispatch, this.tradeHistory);
    if (newPos) this.positions = newPos;
    this._updateAccountEquity();
    this._persist();
    return dispatch.result;
  }

  private _persist(): void {
    this.tradeHistory = savePaperSession(
      this.ACCOUNT_FILE,
      this.POSITIONS_FILE,
      this.TRADES_FILE,
      this.account,
      this.positions,
      this.tradeHistory,
    );
  }
}

export function getPaperExecutor(config?: Partial<PaperExecutorConfig>): PaperExecutor {
  return getPaperExecutorSingleton(config, (cfg) => new PaperExecutor(cfg));
}
