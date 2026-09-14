import { logger } from '../utils/logger';
import { writeJsonState, readJsonState } from '../persistence/file-store';
import type { Wallet, WalletLabel, WalletTrade, WalletPersistedState } from './wallet-types';

export function loadWalletState(
  statePath: string,
  wallets: Map<WalletLabel, Wallet>,
  tradeHistory: Map<WalletLabel, WalletTrade[]>,
): void {
  const state = readJsonState<WalletPersistedState>(statePath);
  if (!state) return;
  for (const wallet of state.wallets) {
    wallets.set(wallet.label, wallet);
    tradeHistory.set(wallet.label, state.tradeHistory[wallet.label] ?? []);
  }
  logger.info(`[WalletManager] Restored ${state.wallets.length} wallets from ${statePath}`);
}

export async function saveWalletState(
  statePath: string,
  wallets: Map<WalletLabel, Wallet>,
  tradeHistory: Map<WalletLabel, WalletTrade[]>,
): Promise<void> {
  const state: WalletPersistedState = {
    wallets: Array.from(wallets.values()),
    tradeHistory: Object.fromEntries(
      Array.from(tradeHistory.entries()).map(([k, v]) => [k, v]),
    ),
  };
  writeJsonState(statePath, state);
}
