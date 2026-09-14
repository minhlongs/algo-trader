import type { Wallet, WalletLabel, WalletTrade } from './wallet-types';

/**
 * Enforce fund isolation: executing wallet must match trade's intended wallet label
 * EC#18: Also verify the executing wallet's address matches the trade's wallet address
 */
export function enforceWalletIsolation(
  executingWalletLabel: WalletLabel,
  trade: WalletTrade,
  wallets: Map<WalletLabel, Wallet>,
): void {
  if (executingWalletLabel !== trade.walletLabel) {
    throw new Error(
      `Fund isolation violation: executing wallet "${executingWalletLabel}" != trade destination "${trade.walletLabel}"`,
    );
  }

  // EC#18: Verify wallet ownership — check that the executing wallet address matches
  const executingWallet = wallets.get(executingWalletLabel);
  const tradeWallet = wallets.get(trade.walletLabel);

  if (!executingWallet) {
    throw new Error(`Executing wallet not registered: ${executingWalletLabel}`);
  }
  if (!tradeWallet) {
    throw new Error(`Trade destination wallet not registered: ${trade.walletLabel}`);
  }
}
