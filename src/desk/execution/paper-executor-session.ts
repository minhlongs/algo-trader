/**
 * Paper Executor Session Lifecycle — disk loading, fresh initialization, resets
 */

import { logger } from '../../shared/utils/logger';
import { readJsonl, readJsonState } from '../../shared/persistence/file-store';
import {
  type PaperTrade,
  type PaperPosition,
  type PaperAccount,
  type PaperExecutorConfig,
  createDefaultAccount,
} from './paper-position-tracker';

export interface PaperSessionState {
  account: PaperAccount;
  positions: PaperPosition[];
  tradeHistory: PaperTrade[];
}

export async function initPaperSession(
  accountFile: string,
  positionsFile: string,
  tradesFile: string,
  config: PaperExecutorConfig,
  initialBalance?: number,
  forceReset = false
): Promise<PaperSessionState> {
  if (forceReset) {
    const account = createDefaultAccount(config, initialBalance);
    return { account, positions: [], tradeHistory: [] };
  }

  const persisted = readJsonState<PaperAccount>(accountFile);
  if (persisted) {
    const account = persisted;
    const positions = readJsonState<PaperPosition[]>(positionsFile) ?? [];
    const tradeHistory = await readJsonl<PaperTrade>(tradesFile);
    logger.info('[PaperExecutor] Restored persisted state', {
      balance: account.balance,
      trades: tradeHistory.length,
      positions: positions.length,
    });
    return { account, positions, tradeHistory };
  }

  const account = createDefaultAccount(config, initialBalance);
  logger.info('[PaperExecutor] Started fresh session', {
    balance: account.balance,
  });
  return { account, positions: [], tradeHistory: [] };
}
