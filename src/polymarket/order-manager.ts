/**
 * Order Manager — type definitions for strategy consumption.
 */

export interface OrderManager {
  /**
   * Place a limit order. Price and size are strings to match the Polymarket
   * CLOB SDK convention (avoids floating-point representation issues).
   * Returns an object with the assigned order id.
   */
  placeOrder(params: {
    tokenId: string;
    side: 'buy' | 'sell';
    price: string;
    size: string;
    orderType?: 'GTC' | 'GTD' | 'FOK' | 'IOC';
  }): Promise<{ id: string }>;
  cancelOrder(orderId: string): Promise<void>;
  cancelAllOrders(tokenId?: string): Promise<void>;
  getOpenOrders(tokenId?: string): Promise<Array<{ id: string; side: string; price: number; size: number }>>;
}
