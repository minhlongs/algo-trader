/**
 * Paper Trading Executor
 *
 * Simulates trade execution without real money.
 * Tracks P&L, positions, and trade history in memory.
 * Uses file-based persistence (file-store) for recovery across restarts.
 *
 * Phase 22 — Paper Trading Infrastructure
 */

import { logger } from '../../shared/utils/logger';
import { readJsonl, readJsonState, cashclawPath } from '../../shared/persistence/file-store';
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
import {
  executeBuy,
  executeSell,
} from './paper-execution-helpers';

// Re-export types for consumers
export type {
  PaperTrade,
  PaperPosition,
  PaperAccount,
  ExecutionResult,
  PaperExecutorConfig,
  TradeSignal,
} from './paper-position-tracker';

// ─── Executor ────────────────────────────────────────────────────────────────

export class PaperExecutor {
  private config: PaperExecutorConfig;
  private account: PaperAccount;
  private positions: PaperPosition[] = [];
  private tradeHistory: PaperTrade[] = [];
  private running: boolean = false;

  // File paths for persistence
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

  /** Start paper trading session — loads persisted state if available */
  async start(initialBalance?: number, forceReset = false): Promise<PaperAccount> {
    this.running = true;
    if (forceReset) {
      this.account = createDefaultAccount(this.config, initialBalance);
      this.positions = [];
      this.tradeHistory = [];
      this._persist();
      return this.account;
    }
    const persisted = readJsonState<PaperAccount>(this.ACCOUNT_FILE);
    if (persisted) {
      this.account = persisted;
      this.positions = readJsonState<PaperPosition[]>(this.POSITIONS_FILE) ?? [];
      this.tradeHistory = await readJsonl<PaperTrade>(this.TRADES_FILE);
      logger.info('[PaperExecutor] Restored persisted state', {
        balance: this.account.balance,
        trades: this.tradeHistory.length,
        positions: this.positions.length,
      });
    } else {
      this.account = createDefaultAccount(this.config, initialBalance);
      this.positions = [];
      this.tradeHistory = [];
      this._persist();
      logger.info('[PaperExecutor] Started fresh session', {
        balance: this.account.balance,
      });
    }
    return this.account;
  }

  /** Stop paper trading session */
  async stop(): Promise<void> {
    this.running = false;
    this._persist();
    logger.info('[PaperExecutor] Stopped');
  }

  /** Reset account to initial balance */
  async reset(initialBalance?: number): Promise<PaperAccount> {
    this.account = createDefaultAccount(this.config, initialBalance);
    this.positions = [];
    this.tradeHistory = [];
    this._persist();
    logger.info('[PaperExecutor] Account reset', { balance: this.account.balance });
    return this.account;
  }

  /** Execute a paper trade from a signal */
  async executePaperTrade(
    signal: TradeSignal,
    marketPrice: number,
  ): Promise<ExecutionResult> {
    if (!this.running) {
      return { success: false, message: 'Paper trading not started. Call start() first.' };
    }

    const price = signal.price ?? marketPrice;

    if (signal.side === 'buy') {
      return this._executeBuy(signal.symbol, signal.quantity, price);
    }
    return this._executeSell(signal.symbol, signal.quantity, price);
  }

  /** Get current open positions */
  getPositions(): PaperPosition[] {
    return [...this.positions];
  }

  /** Get trade history (all closed trades) */
  getTradeHistory(limit?: number): PaperTrade[] {
    if (limit) {
      return this.tradeHistory.slice(-limit);
    }
    return [...this.tradeHistory];
  }

  /** Get P&L summary */
  getPnlSummary() {
    return computePnlSummary(this.account, this.tradeHistory, this.config.initialBalance);
  }

  /** Update mark-to-market prices for all positions */
  updatePrices(prices: Map<string, number>): PaperPosition[] {
    this.positions = updatePositionsPrices(this.positions, prices);
    this.account.unrealizedPnl = this.positions.reduce((s, p) => s + p.unrealizedPnl, 0);
    this.account.equity = this.account.balance + this.account.unrealizedPnl;
    this._persist();
    return this.getPositions();
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private async _executeBuy(
    symbol: string,
    quantity: number,
    price: number,
  ): Promise<ExecutionResult> {
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

  private async _executeSell(
    symbol: string,
    quantity: number,
    price: number,
  ): Promise<ExecutionResult> {
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
    persistPaperState(
      this.ACCOUNT_FILE,
      this.POSITIONS_FILE,
      this.TRADES_FILE,
      this.account,
      this.positions,
      this.tradeHistory,
    );
    // Keep in-memory history trimmed
    if (this.tradeHistory.length > 1000) {
      this.tradeHistory = this.tradeHistory.slice(-1000);
    }
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let instance: PaperExecutor | null = null;

export function getPaperExecutor(config?: Partial<PaperExecutorConfig>): PaperExecutor {
  if (!instance) {
    instance = new PaperExecutor(config);
  }
  return instance;
}

export function resetPaperExecutor(): void {
  instance = null;
  // Clear persisted state so tests start fresh
  try { require('fs').unlinkSync(require('os').homedir() + '/.cashclaw/paper-account.json'); } catch {}
  try { require('fs').unlinkSync(require('os').homedir() + '/.cashclaw/paper-positions.json'); } catch {}
  try { require('fs').unlinkSync(require('os').homedir() + '/.cashclaw/paper-trades.jsonl'); } catch {}
}
