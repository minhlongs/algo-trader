/**
 * Paper Position Tracker
 *
 * Barrel facade: re-exports types, position math, and P&L functions.
 * Owns the file-based persistence helpers (persistPaperState, loadPaperState).
 *
 * Phase 22 — Paper Trading Infrastructure
 */

import {
  appendJsonl,
  writeJsonState,
  readJsonState,
} from '../../shared/persistence/file-store';
import type { PaperAccount, PaperPosition, PaperTrade } from './paper-position-types';

export * from './paper-position-types';
export * from './paper-position-math';
export * from './paper-position-pnl';

// ─── Persistence ─────────────────────────────────────────────────────────────

export function persistPaperState(
  accountFile: string,
  positionsFile: string,
  tradesFile: string,
  account: PaperAccount,
  positions: PaperPosition[],
  tradeHistory: PaperTrade[],
): void {
  writeJsonState(accountFile, account);
  writeJsonState(positionsFile, positions);
  for (const trade of tradeHistory) {
    appendJsonl(tradesFile, trade);
  }
}

export function loadPaperState(
  accountFile: string,
  positionsFile: string,
  _tradesFile: string,
): { account: PaperAccount | undefined; positions: PaperPosition[]; trades: PaperTrade[] } {
  const account = readJsonState<PaperAccount>(accountFile);
  const positions = readJsonState<PaperPosition[]>(positionsFile) ?? [];
  const trades: PaperTrade[] = [];
  return { account, positions, trades };
}
