/**
 * Order Manager — type definitions for strategy consumption.
 */

/**
 * Result of an order submission. `filledSize` and `fillPrice` are present only
 * once the venue has confirmed a fill: a resting GTC order returns just the
 * order id, because resting is not filling. Callers must not treat a returned
 * order id as evidence that any quantity was executed.
 */
export interface PlaceOrderResult {
  id: string;
  /** Token quantity actually filled, as a decimal string. Absent until the venue confirms a fill. */
  filledSize?: string;
  /** Execution price of the confirmed fill. Absent until the venue confirms a fill. */
  fillPrice?: string;
  /** True once `filledSize` is a venue-confirmed fill rather than a resting order. */
  filled?: boolean;
}

export interface OrderManager {
  placeOrder(params: {
    tokenId: string;
    side: 'buy' | 'sell';
    price: string | number;
    size: string | number;
    orderType?: 'GTC' | 'GTD' | 'FOK' | 'IOC';
  }): Promise<PlaceOrderResult>;
  cancelOrder(orderId: string): Promise<void>;
  cancelAllOrders(tokenId?: string): Promise<void>;
  getOpenOrders(tokenId?: string): Promise<Array<{ id: string; side: string; price: number; size: number }>>;
}
