import { describe, it, expect } from 'vitest';
import { OrderBookMicrostructureEngine } from '../../../../src/desk/data/orderbook-microstructure-engine';

describe('OrderBookMicrostructureEngine', () => {
  it('computes micro-price weighted by top-of-book depth', () => {
    const engine = new OrderBookMicrostructureEngine();
    // Quote with heavy bid size: micro-price should skew towards ask price
    const quote = {
      bidPrice: 0.50,
      askPrice: 0.52,
      bidSize: 300,
      askSize: 100,
      timestamp: Date.now(),
    };

    const metrics = engine.processQuote('pres-yes', quote);
    expect(metrics.midPrice).toBe(0.51);
    // microPrice = (0.50 * 100 + 0.52 * 300) / 400 = (50 + 156) / 400 = 0.515
    expect(metrics.microPrice).toBeCloseTo(0.515, 4);
    expect(metrics.spread).toBeCloseTo(0.02, 4);
  });

  it('calculates order flow imbalance across quote ticks', () => {
    const engine = new OrderBookMicrostructureEngine();
    const t0 = Date.now();

    engine.processQuote('poly-btc', {
      bidPrice: 0.60,
      askPrice: 0.62,
      bidSize: 100,
      askSize: 100,
      timestamp: t0,
    });

    // Bid price stays same, bid size increases from 100 to 250 (+150 OFI)
    const m2 = engine.processQuote('poly-btc', {
      bidPrice: 0.60,
      askPrice: 0.62,
      bidSize: 250,
      askSize: 100,
      timestamp: t0 + 1000,
    });

    expect(m2.orderFlowImbalance).toBe(150);
    expect(m2.rollingOfi).toBe(75);
  });
});
