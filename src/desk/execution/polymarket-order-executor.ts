/**
 * Polymarket Order Executor
 * Handles order validation, pricing heuristics, EIP-712 order construction, and submission.
 */

import {
  type ExchangeOrderParams,
  type ExchangeOrderResult,
  ExchangeOrderParamsSchema,
  OrderPlacementError,
  ExchangeConnectorError,
} from '../arbitrage/connectors/types';
import type { PolymarketAdapter } from './polymarket-adapter';
import type { LiveOrderManager } from './live-order-manager';
import type { PolymarketOrder } from './polymarket-signer';
import type { PolymarketTerminalCache } from './polymarket-terminal-cache';
import type { PolymarketConnectorOptions } from './polymarket-connector-types';
import { requireLiveEnabled } from './execution-mode';
import { logger } from '../../shared/utils/logger';

export async function executePolymarketOrder(
  params: ExchangeOrderParams,
  adapter: PolymarketAdapter,
  options: PolymarketConnectorOptions,
  cache: PolymarketTerminalCache,
  liveOrderManager?: LiveOrderManager
): Promise<ExchangeOrderResult> {
  const validated = ExchangeOrderParamsSchema.parse(params);
  if (options.dryRun === false) {
    requireLiveEnabled('PolymarketConnectorAdapter.placeOrder');
  }

  let execPrice = validated.price;
  if (validated.type === 'market' || execPrice === undefined) {
    execPrice = validated.side === 'buy' ? 0.99 : 0.01;
  }

  const expiration = Math.floor(Date.now() / 1000) + (options.defaultExpirationSec ?? 300);
  const nonce = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

  const polyOrder: PolymarketOrder = {
    tokenId: validated.symbol,
    price: execPrice,
    size: validated.amount,
    side: validated.side.toUpperCase() as 'BUY' | 'SELL',
    expiration,
    nonce,
    feeRateBps: options.defaultFeeRateBps ?? 0,
    signatureType: options.defaultSignatureType ?? 0,
  };

  try {
    let orderId: string;
    let isMatched = false;

    if (liveOrderManager) {
      const resp = await liveOrderManager.submitAndTrack(polyOrder);
      orderId = resp.orderID;
      isMatched = resp.status === 'matched';
    } else {
      const resp = await adapter.placeOrder(polyOrder);
      orderId = resp.orderID;
      isMatched = resp.status === 'matched';
    }

    cache.setOrderParams(orderId, validated);
    if (validated.clientOrderId) {
      cache.setClientOrderId(orderId, validated.clientOrderId);
    }

    const result: ExchangeOrderResult = {
      orderId,
      clientOrderId: validated.clientOrderId,
      exchange: 'polymarket',
      symbol: validated.symbol,
      side: validated.side,
      price: execPrice,
      amount: validated.amount,
      filled: isMatched ? validated.amount : 0,
      remaining: isMatched ? 0 : validated.amount,
      status: isMatched ? 'closed' : 'open',
      fee: { amount: 0, currency: 'USDC' },
      timestamp: Date.now(),
    };

    if (isMatched) {
      cache.setTerminalOrder(orderId, result);
    }
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[polymarket] placeOrder failed: ${msg}`, {
      symbol: validated.symbol,
      side: validated.side,
      amount: validated.amount,
      price: execPrice,
    });
    if (err instanceof ExchangeConnectorError) throw err;
    throw new OrderPlacementError(msg, 'polymarket');
  }
}
