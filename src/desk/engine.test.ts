import { describe, it, expect, beforeEach } from 'vitest';
import { TradingEngine } from './engine';
import type { Order } from './core/types';

describe('TradingEngine', () => {
  let engine: TradingEngine;

  beforeEach(() => {
    engine = new TradingEngine();
  });

  it('should execute valid buy order', () => {
    const order: Order = {
      marketId: 'polymarket-election-2024',
      side: 'buy',
      price: '150.00',
      size: '100',
      type: 'limit',
    };

    const result = engine.executeOrder(order);

    expect(result.success).toBe(true);
    expect(result.orderId).toMatch(/^ORD-\d+-\d+-[a-z0-9]+$/);
  });

  it('should execute valid sell order', () => {
    const order: Order = {
      marketId: 'polymarket-election-2024',
      side: 'sell',
      price: '2800.00',
      size: '50',
      type: 'limit',
    };

    const result = engine.executeOrder(order);

    expect(result.success).toBe(true);
  });

  it('should reject order with zero quantity', () => {
    const order: Order = {
      marketId: 'polymarket-election-2024',
      side: 'buy',
      price: '150.00',
      size: '0',
      type: 'limit',
    };

    const result = engine.executeOrder(order);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Size must be between 0 and 1000000');
  });

  it('should reject order with negative quantity', () => {
    const order: Order = {
      marketId: 'polymarket-election-2024',
      side: 'buy',
      price: '150.00',
      size: '-10',
      type: 'limit',
    };

    const result = engine.executeOrder(order);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Size must be between 0 and 1000000');
  });

  it('should reject order with zero price', () => {
    const order: Order = {
      marketId: 'polymarket-election-2024',
      side: 'buy',
      price: '0',
      size: '100',
      type: 'limit',
    };

    const result = engine.executeOrder(order);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Price must be between 0 and 1000000');
  });

  it('should track executed orders', () => {
    const order1: Order = {
      marketId: 'polymarket-election-2024',
      side: 'buy',
      price: '150.00',
      size: '100',
      type: 'limit',
    };
    const order2: Order = {
      marketId: 'polymarket-election-2024',
      side: 'sell',
      price: '2800.00',
      size: '50',
      type: 'limit',
    };

    engine.executeOrder(order1);
    engine.executeOrder(order2);

    const orders = engine.getOrders();
    expect(orders).toHaveLength(2);
    expect(orders[0].marketId).toBe('polymarket-election-2024');
    expect(orders[1].marketId).toBe('polymarket-election-2024');
  });

  it('should clear orders', () => {
    const order: Order = {
      marketId: 'polymarket-election-2024',
      side: 'buy',
      price: '150.00',
      size: '100',
      type: 'limit',
    };

    engine.executeOrder(order);
    engine.clearOrders();

    expect(engine.getOrders()).toHaveLength(0);
  });
});
