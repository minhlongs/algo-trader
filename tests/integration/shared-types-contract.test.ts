/**
 * Shared Types Contract Tests
 *
 * Verify the type contracts that desk and platform depend on.
 * These tests pass BEFORE modules move to shared/.
 *
 * Uses structural checks (runtime + compile-time) — no mocking needed.
 */

import { describe, it, expect, expectTypeOf } from 'vitest';
import { LicenseTier, LicenseStatus } from '../../src/shared/types/license';
import type { License } from '../../src/shared/types/license';
import type { MarketInfo, Order } from '../../src/desk/core/types';
import type { IStrategy, ISignal, ICandle } from '../../src/desk/interfaces/IStrategy';
import type { MarketType, OrderSide, OrderStatus } from '../../src/desk/core/types';

// ---------------------------------------------------------------------------
// Helpers: factory functions that produce objects satisfying each interface.
// These also serve as compile-time checks — if an interface changes incompatibly,
// these factories will fail to compile.
// ---------------------------------------------------------------------------

function makeLicense(overrides: Partial<License> = {}): License {
  return {
    id: 'lic-001',
    name: 'Test License',
    key: 'sk_test_abc123',
    tier: LicenseTier.PRO,
    status: LicenseStatus.ACTIVE,
    createdAt: '2026-01-01T00:00:00.000Z',
    usageCount: 0,
    ...overrides,
  };
}

function makeMarketInfo(overrides: Partial<MarketInfo> = {}): MarketInfo {
  return {
    id: 'mkt-001',
    symbol: 'BTC-USDT',
    type: 'cex',
    exchange: 'binance',
    baseCurrency: 'BTC',
    quoteCurrency: 'USDT',
    active: true,
    ...overrides,
  };
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'ord-001',
    marketId: 'mkt-001',
    side: 'buy',
    price: '50000.00',
    size: '0.01',
    status: 'open',
    type: 'limit',
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeSignal(overrides: Partial<ISignal> = {}): ISignal {
  return {
    action: 'buy',
    confidence: 0.85,
    reason: 'Strong momentum signal',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test: LicenseTier enum
// ---------------------------------------------------------------------------

describe('LicenseTier enum', () => {
  it('has exactly the five expected values', () => {
    const values = Object.values(LicenseTier);
    expect(values).toContain('FREE');
    expect(values).toContain('STARTER');
    expect(values).toContain('PRO');
    expect(values).toContain('ENTERPRISE');
    expect(values).toContain('MASTER');
    expect(values).toHaveLength(5);
  });

  it('maps string keys to correct values', () => {
    expect(LicenseTier.FREE).toBe('FREE');
    expect(LicenseTier.STARTER).toBe('STARTER');
    expect(LicenseTier.PRO).toBe('PRO');
    expect(LicenseTier.ENTERPRISE).toBe('ENTERPRISE');
    expect(LicenseTier.MASTER).toBe('MASTER');
  });

  it('contains no unexpected keys (boundary)', () => {
    const allowed = new Set(['FREE', 'STARTER', 'PRO', 'ENTERPRISE', 'MASTER']);
    for (const v of Object.values(LicenseTier)) {
      expect(allowed.has(v as string)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Test: LicenseStatus enum
// ---------------------------------------------------------------------------

describe('LicenseStatus enum', () => {
  it('has exactly the three expected values', () => {
    const values = Object.values(LicenseStatus);
    expect(values).toContain('active');
    expect(values).toContain('expired');
    expect(values).toContain('revoked');
    expect(values).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Test: License interface structural shape
// ---------------------------------------------------------------------------

describe('License interface', () => {
  it('has all required fields with correct runtime types', () => {
    const lic = makeLicense();

    // Required fields must be present
    expect(lic).toHaveProperty('id');
    expect(lic).toHaveProperty('name');
    expect(lic).toHaveProperty('key');
    expect(lic).toHaveProperty('tier');
    expect(lic).toHaveProperty('status');
    expect(lic).toHaveProperty('createdAt');
    expect(lic).toHaveProperty('usageCount');

    // Type checks
    expect(typeof lic.id).toBe('string');
    expect(typeof lic.name).toBe('string');
    expect(typeof lic.key).toBe('string');
    expect(typeof lic.createdAt).toBe('string');
    expect(typeof lic.usageCount).toBe('number');
  });

  it('accepts valid tier values', () => {
    // Compile-time: LicenseTier enum variant assignment
    const free: License = makeLicense({ tier: LicenseTier.FREE });
    expect(free.tier).toBe('FREE');

    const pro: License = makeLicense({ tier: LicenseTier.PRO });
    expect(pro.tier).toBe('PRO');

    const enterprise: License = makeLicense({ tier: LicenseTier.ENTERPRISE });
    expect(enterprise.tier).toBe('ENTERPRISE');
  });

  it('accepts valid status values', () => {
    // Compile-time: LicenseStatus enum variant assignment
    const active: License = makeLicense({ status: LicenseStatus.ACTIVE });
    expect(active.status).toBe('active');

    const expired: License = makeLicense({ status: LicenseStatus.EXPIRED });
    expect(expired.status).toBe('expired');

    const revoked: License = makeLicense({ status: LicenseStatus.REVOKED });
    expect(revoked.status).toBe('revoked');
  });

  it('allows optional fields to be set or omitted', () => {
    // Without optional fields (uses factory defaults which omit them)
    const minimal = makeLicense();
    expect(minimal.expiresAt).toBeUndefined();
    expect(minimal.maxUsage).toBeUndefined();

    // With optional fields
    const full = makeLicense({
      expiresAt: '2027-01-01T00:00:00.000Z',
      maxUsage: 1000,
      domain: 'example.com',
      overageAllowed: true,
    });
    expect(full.expiresAt).toBe('2027-01-01T00:00:00.000Z');
    expect(full.maxUsage).toBe(1000);
    expect(full.domain).toBe('example.com');
    expect(full.overageAllowed).toBe(true);
  });

  it('usageCount is a number (boundary — zero and large values)', () => {
    const zero = makeLicense({ usageCount: 0 });
    expect(zero.usageCount).toBe(0);

    const large = makeLicense({ usageCount: 1_000_000 });
    expect(large.usageCount).toBe(1_000_000);
  });
});

// ---------------------------------------------------------------------------
// Test: MarketInfo interface
// ---------------------------------------------------------------------------

describe('MarketInfo interface', () => {
  it('has all required fields', () => {
    const mkt = makeMarketInfo();

    expect(mkt).toHaveProperty('id');
    expect(mkt).toHaveProperty('symbol');
    expect(mkt).toHaveProperty('type');
    expect(mkt).toHaveProperty('exchange');
    expect(mkt).toHaveProperty('baseCurrency');
    expect(mkt).toHaveProperty('quoteCurrency');
    expect(mkt).toHaveProperty('active');

    expect(typeof mkt.id).toBe('string');
    expect(typeof mkt.symbol).toBe('string');
    expect(typeof mkt.exchange).toBe('string');
    expect(typeof mkt.baseCurrency).toBe('string');
    expect(typeof mkt.quoteCurrency).toBe('string');
    expect(typeof mkt.active).toBe('boolean');
  });

  it('type field accepts only valid MarketType values', () => {
    // Compile-time: MarketType union assignment
    const polymarket: MarketInfo = makeMarketInfo({ type: 'polymarket' });
    expect(polymarket.type).toBe('polymarket');

    const cex: MarketInfo = makeMarketInfo({ type: 'cex' });
    expect(cex.type).toBe('cex');

    const dex: MarketInfo = makeMarketInfo({ type: 'dex' });
    expect(dex.type).toBe('dex');
  });

  it('active field is boolean', () => {
    const active = makeMarketInfo({ active: true });
    expect(active.active).toBe(true);

    const inactive = makeMarketInfo({ active: false });
    expect(inactive.active).toBe(false);
  });

  it('exchange field is a non-empty string (boundary)', () => {
    const mkt = makeMarketInfo({ exchange: 'binance' });
    expect(mkt.exchange.length).toBeGreaterThan(0);
    expect(typeof mkt.exchange).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// Test: Order interface
// ---------------------------------------------------------------------------

describe('Order interface', () => {
  it('has all required fields', () => {
    const order = makeOrder();

    expect(order).toHaveProperty('id');
    expect(order).toHaveProperty('marketId');
    expect(order).toHaveProperty('side');
    expect(order).toHaveProperty('price');
    expect(order).toHaveProperty('size');
    expect(order).toHaveProperty('status');
    expect(order).toHaveProperty('type');
    expect(order).toHaveProperty('createdAt');

    expect(typeof order.id).toBe('string');
    expect(typeof order.marketId).toBe('string');
    expect(typeof order.price).toBe('string');
    expect(typeof order.size).toBe('string');
    expect(typeof order.createdAt).toBe('number');
  });

  it('side field accepts only buy | sell', () => {
    const buy: Order = makeOrder({ side: 'buy' });
    expect(buy.side).toBe('buy');

    const sell: Order = makeOrder({ side: 'sell' });
    expect(sell.side).toBe('sell');
  });

  it('status field accepts all valid OrderStatus values', () => {
    const validStatuses: OrderStatus[] = [
      'pending',
      'open',
      'filled',
      'partially_filled',
      'cancelled',
      'rejected',
    ];

    for (const s of validStatuses) {
      const order = makeOrder({ status: s });
      expect(order.status).toBe(s);
    }
  });

  it('type field accepts limit | market', () => {
    const limit: Order = makeOrder({ type: 'limit' });
    expect(limit.type).toBe('limit');

    const market: Order = makeOrder({ type: 'market' });
    expect(market.type).toBe('market');
  });

  it('price and size are decimal strings (boundary)', () => {
    const order = makeOrder({ price: '0.00000001', size: '999999.99999999' });
    expect(order.price).toBe('0.00000001');
    expect(order.size).toBe('999999.99999999');
    // Must remain strings — no implicit coercion
    expect(typeof order.price).toBe('string');
    expect(typeof order.size).toBe('string');
  });

  it('createdAt is a timestamp number (boundary)', () => {
    const past = makeOrder({ createdAt: 0 });
    expect(past.createdAt).toBe(0);

    const future = makeOrder({ createdAt: 9999999999999 });
    expect(future.createdAt).toBe(9999999999999);
  });
});

// ---------------------------------------------------------------------------
// Test: IStrategy interface — method contracts
// ---------------------------------------------------------------------------

describe('IStrategy interface', () => {
  /**
   * Create a minimal valid IStrategy implementation.
   * This also serves as a compile-time check: if IStrategy changes its
   * required method signatures, this factory will fail to compile.
   */
  function makeStrategy(overrides: Partial<IStrategy> = {}): IStrategy {
    return {
      getName: () => 'test-strategy',
      initialize: async () => {},
      execute: async (_candles: ICandle[]) => ({ action: 'wait', confidence: 0, reason: 'no-op' }),
      ...overrides,
    };
  }

  it('getName returns a string', () => {
    const strat = makeStrategy();
    const name = strat.getName();
    expect(typeof name).toBe('string');
    expect(name.length).toBeGreaterThan(0);
  });

  it('initialize returns a Promise<void>', async () => {
    const strat = makeStrategy();
    const result = strat.initialize();
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBeUndefined();
  });

  it('execute accepts candles array and returns Promise<ISignal>', async () => {
    const strat = makeStrategy();
    const candles: ICandle[] = [
      { timestamp: 1000, open: 100, high: 105, low: 99, close: 102, volume: 1000 },
    ];
    const signal = await strat.execute(candles);
    expect(signal).toHaveProperty('action');
    expect(signal).toHaveProperty('confidence');
    expect(signal).toHaveProperty('reason');
  });

  it('train is optional but callable when provided', async () => {
    // Strategy without train
    const withoutTrain = makeStrategy();
    expect(withoutTrain.train).toBeUndefined();

    // Strategy with train
    let trained = false;
    const withTrain = makeStrategy({
      train: async (_candles: ICandle[]) => {
        trained = true;
      },
    });
    expect(withTrain.train).toBeDefined();

    await withTrain.train!([]);
    expect(trained).toBe(true);
  });

  it('getStatus is optional but callable when provided', () => {
    const without = makeStrategy();
    expect(without.getStatus).toBeUndefined();

    const withStatus = makeStrategy({
      getStatus: () => ({ uptime: 3600, trades: 42 }),
    });
    expect(withStatus.getStatus).toBeDefined();

    const status = withStatus.getStatus!();
    expect(status).toEqual({ uptime: 3600, trades: 42 });
  });

  it('dispose is optional but callable when provided', () => {
    const without = makeStrategy();
    expect(without.dispose).toBeUndefined();

    let disposed = false;
    const withDispose = makeStrategy({
      dispose: () => {
        disposed = true;
      },
    });
    expect(withDispose.dispose).toBeDefined();

    withDispose.dispose!();
    expect(disposed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test: ISignal interface
// ---------------------------------------------------------------------------

describe('ISignal interface', () => {
  it('has required fields: action, confidence, reason', () => {
    const signal = makeSignal();
    expect(signal).toHaveProperty('action');
    expect(signal).toHaveProperty('confidence');
    expect(signal).toHaveProperty('reason');
  });

  it('action can only be buy | sell | wait', () => {
    const validActions = ['buy', 'sell', 'wait'] as const;
    for (const a of validActions) {
      const signal: ISignal = makeSignal({ action: a });
      expect(signal.action).toBe(a);
    }
  });

  it('action is a valid string from the set (runtime guard)', () => {
    const signal = makeSignal({ action: 'sell' });
    expect(['buy', 'sell', 'wait']).toContain(signal.action);
  });

  it('confidence is a number between 0 and 1 (boundary)', () => {
    const min: ISignal = makeSignal({ confidence: 0 });
    expect(min.confidence).toBe(0);

    const max: ISignal = makeSignal({ confidence: 1 });
    expect(max.confidence).toBe(1);

    expect(typeof makeSignal().confidence).toBe('number');
  });

  it('reason is a non-empty string', () => {
    const signal = makeSignal({ reason: 'Price crossed upper Bollinger band' });
    expect(typeof signal.reason).toBe('string');
    expect(signal.reason.length).toBeGreaterThan(0);
  });

  it('metadata is optional and accepts arbitrary key-value pairs', () => {
    const without = makeSignal();
    expect(without.metadata).toBeUndefined();

    const withMeta: ISignal = makeSignal({
      metadata: { indicator: 'RSI', value: 72.5, tags: ['overbought'] },
    });
    expect(withMeta.metadata).toEqual({
      indicator: 'RSI',
      value: 72.5,
      tags: ['overbought'],
    });
  });

  it('wait action can have zero confidence (boundary)', () => {
    const signal: ISignal = makeSignal({ action: 'wait', confidence: 0, reason: 'no opportunity' });
    expect(signal.action).toBe('wait');
    expect(signal.confidence).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test: ICandle interface
// ---------------------------------------------------------------------------

describe('ICandle interface', () => {
  it('has all required OHLCV fields', () => {
    const candle: ICandle = {
      timestamp: 1719000000000,
      open: 50000,
      high: 51000,
      low: 49500,
      close: 50500,
      volume: 1234.56,
    };

    expect(candle).toHaveProperty('timestamp');
    expect(candle).toHaveProperty('open');
    expect(candle).toHaveProperty('high');
    expect(candle).toHaveProperty('low');
    expect(candle).toHaveProperty('close');
    expect(candle).toHaveProperty('volume');

    expect(typeof candle.timestamp).toBe('number');
    expect(typeof candle.open).toBe('number');
    expect(typeof candle.high).toBe('number');
    expect(typeof candle.low).toBe('number');
    expect(typeof candle.close).toBe('number');
    expect(typeof candle.volume).toBe('number');
  });

  it('high >= low (logical boundary)', () => {
    const candle: ICandle = {
      timestamp: 1719000000000,
      open: 100,
      high: 110,
      low: 90,
      close: 105,
      volume: 500,
    };
    expect(candle.high).toBeGreaterThanOrEqual(candle.low);
  });
});
