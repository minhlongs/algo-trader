/**
 * Order ID Parser
 *
 * Centralizes order ID format parsing for NOWPayments integration.
 * Eliminates duplicated `parseCustomerRef` / `parseMarketplaceOrderId`
 * from nowpayments-service.ts.
 *
 * Formats:
 * - Internal:  `algotrade_{customerRef}_{timestamp}`
 * - Marketplace: `mp_{orderId}_{timestamp}`
 */

export interface InternalOrderInfo {
  customerRef: string;
  timestamp: number;
  raw: string;
}

export interface MarketplaceOrderInfo {
  listingId: string;
  tenantIdPrefix: string;
  timestamp: number;
  raw: string;
}

/**
 * Parse an internal-format order ID.
 *
 * @returns parsed info, or `null` if the order ID is not in internal format.
 */
export function parseInternalOrderId(orderId: string): InternalOrderInfo | null {
  const parts = orderId.split('_');
  if (parts.length < 3 || parts[0] !== 'algotrade') return null;
  const ts = parseInt(parts[parts.length - 1], 10);
  if (isNaN(ts)) return null;
  return {
    customerRef: parts.slice(1, -1).join('_'),
    timestamp: ts,
    raw: orderId,
  };
}

/**
 * Parse a marketplace-format order ID.
 *
 * @returns parsed info, or `null` if the order ID is not marketplace format.
 */
export function parseMarketplaceOrderId(orderId: string): MarketplaceOrderInfo | null {
  const parts = orderId.split('_');
  if (parts.length < 4 || parts[0] !== 'mp') return null;
  return {
    listingId: parts[1],
    tenantIdPrefix: parts[2],
    timestamp: parseInt(parts[parts.length - 1], 10) || 0,
    raw: orderId,
  };
}

/**
 * Check whether an order ID is in marketplace format.
 */
export function isMarketplaceOrderId(orderId: string): boolean {
  return orderId.startsWith('mp_');
}
