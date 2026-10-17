/**
 * Strategy Adapter — Types and pure signal/fill mapping helpers.
 */

import type { TradeSignal } from './strategy-live-bridge';

export interface EntryRequest {
  tokenId: string;
  conditionId: string;
  side: 'yes' | 'no';
  price: number;
  size: number;
  strategy?: string;
}

export interface ExitRequest {
  tokenId: string;
  conditionId: string;
  price: number;
  reason: string;
}

export interface AdapterFill {
  orderId: string;
  tokenId: string;
  conditionId: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  timestamp: number;
}

export function buildEntrySignal(strategyName: string, req: EntryRequest): TradeSignal {
  return {
    tokenId: req.tokenId,
    side: 'BUY',
    size: req.size,
    price: req.price,
    description: `${strategyName}:${req.conditionId.slice(0, 12)}`,
    confidence: 0.7,
    timestamp: Date.now(),
  };
}

export function buildExitSignal(
  strategyName: string,
  req: ExitRequest,
  positionSize: number,
): TradeSignal {
  return {
    tokenId: req.tokenId,
    side: 'SELL',
    size: positionSize,
    price: req.price,
    description: `${strategyName}:exit:${req.reason}`,
    confidence: 1.0,
    timestamp: Date.now(),
  };
}

export function buildAdapterFill(
  side: 'BUY' | 'SELL',
  tokenId: string,
  conditionId: string,
  price: number,
  size: number,
  orderId?: string,
): AdapterFill {
  return {
    orderId: orderId ?? `adapter-${Date.now()}`,
    tokenId,
    conditionId,
    side,
    price,
    size,
    timestamp: Date.now(),
  };
}

export function computeActiveFills(fills: AdapterFill[]): Map<string, AdapterFill> {
  const open = new Map<string, AdapterFill>();
  for (const fill of fills) {
    if (fill.side === 'BUY') {
      open.set(fill.conditionId, fill);
    } else {
      open.delete(fill.conditionId);
    }
  }
  return open;
}
