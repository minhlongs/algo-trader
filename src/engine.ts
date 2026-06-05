import { Order, OrderResult, OrderSide } from './types';

const MAX_QUANTITY = 1_000_000;
const MAX_PRICE = 1_000_000;

function deepCloneOrder(order: Order): Order {
  return { ...order, timestamp: new Date(order.timestamp) };
}

export class TradingEngine {
  private orders: Order[] = [];
  private orderCounter = 0;
  private isClearing = false;
  private executing = false;

  executeOrder(order: Order): OrderResult {
    if (this.executing) {
      return { success: false, error: 'Engine busy, retry later' };
    }

    if (!order.symbol || typeof order.symbol !== 'string' || order.symbol.trim() === '') {
      return { success: false, error: 'Symbol must be a non-empty string' };
    }

    if (typeof order.quantity !== 'number' || isNaN(order.quantity) || !isFinite(order.quantity)) {
      return { success: false, error: 'Quantity must be a finite number' };
    }
    if (order.quantity <= 0 || order.quantity > MAX_QUANTITY) {
      return { success: false, error: `Quantity must be between 0 and ${MAX_QUANTITY}` };
    }

    if (typeof order.price !== 'number' || isNaN(order.price) || !isFinite(order.price)) {
      return { success: false, error: 'Price must be a finite number' };
    }
    if (order.price <= 0 || order.price > MAX_PRICE) {
      return { success: false, error: `Price must be between 0 and ${MAX_PRICE}` };
    }

    if (!['buy', 'sell'].includes(order.side)) {
      return { success: false, error: 'Side must be "buy" or "sell"' };
    }

    this.executing = true;
    try {
      const orderId = `ORD-${Date.now()}-${this.orderCounter++}-${Math.random().toString(36).substring(2, 8)}`;
      const entry = { ...order, orderId, timestamp: new Date() };
      this.orders.push(entry);
      return { success: true, orderId };
    } finally {
      this.executing = false;
    }
  }

  getOrders(): readonly Order[] {
    return this.orders.map(o => ({ ...o, timestamp: new Date(o.timestamp) }));
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
