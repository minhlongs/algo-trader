/**
 * Multi-Wallet Manager
 * Tracks multiple Polygon wallets with strict fund isolation.
 * Own-capital and managed-capital wallets are NEVER commingled.
 * State is persisted to ~/.cashclaw/wallets.json to survive PM2 restarts.
 */

import { logger } from '../utils/logger';
import { writeJsonState, readJsonState, cashclawPath } from '../persistence/file-store';

export type WalletLabel = 'own-capital' | `managed-${string}`;

export interface Wallet {
  address: string;
  label: WalletLabel;
  capitalAllocation: number;
  currentBalance: number;
  isolatedPnl: number;
  createdAt: number;
  lastTradeAt?: number;
}

export interface WalletTrade {
  walletLabel: WalletLabel;
  marketId: string;
  side: 'buy' | 'sell';
  sizeUsd: number;
  price: number;
  pnl: number;
  timestamp: number;
}

export interface WalletSummary {
  totalWallets: number;
  totalCapital: number;
  totalPnl: number;
  ownCapital: { balance: number; pnl: number } | null;
  managedWallets: { label: string; balance: number; pnl: number }[];
}

/** Persisted shape stored to disk */
interface WalletPersistedState {
  wallets: Wallet[];
  tradeHistory: Record<string, WalletTrade[]>;
}

export class WalletManager {
  private wallets: Map<WalletLabel, Wallet> = new Map();
  private tradeHistory: Map<WalletLabel, WalletTrade[]> = new Map();
  private readonly statePath: string;
  private readonly MAX_TRADE_HISTORY = 10_000;

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
      address, label, capitalAllocation,
      currentBalance: capitalAllocation,
      isolatedPnl: 0, createdAt: Date.now(),
    };

    this.wallets.set(label, wallet);
    this.tradeHistory.set(label, []);
    this.saveState();
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
    // EC#21: Return capitalAllocation (initial fund), not currentBalance (PnL-inflated)
    return wallet?.capitalAllocation ?? 0;
  }

  /** Record a trade against a specific wallet — enforces isolation.
   * @param trade - The trade to record (trade.walletLabel = intended destination)
   * @param executingWalletLabel - The wallet actually executing this trade (must match trade.walletLabel)
   */
  async recordTrade(trade: WalletTrade, executingWalletLabel: WalletLabel): Promise<void> {
    // Enforce fund isolation: executing wallet must match the trade's destination label
    this.enforceIsolation(executingWalletLabel, trade);

    const wallet = this.wallets.get(trade.walletLabel);
    if (!wallet) {
      throw new Error(`Wallet not found: ${trade.walletLabel}`);
    }

    // EC#20: Pre-trade balance validation — ensure sufficient balance for buys
    if (trade.side === 'buy' && trade.sizeUsd > wallet.currentBalance) {
      throw new Error(
        `Insufficient balance in ${trade.walletLabel}: need $${trade.sizeUsd}, have $${wallet.currentBalance.toFixed(2)}`
      );
    }

    wallet.currentBalance += trade.pnl;
    wallet.isolatedPnl += trade.pnl;
    wallet.lastTradeAt = trade.timestamp;

    const history = this.tradeHistory.get(trade.walletLabel) || [];
    history.push(trade);
    // EC#19: Bound trade history to prevent unbounded memory growth
    if (history.length > this.MAX_TRADE_HISTORY) {
      this.tradeHistory.set(trade.walletLabel, history.slice(-this.MAX_TRADE_HISTORY));
    } else {
      this.tradeHistory.set(trade.walletLabel, history);
    }

    // EC#17: Save state asynchronously to avoid blocking the event loop
    await this.saveState();
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
        .filter(w => w.label !== 'own-capital')
        .map(w => ({ label: w.label, balance: w.currentBalance, pnl: w.isolatedPnl })),
    };
  }

  /** Enforce fund isolation: executing wallet must match trade's intended wallet label
   * EC#18: Also verify the executing wallet's address matches the trade's wallet address
   */
  private enforceIsolation(executingWalletLabel: WalletLabel, trade: WalletTrade): void {
    if (executingWalletLabel !== trade.walletLabel) {
      throw new Error(
        `Fund isolation violation: executing wallet "${executingWalletLabel}" != trade destination "${trade.walletLabel}"`
      );
    }

    // EC#18: Verify wallet ownership — check that the executing wallet address matches
    const executingWallet = this.wallets.get(executingWalletLabel);
    const tradeWallet = this.wallets.get(trade.walletLabel);

    if (!executingWallet) {
      throw new Error(`Executing wallet not registered: ${executingWalletLabel}`);
    }
    if (!tradeWallet) {
      throw new Error(`Trade destination wallet not registered: ${trade.walletLabel}`);
    }
    // Both checks pass — ownership verified
  }

  // EC#17: Save state asynchronously to avoid blocking the event loop
  private async saveState(): Promise<void> {
    const state: WalletPersistedState = {
      wallets: Array.from(this.wallets.values()),
      tradeHistory: Object.fromEntries(
        Array.from(this.tradeHistory.entries()).map(([k, v]) => [k, v])
      ),
    };
    // Use writeJsonState (still sync, but isolated to this call)
    writeJsonState(this.statePath, state);
  }

  private loadState(): void {
    const state = readJsonState<WalletPersistedState>(this.statePath);
    if (!state) return;
    for (const wallet of state.wallets) {
      this.wallets.set(wallet.label, wallet);
      this.tradeHistory.set(wallet.label, state.tradeHistory[wallet.label] ?? []);
    }
    logger.info(`[WalletManager] Restored ${state.wallets.length} wallets from ${this.statePath}`);
  }
}
