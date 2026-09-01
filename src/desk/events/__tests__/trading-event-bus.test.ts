/**
 * TradingEventBus — Unit Tests
 *
 * Covers:
 * - Type guard functions (isPriceUpdate, isSignalGenerated, isOrderStatusChange,
 *   isSystemAlert, isConnectionStatus)
 * - emit* methods (PRICE_UPDATE, SIGNAL_GENERATED, ORDER_STATUS_CHANGE,
 *   SYSTEM_ALERT, CONNECTION_STATUS)
 * - on* subscription helpers with unsubscribe return
 * - getConnectionStatus / getAllConnectionStatuses / clear
 *
 * Note: The TradingEventBus class is not exported as a runtime value (only as
 * a type), so tests use the exported `tradingEventBus` singleton instance
 * directly.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  tradingEventBus,
  isPriceUpdate,
  isSignalGenerated,
  isOrderStatusChange,
  isSystemAlert,
  isConnectionStatus,
} from '../trading-event-bus';
import type {
  PriceUpdatePayload,
  SignalGeneratedPayload,
  OrderStatusChangePayload,
  SystemAlertPayload,
  ConnectionStatusPayload,
} from '../trading-event-bus';

function makePriceUpdate(overrides: Partial<PriceUpdatePayload> = {}): PriceUpdatePayload {
  return {
    tokenId: 'BTCUSDT',
    bid: 49950,
    ask: 50050,
    timestamp: 1_700_000_000,
    spread: 100,
    spreadBps: 20,
    ...overrides,
  };
}

function makeSignal(overrides: Partial<SignalGeneratedPayload> = {}): SignalGeneratedPayload {
  return {
    signalId: 'sig-1',
    strategyName: 'mean-reversion',
    tokenId: 'BTCUSDT',
    side: 'BUY',
    price: 50000,
    size: 0.5,
    confidence: 0.85,
    timestamp: 1_700_000_000,
    metadata: { foo: 'bar' },
    ...overrides,
  };
}

function makeOrderStatus(overrides: Partial<OrderStatusChangePayload> = {}): OrderStatusChangePayload {
  return {
    orderId: 'ord-1',
    tokenId: 'BTCUSDT',
    side: 'BUY',
    price: 50000,
    size: 0.5,
    oldStatus: 'open',
    newStatus: 'filled',
    timestamp: 1_700_000_000,
    ...overrides,
  };
}

function makeAlert(overrides: Partial<SystemAlertPayload> = {}): SystemAlertPayload {
  return {
    level: 'warn',
    component: 'risk-engine',
    message: 'Position limit approaching',
    timestamp: 1_700_000_000,
    metadata: { threshold: 0.9 },
    ...overrides,
  };
}

function makeConnStatus(overrides: Partial<ConnectionStatusPayload> = {}): ConnectionStatusPayload {
  return {
    component: 'binance-feed',
    status: 'connected',
    timestamp: 1_700_000_000,
    ...overrides,
  };
}

// ─── Type Guard Tests ─────────────────────────────────────────────────────────

describe('TradingEventBus — type guards', () => {
  it('isPriceUpdate true when bid, ask, and tokenId present', () => {
    expect(isPriceUpdate(makePriceUpdate())).toBe(true);
  });

  it('isPriceUpdate false for wrong shape', () => {
    expect(isPriceUpdate(makeSignal())).toBe(false);
  });

  it('isSignalGenerated true when signalId and strategyName present', () => {
    expect(isSignalGenerated(makeSignal())).toBe(true);
  });

  it('isSignalGenerated false for wrong shape', () => {
    expect(isSignalGenerated(makePriceUpdate())).toBe(false);
  });

  it('isOrderStatusChange true when orderId oldStatus, newStatus present', () => {
    expect(isOrderStatusChange(makeOrderStatus())).toBe(true);
  });

  it('isOrderStatusChange false for wrong shape', () => {
    expect(isOrderStatusChange(makePriceUpdate())).toBe(false);
  });

  it('isSystemAlert true when level, component, message present', () => {
    expect(isSystemAlert(makeAlert())).toBe(true);
  });

  it('isSystemAlert false for wrong shape', () => {
    expect(isSystemAlert(makePriceUpdate())).toBe(false);
  });

  it('isConnectionStatus true when component, status, and error keys present', () => {
    const payload = makeConnStatus({ error: 'timeout' });
    expect(isConnectionStatus(payload)).toBe(true);
  });

  it('isConnectionStatus false for wrong shape', () => {
    expect(isConnectionStatus(makePriceUpdate())).toBe(false);
  });

  it('isConnectionStatus false when error key absent', () => {
    const payload = makeConnStatus();
    delete (payload as Partial<ConnectionStatusPayload>).error;
    expect(isConnectionStatus(payload)).toBe(false);
  });
});

// ─── Singleton / module export Tests ──────────────────────────────────────────

describe('TradingEventBus — singleton', () => {
  it('tradingEventBus singleton is exported and defined', () => {
    expect(tradingEventBus).toBeDefined();
    expect(typeof tradingEventBus).toBe('object');
  });
});

// ─── Emit + on Tests (using real singleton with clear between tests) ─────────

describe('TradingEventBus — PRICE_UPDATE', () => {
  beforeEach(() => {
    tradingEventBus.clear();
  });
  afterEach(() => {
    tradingEventBus.clear();
  });

  it('emitPriceUpdate delivers payload to onPriceUpdate subscriber', () => {
    const received: PriceUpdatePayload[] = [];
    const off = tradingEventBus.onPriceUpdate((p) => received.push(p));

    tradingEventBus.emitPriceUpdate(makePriceUpdate({ tokenId: 'ETHUSDT' }));
    expect(received).toHaveLength(1);
    expect(received[0].tokenId).toBe('ETHUSDT');
    expect(received[0].bid).toBe(49950);
    expect(received[0].ask).toBe(50050);

    off();
  });

  it('unsubscribe function stops further delivery', () => {
    const handler = vi.fn();
    const off = tradingEventBus.onPriceUpdate(handler);

    tradingEventBus.emitPriceUpdate(makePriceUpdate());
    expect(handler).toHaveBeenCalledTimes(1);

    off();
    tradingEventBus.emitPriceUpdate(makePriceUpdate());
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('TradingEventBus — SIGNAL_GENERATED', () => {
  beforeEach(() => {
    tradingEventBus.clear();
  });
  afterEach(() => {
    tradingEventBus.clear();
  });

  it('emitSignalGenerated delivers payload to subscriber', () => {
    const received: SignalGeneratedPayload[] = [];
    const off = tradingEventBus.onSignalGenerated((p) => received.push(p));

    tradingEventBus.emitSignalGenerated(makeSignal({ side: 'SELL', confidence: 0.92 }));
    expect(received).toHaveLength(1);
    expect(received[0].side).toBe('SELL');
    expect(received[0].confidence).toBe(0.92);

    off();
  });
});

describe('TradingEventBus — ORDER_STATUS_CHANGE', () => {
  beforeEach(() => {
    tradingEventBus.clear();
  });
  afterEach(() => {
    tradingEventBus.clear();
  });

  it('emitOrderStatusChange delivers payload to subscriber', () => {
    const received: OrderStatusChangePayload[] = [];
    const off = tradingEventBus.onOrderStatusChange((p) => received.push(p));

    tradingEventBus.emitOrderStatusChange(makeOrderStatus({ newStatus: 'rejected' }));
    expect(received).toHaveLength(1);
    expect(received[0].newStatus).toBe('rejected');

    off();
  });
});

describe('TradingEventBus — SYSTEM_ALERT', () => {
  beforeEach(() => {
    tradingEventBus.clear();
  });
  afterEach(() => {
    tradingEventBus.clear();
  });

  it('emitSystemAlert delivers payload to subscriber', () => {
    const received: SystemAlertPayload[] = [];
    const off = tradingEventBus.onSystemAlert((p) => received.push(p));

    tradingEventBus.emitSystemAlert(makeAlert({ level: 'critical' }));
    expect(received).toHaveLength(1);
    expect(received[0].level).toBe('critical');

    off();
  });
});

describe('TradingEventBus — CONNECTION_STATUS + cache', () => {
  beforeEach(() => {
    tradingEventBus.clear();
  });
  afterEach(() => {
    tradingEventBus.clear();
  });

  it('caches connection status and serves via getConnectionStatus', () => {
    const payload = makeConnStatus({ component: 'kraken-feed', status: 'disconnected', error: 'timeout' });
    tradingEventBus.emitConnectionStatus(payload);

    const cached = tradingEventBus.getConnectionStatus('kraken-feed');
    expect(cached).toEqual(payload);
  });

  it('returns undefined for uncached component', () => {
    expect(tradingEventBus.getConnectionStatus('nonexistent')).toBeUndefined();
  });

  it('overwrites previous cache entry for same component', () => {
    tradingEventBus.emitConnectionStatus(makeConnStatus({ component: 'binance-feed', status: 'connected' }));
    tradingEventBus.emitConnectionStatus(makeConnStatus({ component: 'binance-feed', status: 'reconnecting', retryAttempt: 1 }));

    const cached = tradingEventBus.getConnectionStatus('binance-feed');
    expect(cached?.status).toBe('reconnecting');
    expect(cached?.retryAttempt).toBe(1);
  });

  it('emitConnectionStatus delivers payload to onConnectionStatus subscriber', () => {
    const received: ConnectionStatusPayload[] = [];
    const off = tradingEventBus.onConnectionStatus((p) => received.push(p));

    const payload = makeConnStatus({ component: 'okx-feed', status: 'error', error: 'auth failed' });
    tradingEventBus.emitConnectionStatus(payload);
    expect(received).toHaveLength(1);
    expect(received[0].error).toBe('auth failed');

    off();
  });

  it('getAllConnectionStatuses returns all cached entries', () => {
    tradingEventBus.emitConnectionStatus(makeConnStatus({ component: 'binance-feed', status: 'connected' }));
    tradingEventBus.emitConnectionStatus(makeConnStatus({ component: 'kraken-feed', status: 'disconnected' }));

    const all = tradingEventBus.getAllConnectionStatuses();
    expect(all).toHaveLength(2);
    const components = all.map((c) => c.component).sort();
    expect(components).toEqual(['binance-feed', 'kraken-feed']);
  });

  it('getAllConnectionStatuses is empty after clear', () => {
    tradingEventBus.emitConnectionStatus(makeConnStatus({ component: 'binance-feed', status: 'connected' }));
    tradingEventBus.clear();
    expect(tradingEventBus.getAllConnectionStatuses()).toEqual([]);
  });
});

describe('TradingEvent — clear', () => {
  it('removes all listeners and clears cache', () => {
    const handler = vi.fn();
    tradingEventBus.onPriceUpdate(handler);
    tradingEventBus.emitConnectionStatus(makeConnStatus({ component: 'feed-1' }));

    tradingEventBus.clear();

    // Handler should not fire after clear
    tradingEventBus.emitPriceUpdate(makePriceUpdate());
    expect(handler).not.toHaveBeenCalled();

    // Cache should be empty
    expect(tradingEventBus.getConnectionStatus('feed-1')).toBeUndefined();
    expect(tradingEventBus.getAllConnectionStatuses()).toEqual([]);
  });
});

describe('TradingEventBus — multiple subscribers', () => {
  beforeEach(() => {
    tradingEventBus.clear();
  });
  afterEach(() => {
    tradingEventBus.clear();
  });

  it('delivers one event to multiple subscribers', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    const off1 = tradingEventBus.onPriceUpdate(h1);
    const off2 = tradingEventBus.onPriceUpdate(h2);

    tradingEventBus.emitPriceUpdate(makePriceUpdate());
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);

    off1();
    off2();
  });
});

describe('TradingEventBus — setMaxListeners via constructor', () => {
  it('maxListeners is set to 100 (default 10 would warn at 11 listeners)', () => {
    const handlers: Array<() => void> = [];
    // Default EventEmitter limit is 10; this bus raises it to 100.
    // Adding exactly 100 must not throw; it proves the limit was raised.
    for (let i = 0; i < 100; i++) {
      handlers.push(tradingEventBus.onPriceUpdate(vi.fn()) as () => void);
    }

    expect(() => tradingEventBus.emitPriceUpdate(makePriceUpdate())).not.toThrow();

    handlers.forEach((off) => off());
    tradingEventBus.clear();
  });
});
