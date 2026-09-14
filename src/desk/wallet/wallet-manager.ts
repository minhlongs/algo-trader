/**
 * Multi-Wallet Manager
 * Tracks multiple Polygon wallets with strict fund isolation.
 * Own-capital and managed-capital wallets are NEVER commingled.
 * State is persisted to ~/.cashclaw/wallets.json to survive PM2 restarts.
 */

import { logger } from '../utils/logger';
import { cashclawPath } from '../persistence/file-store';
import type { WalletLabel, Wallet, WalletTrade, WalletSummary } from './wallet-types';
import { loadWalletState, saveWalletState } from './wallet-persistence';
import { enforceWalletIsolation } from './wallet-isolation';

export * from './wallet-types';

export class WalletManager {
  private wallets: Map<WalletLabel, Wallet> = new Map();
  private tradeHistory: Map<WalletLabel, WalletTrade[]> = new Map();
  private readonly statePath: string;
  private readonly MAX_TRADE_HISTORY = 10_000;
  public writePromise: Promise<void> = Promise.resolve();

  constructor(statePath?: string) {
    this.statePath = statePath ?? cashclawPath('wallets.json');
    this.loadState();
  }

  /** Register a wallet */
  registerWallet(address: string, label: WalletLabel, capitalAllocation: number): Wallet {
    if (this.wallets.has(label)) {
      throw new Error(`Wallet already registered: ${label}`);
    }

    const wallet: Wallet = {
      address,
      label,
      capitalAllocation,
      currentBalance: capitalAllocation,
      isolatedPnl: 0,
      createdAt: Date.now(),
    };

    this.wallets.set(label, wallet);
    this.tradeHistory.set(label, []);
    this.writePromise = this.saveState();
    logger.info(`[WalletManager] Registered ${label} (${address}) with $${capitalAllocation}`);
    return wallet;
  }

  /** Get a wallet by label */
  getWallet(label: WalletLabel): Wallet | undefined {
    return this.wallets.get(label);
  }

  /** Get allocated capital for a wallet (for Kelly sizing) */
  getAllocatedCapital(label: WalletLabel): number {
    const wallet = this.wallets.get(label);
    return wallet?.capitalAllocation ?? 0;
  }

  /** Record a trade against a specific wallet — enforces isolation. */
  async recordTrade(trade: WalletTrade, executingWalletLabel: WalletLabel): Promise<void> {
    this.enforceIsolation(executingWalletLabel, trade);

    const wallet = this.wallets.get(trade.walletLabel);
    if (!wallet) {
      throw new Error(`Wallet not found: ${trade.walletLabel}`);
    }

    if (trade.side === 'buy' && trade.sizeUsd > wallet.currentBalance) {
      throw new Error(
        `Insufficient balance in ${trade.walletLabel}: need $${trade.sizeUsd}, have $${wallet.currentBalance.toFixed(2)}`,
      );
    }

    wallet.currentBalance += trade.pnl;
    wallet.isolatedPnl += trade.pnl;
    wallet.lastTradeAt = trade.timestamp;

    const history = this.tradeHistory.get(trade.walletLabel) || [];
    history.push(trade);
    if (history.length > this.MAX_TRADE_HISTORY) {
      this.tradeHistory.set(trade.walletLabel, history.slice(-this.MAX_TRADE_HISTORY));
    } else {
      this.tradeHistory.set(trade.walletLabel, history);
    }

    this.writePromise = this.saveState();
    await this.writePromise;
    logger.info(`[WalletManager] Trade on ${trade.walletLabel}: ${trade.side} $${trade.sizeUsd} → PnL $${trade.pnl.toFixed(2)}`);
  }

  /** Validate a trade is going to the correct wallet type */
  validateTradeWallet(walletLabel: WalletLabel, isOwnCapitalTrade: boolean): boolean {
    if (isOwnCapitalTrade && walletLabel !== 'own-capital') return false;
    if (!isOwnCapitalTrade && walletLabel === 'own-capital') return false;
    return this.wallets.has(walletLabel);
  }

  /** Get trade history for a wallet */
  getTradeHistory(label: WalletLabel): WalletTrade[] {
    return [...(this.tradeHistory.get(label) || [])];
  }

  /** Get all registered wallets */
  getAllWallets(): Wallet[] {
    return Array.from(this.wallets.values());
  }

  /** Get summary across all wallets */
  getSummary(): WalletSummary {
    const wallets = this.getAllWallets();
    const ownWallet = this.wallets.get('own-capital');

    return {
      totalWallets: wallets.length,
      totalCapital: wallets.reduce((sum, w) => sum + w.currentBalance, 0),
      totalPnl: wallets.reduce((sum, w) => sum + w.isolatedPnl, 0),
      ownCapital: ownWallet ? { balance: ownWallet.currentBalance, pnl: ownWallet.isolatedPnl } : null,
      managedWallets: wallets
        .filter((w) => w.label !== 'own-capital')
        .map((w) => ({ label: w.label, balance: w.currentBalance, pnl: w.isolatedPnl })),
    };
  }

  private enforceIsolation(executingWalletLabel: WalletLabel, trade: WalletTrade): void {
    enforceWalletIsolation(executingWalletLabel, trade, this.wallets);
  }

  private async saveState(): Promise<void> {
    return saveWalletState(this.statePath, this.wallets, this.tradeHistory);
  }

  private loadState(): void {
    loadWalletState(this.statePath, this.wallets, this.tradeHistory);
  }
}
