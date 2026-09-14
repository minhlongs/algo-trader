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
export interface WalletPersistedState {
  wallets: Wallet[];
  tradeHistory: Record<string, WalletTrade[]>;
}
