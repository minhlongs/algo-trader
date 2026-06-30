import { Order, OrderSide as _OrderSide, OrderStatus as _OrderStatus } from './core/types';

const MAX_PRICE = 1_000_000;
const MAX_SIZE = 1_000_000;

function cloneOrder(order: Order): Order {
  return { ...order };
}

export class TradingEngine {
  private orders: Order[] = [];
  private orderCounter = 0;
  private isClearing = false;
  private executing = false;

  executeOrder(order: Order): { success: boolean; orderId?: string; error?: string } {
    if (this.executing) {
      return { success: false, error: 'Engine busy, retry later' };
    }

    const priceNum = parseFloat(order.price);
    const sizeNum = parseFloat(order.size);

    if (!order.marketId || typeof order.marketId !== 'string' || order.marketId.trim() === '') {
      return { success: false, error: 'marketId must be a non-empty string' };
    }
    if (typeof order.side !== 'string' || !['buy', 'sell'].includes(order.side)) {
      return { success: false, error: 'Side must be "buy" or "sell"' };
    }
    if (isNaN(priceNum) || !isFinite(priceNum) || priceNum <= 0 || priceNum > MAX_PRICE) {
      return { success: false, error: `Price must be between 0 and ${MAX_PRICE}` };
    }
    if (isNaN(sizeNum) || !isFinite(sizeNum) || sizeNum <= 0 || sizeNum > MAX_SIZE) {
      return { success: false, error: `Size must be between 0 and ${MAX_SIZE}` };
    }

    this.executing = true;
    try {
      const orderId = `ORD-${Date.now()}-${this.orderCounter++}-${Math.random().toString(36).substring(2, 8)}`;
      const entry: Order = {
        ...order,
        id: orderId,
        status: 'pending',
        createdAt: Date.now(),
      };
      this.orders.push(entry);
      return { success: true, orderId };
    } finally {
      this.executing = false;
    }
  }

  getOrders(): readonly Order[] {
    return this.orders.map(o => cloneOrder(o));
  }

  clearOrders(): void {
    if (this.executing) return;
    this.isClearing = true;
    try {
      this.orders = [];
    } finally {
      this.isClearing = false;
    }
  }
}
