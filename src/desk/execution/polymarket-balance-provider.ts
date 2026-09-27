/**
 * Polymarket Balance Provider
 * Computes collateral balances and token positions from LiveOrderManager and options.
 */

import { type ExchangeBalance } from '../arbitrage/connectors/types';
import type { LiveOrderManager } from './live-order-manager';
import type { PolymarketConnectorOptions } from './polymarket-connector-types';

export async function fetchPolymarketBalance(
  options: PolymarketConnectorOptions,
  liveOrderManager?: LiveOrderManager
): Promise<ExchangeBalance> {
  if (options.balanceProvider) {
    return options.balanceProvider();
  }

  const balances: ExchangeBalance = {};
  const defaultUsdc = options.defaultUsdcBalance ?? 10_000;
  let usedUsdc = 0;

  if (liveOrderManager) {
    for (const order of liveOrderManager.getActiveOrders()) {
      if (order.side === 'BUY' && (order.status === 'pending' || order.status === 'delayed')) {
        usedUsdc += order.size * order.price;
      }
    }

    const tracker = liveOrderManager.positionTracker;
    if (tracker && typeof tracker.getPositions === 'function') {
      for (const pos of tracker.getPositions()) {
        if (pos.size > 0) {
          balances[pos.tokenId] = {
            free: pos.size,
            used: 0,
            total: pos.size,
          };
        }
      }
    }
  }

  const freeUsdc = Math.max(0, defaultUsdc - usedUsdc);
  balances.USDC = {
    free: freeUsdc,
    used: usedUsdc,
    total: defaultUsdc,
  };

  return balances;
}
