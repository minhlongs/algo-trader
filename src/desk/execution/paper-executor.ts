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
import {
  appendJsonl,
  readJsonl,
  writeJsonState,
  readJsonState,
  cashclawPath,
} from '../../persistence/file-store';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PaperTrade {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  requestedPrice: number;
  executedPrice: number;
  fee: number;
  slippage: number;
  status: 'filled' | 'rejected' | 'pending';
  timestamp: number;
  pnl?: number;
}

export interface PaperPosition {
  symbol: string;
  side: 'long' | 'short';
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  openedAt: number;
}

export interface PaperAccount {
  balance: number;
  equity: number;
  unrealizedPnl: number;
  realizedPnl: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
}

export interface ExecutionResult {
  success: boolean;
  trade?: PaperTrade;
  message?: string;
  account?: PaperAccount;
}

export interface PaperExecutorConfig {
  initialBalance: number;
  slippagePercent: number;
  feePercent: number;
  simulateFillRate: number; // 0-1 probability of fill
}

export interface TradeSignal {
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price?: number;
}

// ─── Executor ────────────────────────────────────────────────────────────────

export class PaperExecutor {
  private config: PaperExecutorConfig;
  private account: PaperAccount;
  private positions: PaperPosition[] = [];
  private tradeHistory: PaperTrade[] = [];
  private running: boolean = false;
  private _persistedTradeCount: number = 0;

  // File paths for persistence
  private readonly ACCOUNT_FILE = cashclawPath('paper-account.json');
  private readonly POSITIONS_FILE = cashclawPath('paper-positions.json');
  private readonly TRADES_FILE = cashclawPath('paper-trades.jsonl');

  constructor(config?: Partial<PaperExecutorConfig>) {
    this.config = {
      initialBalance: 10_000,
      slippagePercent: 0.001, // 0.1%
      feePercent: 0.001, // 0.1%
      simulateFillRate: 0.95, // 95%
      ...config,
    };
    this.account = this._defaultAccount();
  }

  /** Start paper trading session — loads persisted state if available */
  async start(initialBalance?: number, forceReset = false): Promise<PaperAccount> {
    this.running = true;
  if (forceReset) {
    this.account = this._defaultAccount(initialBalance);
    this.positions = [];
    this.tradeHistory = [];
    this._persistedTradeCount = 0;
    this._persist();
    return this.account;
  }
    const persisted = readJsonState<PaperAccount>(this.ACCOUNT_FILE);
    if (persisted) {
      this.account = persisted;
      this.positions = readJsonState<PaperPosition[]>(this.POSITIONS_FILE) ?? [];
      this.tradeHistory = readJsonl<PaperTrade>(this.TRADES_FILE);
      logger.info('[PaperExecutor] Restored persisted state', {
        balance: this.account.balance,
        trades: this.tradeHistory.length,
        positions: this.positions.length,
      });
    } else {
      this.account = this._defaultAccount(initialBalance);
      this.positions = [];
      this.tradeHistory = [];
  this._persistedTradeCount = 0;
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
    this.account = this._defaultAccount(initialBalance);
    this.positions = [];
    this.tradeHistory = [];
  this._persistedTradeCount = 0;
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
  getPnlSummary(): {
    totalPnl: number;
    winRate: number;
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    profitFactor: number;
    sharpeRatio: number;
    maxDrawdown: number;
    balance: number;
    equity: number;
  } {
    const wins = this.tradeHistory.filter((t) => (t.pnl ?? 0) > 0);
    const losses = this.tradeHistory.filter((t) => (t.pnl ?? 0) < 0);
    const totalWins = wins.reduce((s, t) => s + (t.pnl ?? 0), 0);
    const totalLosses = Math.abs(losses.reduce((s, t) => s + (t.pnl ?? 0), 0));
    const totalPnl = this.account.realizedPnl + this.account.unrealizedPnl;
    const winRate =
      this.account.totalTrades > 0
        ? (this.account.winningTrades / this.account.totalTrades) * 100
        : 0;
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;
    const sharpe = this._calcSharpe();
    const maxDrawdown = this._calcMaxDrawdown();

    return {
      totalPnl,
      winRate,
      totalTrades: this.account.totalTrades,
      winningTrades: this.account.winningTrades,
      losingTrades: this.account.losingTrades,
      profitFactor,
      sharpeRatio: sharpe,
      maxDrawdown: maxDrawdown,
      balance: this.account.balance,
      equity: this.account.equity,
    };
  }

  /** Update mark-to-market prices for all positions */
  updatePrices(prices: Map<string, number>): PaperPosition[] {
    for (const pos of this.positions) {
      if (prices.has(pos.symbol)) {
        pos.currentPrice = prices.get(pos.symbol)!;
        pos.unrealizedPnl = (pos.currentPrice - pos.entryPrice) * pos.quantity;
      }
    }
    this.account.unrealizedPnl = this.positions.reduce((s, p) => s + p.unrealizedPnl, 0);
    this.account.equity = this.account.balance + this.account.unrealizedPnl;
    this._persist();
    return this.getPositions();
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private _defaultAccount(initialBalance?: number): PaperAccount {
    return {
      balance: initialBalance ?? this.config.initialBalance,
      equity: initialBalance ?? this.config.initialBalance,
      unrealizedPnl: 0,
      realizedPnl: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
    };
  }

  private async _executeBuy(
    symbol: string,
    quantity: number,
    price: number,
  ): Promise<ExecutionResult> {
    const cost = quantity * price;
    if (cost > this.account.balance) {
      return {
        success: false,
        message: `Insufficient balance: need $${cost.toFixed(2)}, have $${this.account.balance.toFixed(2)}`,
      };
    }
    // Simulate fill probability
    if (Math.random() > this.config.simulateFillRate) {
      return { success: false, message: 'Order not filled (simulated market conditions)' };
    }

    const slippage = price * this.config.slippagePercent;
    const executedPrice = price + slippage; // buy at slightly higher
    const fee = quantity * executedPrice * this.config.feePercent;
    const totalCost = quantity * executedPrice + fee;

    const trade: PaperTrade = {
      id: `paper-buy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      symbol,
      side: 'buy',
      quantity,
      requestedPrice: price,
      executedPrice,
      fee,
      slippage,
      status: 'filled',
      timestamp: Date.now(),
    };

    this.account.balance -= totalCost;
    this._upsertPosition(symbol, 'long', quantity, executedPrice, executedPrice);
    this.tradeHistory.push(trade);
    this._persist();

    logger.info(`[PaperExecutor] BUY ${quantity} ${symbol} @ $${executedPrice.toFixed(2)}`);
    return { success: true, trade, account: this._snapshot() };
  }

  private async _executeSell(
    symbol: string,
    quantity: number,
    price: number,
  ): Promise<ExecutionResult> {
    const position = this.positions.find((p) => p.symbol === symbol);
    if (!position || position.quantity < quantity) {
      return {
        success: false,
        message: `Insufficient position: have ${position?.quantity ?? 0} ${symbol}`,
      };
    }
    if (Math.random() > this.config.simulateFillRate) {
      return { success: false, message: 'Order not filled (simulated market conditions)' };
    }

    const slippage = price * this.config.slippagePercent;
    const executedPrice = price - slippage; // sell at slightly lower
    const fee = quantity * executedPrice * this.config.feePercent;
    const revenue = quantity * executedPrice - fee;
    const pnl = (executedPrice - position.entryPrice) * quantity - fee;

    const trade: PaperTrade = {
      id: `paper-sell-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      symbol,
      side: 'sell',
      quantity,
      requestedPrice: price,
      executedPrice,
      fee,
      slippage,
      status: 'filled',
      timestamp: Date.now(),
      pnl,
    };

    this.account.balance += revenue;
    this.account.realizedPnl += pnl;
    this.account.totalTrades++;
    if (pnl > 0) this.account.winningTrades++;
    else this.account.losingTrades++;

    this._reducePosition(symbol, quantity, executedPrice);
    this.tradeHistory.push(trade);
    this._persist();

    logger.info(`[PaperExecutor] SELL ${quantity} ${symbol} @ $${executedPrice.toFixed(2)} | P&L: $${pnl.toFixed(2)}`);
    return { success: true, trade, account: this._snapshot() };
  }

  private _upsertPosition(
    symbol: string,
    side: 'long' | 'short',
    quantity: number,
    entryPrice: number,
    currentPrice: number,
  ): void {
    const existing = this.positions.find((p) => p.symbol === symbol && p.side === side);
    if (existing) {
      const totalQty = existing.quantity + quantity;
      existing.entryPrice =
        (existing.quantity * existing.entryPrice + quantity * entryPrice) / totalQty;
      existing.quantity = totalQty;
      existing.currentPrice = currentPrice;
      existing.unrealizedPnl = (currentPrice - existing.entryPrice) * totalQty;
    } else {
      this.positions.push({
        symbol,
        side,
        quantity,
        entryPrice,
        currentPrice,
        unrealizedPnl: (currentPrice - entryPrice) * quantity,
        openedAt: Date.now(),
      });
    }
  }

  private _reducePosition(symbol: string, quantity: number, currentPrice: number): void {
    const pos = this.positions.find((p) => p.symbol === symbol);
    if (!pos) return;
    pos.quantity -= quantity;
    pos.currentPrice = currentPrice;
    pos.unrealizedPnl = (currentPrice - pos.entryPrice) * pos.quantity;
    if (pos.quantity <= 0.0001) {
      this.positions = this.positions.filter((p) => p.symbol !== symbol);
    }
  }

  private _snapshot(): PaperAccount {
    return { ...this.account };
  }

  private _persist(): void {
    writeJsonState(this.ACCOUNT_FILE, this.account);
    writeJsonState(this.POSITIONS_FILE, this.positions);
    // Append new trades to JSONL (avoid rewriting full file each time)
    for (const trade of this.tradeHistory) {
      appendJsonl(this.TRADES_FILE, trade);
    }
    // Keep in-memory history trimmed
    if (this.tradeHistory.length > 1000) {
      this.tradeHistory = this.tradeHistory.slice(-1000);
    }
  }

  private _calcSharpe(): number {
    const daily = new Map<string, number>();
    for (const t of this.tradeHistory) {
      const day = new Date(t.timestamp).toISOString().split('T')[0]!;
      daily.set(day, (daily.get(day) ?? 0) + (t.pnl ?? 0));
    }
    const vals = Array.from(daily.values());
    if (vals.length < 2) return 0;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const std = Math.sqrt(vals.map((v) => (v - avg) ** 2).reduce((a, b) => a + b, 0) / vals.length);
    if (std === 0) return 0;
    return (avg / std) * Math.sqrt(252);
  }

  private _calcMaxDrawdown(): number {
    let peak = this.config.initialBalance;
    let maxDd = 0;
    let equity = this.config.initialBalance;
    for (const t of this.tradeHistory) {
      equity += t.pnl ?? 0;
      if (equity > peak) peak = equity;
      const dd = (peak - equity) / peak;
      if (dd > maxDd) maxDd = dd;
    }
    return maxDd;
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
