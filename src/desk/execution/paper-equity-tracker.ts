/**
 * Paper Account Equity, Validation, and State Update Helpers
 *
 * @module desk/execution/paper-equity-tracker
 */

import type {
  PaperAccount,
  PaperPosition,
  PaperTrade,
  TradeSignal,
  ExecutionResult,
} from './paper-position-tracker';

export function calculateAccountEquity(
  account: PaperAccount,
  positions: PaperPosition[],
): void {
  account.unrealizedPnl = positions.reduce((s, p) => s + p.unrealizedPnl, 0);
  const positionValue = positions.reduce((s, p) => s + p.quantity * p.currentPrice, 0);
  account.equity = account.balance + positionValue;
  account.cashReserves = account.balance;
  account.marginUsed = positionValue;
  account.marginUtilization = account.equity > 0 ? positionValue / account.equity : 0;
}

export function validateTradeSignal(
  signal: TradeSignal,
  marketPrice: number,
  running: boolean,
): { valid: false; message: string } | { valid: true; price: number } {
  if (!running) {
    return { valid: false, message: 'Paper trading not started. Call start() first.' };
  }
  const price = signal.price ?? marketPrice;
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
    return { valid: false, message: `Invalid execution price: ${price}` };
  }
  if (typeof signal.quantity !== 'number' || !Number.isFinite(signal.quantity) || signal.quantity <= 0) {
    return { valid: false, message: `Invalid trade quantity: ${signal.quantity}` };
  }
  return { valid: true, price };
}

export function applyDispatchResult(
  dispatch: { result: ExecutionResult; trade?: PaperTrade; newPositions?: PaperPosition[] },
  tradeHistory: PaperTrade[],
): PaperPosition[] | undefined {
  if (dispatch.trade) {
    tradeHistory.push(dispatch.trade);
  }
  return dispatch.newPositions;
}
