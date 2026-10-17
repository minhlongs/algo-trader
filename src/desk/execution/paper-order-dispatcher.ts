/**
 * Paper Executor Order Dispatcher
 *
 * @module desk/execution/paper-order-dispatcher
 */

import { logger } from '../../shared/utils/logger';
import type {
  PaperTrade,
  PaperPosition,
  PaperAccount,
  ExecutionResult,
  PaperExecutorConfig,
  OrderbookSnapshot,
} from './paper-position-tracker';
import { executeBuy, executeSell } from './paper-execution-helpers';

export function dispatchPaperBuy(
  symbol: string,
  quantity: number,
  price: number,
  account: PaperAccount,
  positions: PaperPosition[],
  config: PaperExecutorConfig,
  orderbook?: OrderbookSnapshot,
): { result: ExecutionResult; trade?: PaperTrade; newPositions?: PaperPosition[] } {
  const cost = quantity * price;
  if (cost > account.balance) {
    return {
      result: {
        success: false,
        message: `Insufficient balance: need $${cost.toFixed(2)}, have $${account.balance.toFixed(2)}`,
      },
    };
  }
  if (Math.random() > config.simulateFillRate) {
    return {
      result: {
        success: false,
        message: 'Order not filled (simulated market conditions)',
      },
    };
  }
  const buyRes = executeBuy(symbol, quantity, price, account, positions, config, orderbook);
  if (buyRes.trade.status === 'rejected') {
    return {
      result: {
        success: false,
        trade: buyRes.trade,
        message: 'Order rejected: insufficient orderbook depth',
      },
    };
  }
  account.balance = buyRes.newBalance;
  logger.info(
    `[PaperExecutor] BUY ${buyRes.trade.quantity} ${symbol} @ $${buyRes.trade.executedPrice.toFixed(2)} (${buyRes.trade.status})`,
  );
  return {
    result: { success: true, trade: buyRes.trade, account: { ...account } },
    trade: buyRes.trade,
    newPositions: buyRes.newPositions,
  };
}

export function dispatchPaperSell(
  symbol: string,
  quantity: number,
  price: number,
  account: PaperAccount,
  positions: PaperPosition[],
  config: PaperExecutorConfig,
  orderbook?: OrderbookSnapshot,
): { result: ExecutionResult; trade?: PaperTrade; newPositions?: PaperPosition[] } {
  const position = positions.find((p) => p.symbol === symbol);
  if (!position || position.quantity < quantity) {
    return {
      result: {
        success: false,
        message: `Insufficient position: have ${position?.quantity ?? 0} ${symbol}`,
      },
    };
  }
  if (Math.random() > config.simulateFillRate) {
    return {
      result: {
        success: false,
        message: 'Order not filled (simulated market conditions)',
      },
    };
  }
  const sellRes = executeSell(symbol, quantity, price, account, positions, config, orderbook);
  if (sellRes.trade.status === 'rejected') {
    return {
      result: {
        success: false,
        trade: sellRes.trade,
        message: 'Order rejected: insufficient orderbook depth',
      },
    };
  }
  account.balance = sellRes.newBalance;
  account.realizedPnl += sellRes.realizedPnlDelta;
  account.totalTrades += 1;
  account.winningTrades += sellRes.winningTradesDelta;
  account.losingTrades += sellRes.losingTradesDelta;
  logger.info(
    `[PaperExecutor] SELL ${sellRes.trade.quantity} ${symbol} @ $${sellRes.trade.executedPrice.toFixed(2)} (${sellRes.trade.status}) | P&L: $${sellRes.trade.pnl!.toFixed(2)}`,
  );
  return {
    result: { success: true, trade: sellRes.trade, account: { ...account } },
    trade: sellRes.trade,
    newPositions: sellRes.newPositions,
  };
}
